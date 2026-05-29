package tasks

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net"
	"net/http"
	"net/textproto"
	"path/filepath"
	"reflect"
	"strings"

	"museforge/internal/redact"
	"museforge/internal/storage"
)

type Worker struct {
	repo        *Repository
	store       *storage.Local
	upstream    *upstreamImageClient
	assets      *assetSaver
	concurrency int
	wake        chan struct{}
}

func NewWorker(repo *Repository, store *storage.Local, concurrency int, defaultAPIKey string) *Worker {
	if concurrency <= 0 {
		concurrency = 1
	}
	upstream := newUpstreamImageClient(defaultAPIKey)
	return &Worker{
		repo:        repo,
		store:       store,
		concurrency: concurrency,
		upstream:    upstream,
		assets:      newAssetSaver(repo, store, upstream),
		wake:        make(chan struct{}, 1),
	}
}

func (w *Worker) executeGeneration(ctx context.Context, work *TaskWork) error {
	var params map[string]any
	if len(work.Params) > 0 {
		if err := json.Unmarshal(work.Params, &params); err != nil {
			return err
		}
	}
	if params == nil {
		params = map[string]any{}
	}
	params["model"] = work.Model
	params["prompt"] = work.Prompt

	requestedImages := requestedImageCount(params)
	respBody, err := w.callGenerationUpstream(ctx, work, params)
	if err != nil {
		return err
	}
	savedCount, err := w.assets.saveImageResponse(ctx, work.ID, 0, requestedImages, respBody)
	if err != nil {
		return err
	}
	for savedCount < requestedImages {
		nextParams := cloneParams(params)
		nextParams["n"] = 1
		respBody, err := w.callGenerationUpstream(ctx, work, nextParams)
		if err != nil {
			return err
		}
		count, err := w.assets.saveImageResponse(ctx, work.ID, savedCount, requestedImages-savedCount, respBody)
		if err != nil {
			return err
		}
		if count == 0 {
			return errors.New("upstream response did not contain images")
		}
		savedCount += count
	}
	return nil
}

func (w *Worker) callGenerationUpstream(ctx context.Context, work *TaskWork, params map[string]any) ([]byte, error) {
	return w.upstream.postJSON(ctx, work.BaseURL, work.APIKey, "/images/generations", params)
}

type storedUpload struct {
	StorageKey string `json:"storage_key"`
	Filename   string `json:"filename"`
	MIME       string `json:"mime"`
}

type editParams struct {
	Fields map[string]string `json:"fields"`
	Images []storedUpload    `json:"images"`
	Mask   storedUpload      `json:"mask,omitempty"`
}

func (w *Worker) executeEdit(ctx context.Context, work *TaskWork) error {
	var params editParams
	if len(work.Params) > 0 {
		if err := json.Unmarshal(work.Params, &params); err != nil {
			return err
		}
	}
	if len(params.Images) == 0 {
		return errors.New("edit task has no uploaded images")
	}

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	fields := params.Fields
	if fields == nil {
		fields = map[string]string{}
	}
	fields["model"] = work.Model
	fields["prompt"] = work.Prompt
	for key, value := range fields {
		if err := writer.WriteField(key, value); err != nil {
			return err
		}
	}
	for _, upload := range params.Images {
		if err := w.writeStoredFile(writer, "image[]", upload); err != nil {
			return err
		}
	}
	if params.Mask.StorageKey != "" {
		if err := w.writeStoredFile(writer, "mask", params.Mask); err != nil {
			return err
		}
	}
	if err := writer.Close(); err != nil {
		return err
	}

	respBody, err := w.upstream.postMultipart(ctx, work.BaseURL, work.APIKey, "/images/edits", body, writer.FormDataContentType())
	if err != nil {
		return err
	}
	_, err = w.assets.saveImageResponse(ctx, work.ID, 0, 0, respBody)
	return err
}

func requestedImageCount(params map[string]any) int {
	count := intFromAny(params["n"])
	if count < 1 {
		return 1
	}
	if count > maxImagesPerTask {
		return maxImagesPerTask
	}
	return count
}

func intFromAny(value any) int {
	switch v := value.(type) {
	case int:
		return v
	case int8:
		return int(v)
	case int16:
		return int(v)
	case int32:
		return int(v)
	case int64:
		return int(v)
	case uint:
		return int(v)
	case uint8:
		return int(v)
	case uint16:
		return int(v)
	case uint32:
		return int(v)
	case uint64:
		if v > uint64(^uint(0)>>1) {
			return 0
		}
		return int(v)
	case float32:
		return int(v)
	case float64:
		return int(v)
	case json.Number:
		parsed, err := v.Int64()
		if err == nil {
			return int(parsed)
		}
		floatValue, err := v.Float64()
		if err == nil {
			return int(floatValue)
		}
	}
	rv := reflect.ValueOf(value)
	if rv.IsValid() && rv.Kind() >= reflect.Int && rv.Kind() <= reflect.Int64 {
		return int(rv.Int())
	}
	return 0
}

func cloneParams(params map[string]any) map[string]any {
	next := make(map[string]any, len(params))
	for key, value := range params {
		next[key] = value
	}
	return next
}

func (w *Worker) writeStoredFile(writer *multipart.Writer, fieldName string, upload storedUpload) error {
	file, err := w.store.Open(upload.StorageKey)
	if err != nil {
		return err
	}
	defer file.Close()

	filename := upload.Filename
	if filename == "" {
		filename = filepath.Base(upload.StorageKey)
	}
	contentType := upload.MIME
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	header := make(textproto.MIMEHeader)
	header.Set("Content-Disposition", fmt.Sprintf(`form-data; name="%s"; filename="%s"`, escapeQuotes(fieldName), escapeQuotes(filename)))
	header.Set("Content-Type", contentType)
	part, err := writer.CreatePart(header)
	if err != nil {
		return err
	}
	_, err = io.Copy(part, file)
	return err
}

func summarizeUpstreamError(body []byte) string {
	var decoded struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(body, &decoded); err == nil && strings.TrimSpace(decoded.Error.Message) != "" {
		return redact.String(strings.TrimSpace(decoded.Error.Message))
	}
	text := strings.TrimSpace(string(body))
	if len(text) > 1000 {
		return text[:1000] + "...<truncated>"
	}
	return redact.String(text)
}

func sanitizeError(err error) string {
	msg := strings.TrimSpace(err.Error())
	if msg == "" {
		return "Unknown error."
	}
	return redact.String(msg)
}

type retryableError struct {
	err error
}

func (e retryableError) Error() string {
	return e.err.Error()
}

func (e retryableError) Unwrap() error {
	return e.err
}

type upstreamError struct {
	status  int
	message string
}

func (e upstreamError) Error() string {
	if e.message == "" {
		return fmt.Sprintf("upstream HTTP %d", e.status)
	}
	return fmt.Sprintf("upstream HTTP %d: %s", e.status, e.message)
}

func isRetryable(err error) bool {
	var retry retryableError
	if errors.As(err, &retry) {
		return true
	}
	var upstream upstreamError
	if errors.As(err, &upstream) {
		return upstream.status == http.StatusTooManyRequests || upstream.status >= 500
	}
	var netErr net.Error
	return errors.As(err, &netErr)
}

func normalizeBearerToken(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	if strings.HasPrefix(strings.ToLower(value), "bearer ") {
		return value
	}
	return "Bearer " + value
}

func escapeQuotes(value string) string {
	return strings.NewReplacer("\\", "\\\\", "\"", "\\\"").Replace(value)
}
