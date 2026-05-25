package tasks

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime/multipart"
	"net"
	"net/http"
	"net/textproto"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"time"

	"museforge/internal/redact"
	"museforge/internal/storage"
)

type Worker struct {
	repo          *Repository
	store         *storage.Local
	client        *http.Client
	concurrency   int
	defaultAPIKey string
	wake          chan struct{}
}

func NewWorker(repo *Repository, store *storage.Local, concurrency int, defaultAPIKey string) *Worker {
	if concurrency <= 0 {
		concurrency = 1
	}
	return &Worker{
		repo:          repo,
		store:         store,
		concurrency:   concurrency,
		defaultAPIKey: defaultAPIKey,
		wake:          make(chan struct{}, 1),
		client: &http.Client{
			Timeout: 300 * time.Second,
		},
	}
}

func (w *Worker) Start(ctx context.Context) {
	var wg sync.WaitGroup
	for i := 0; i < w.concurrency; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			w.loop(ctx)
		}()
	}
	go func() {
		<-ctx.Done()
		wg.Wait()
	}()
}

func (w *Worker) Wake() {
	select {
	case w.wake <- struct{}{}:
	default:
	}
}

func (w *Worker) loop(ctx context.Context) {
	timer := time.NewTimer(0)
	defer timer.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-w.wake:
		case <-timer.C:
		}

		for {
			work, err := w.repo.ClaimNextQueued(ctx)
			if err != nil {
				sleep(timer, 2*time.Second)
				break
			}
			if work == nil {
				sleep(timer, 2*time.Second)
				break
			}
			w.runOne(ctx, work)
		}
	}
}

func (w *Worker) runOne(ctx context.Context, work *TaskWork) {
	startedAt := time.Now()
	slog.Info("task started", "task_id", work.ID, "task_type", work.Type, "model", work.Model, "upstream_base_url", redact.String(work.BaseURL))
	var err error
	switch work.Type {
	case TypeGeneration:
		err = w.executeGeneration(ctx, work)
	case TypeEdit:
		err = w.executeEdit(ctx, work)
	default:
		err = fmt.Errorf("unsupported task type %q", work.Type)
	}
	if err != nil {
		sanitized := sanitizeError(err)
		if isRetryable(err) {
			attempts, maxAttempts, attemptErr := w.repo.Attempts(ctx, work.ID)
			if attemptErr == nil && attempts < maxAttempts {
				_ = w.repo.RequeueRetry(ctx, work.ID, sanitized, 0)
				slog.Warn("task retry queued",
					"task_id", work.ID,
					"task_type", work.Type,
					"attempt", attempts,
					"max_attempts", maxAttempts,
					"duration_ms", time.Since(startedAt).Milliseconds(),
					"error", sanitized,
				)
				w.Wake()
				return
			}
		}
		_ = w.repo.MarkFailed(ctx, work.ID, sanitized)
		if cleanupErr := w.store.DeleteTaskUploads(work.ID); cleanupErr != nil && !errors.Is(cleanupErr, os.ErrNotExist) {
			slog.Warn("task upload cleanup failed", "task_id", work.ID, "error", cleanupErr)
		}
		slog.Error("task failed",
			"task_id", work.ID,
			"task_type", work.Type,
			"duration_ms", time.Since(startedAt).Milliseconds(),
			"error", sanitized,
		)
		return
	}
	_ = w.repo.MarkSucceeded(ctx, work.ID)
	if cleanupErr := w.store.DeleteTaskUploads(work.ID); cleanupErr != nil && !errors.Is(cleanupErr, os.ErrNotExist) {
		slog.Warn("task upload cleanup failed", "task_id", work.ID, "error", cleanupErr)
	}
	slog.Info("task succeeded", "task_id", work.ID, "task_type", work.Type, "duration_ms", time.Since(startedAt).Milliseconds())
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
	savedCount, err := w.saveImageResponse(ctx, work.ID, 0, requestedImages, respBody)
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
		count, err := w.saveImageResponse(ctx, work.ID, savedCount, requestedImages-savedCount, respBody)
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
	body, err := json.Marshal(params)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(work.BaseURL, "/")+"/images/generations", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	auth := normalizeBearerToken(work.APIKey)
	if auth == "" {
		auth = normalizeBearerToken(w.defaultAPIKey)
	}
	if auth == "" {
		return nil, errors.New("missing API key for async task")
	}
	req.Header.Set("Authorization", auth)

	resp, err := w.client.Do(req)
	if err != nil {
		return nil, retryableError{err: err}
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= http.StatusBadRequest {
		return nil, upstreamError{status: resp.StatusCode, message: summarizeUpstreamError(respBody)}
	}
	return respBody, nil
}

func (w *Worker) saveImageResponse(ctx context.Context, taskID string, startIndex int, maxImages int, respBody []byte) (int, error) {
	var decoded struct {
		Data []struct {
			B64JSON       string `json:"b64_json"`
			URL           string `json:"url"`
			RevisedPrompt string `json:"revised_prompt"`
		} `json:"data"`
	}
	if err := json.Unmarshal(respBody, &decoded); err != nil {
		return 0, err
	}
	if len(decoded.Data) == 0 {
		return 0, errors.New("upstream response did not contain images")
	}
	if maxImages > 0 && len(decoded.Data) > maxImages {
		decoded.Data = decoded.Data[:maxImages]
	}

	for i, image := range decoded.Data {
		data, err := w.imageBytes(ctx, image.B64JSON, image.URL)
		if err != nil {
			return i, err
		}
		saved, err := w.store.SaveResult(ctx, taskID, fmt.Sprintf("%d", startIndex+i), data)
		if err != nil {
			return i, err
		}
		asset := Asset{
			ID:         newID(),
			TaskID:     taskID,
			StorageKey: saved.StorageKey,
			PublicURL:  saved.PublicURL,
			MIME:       saved.MIME,
			Width:      saved.Width,
			Height:     saved.Height,
			SizeBytes:  saved.SizeBytes,
			SHA256:     saved.SHA256,
			Metadata:   assetMetadataForImage(image.RevisedPrompt),
		}
		if err := w.repo.CreateAsset(ctx, asset); err != nil {
			return i, err
		}
		slog.Info("asset created", "task_id", taskID, "asset_id", asset.ID, "storage_key", asset.StorageKey, "mime", asset.MIME, "size_bytes", asset.SizeBytes)
	}
	return len(decoded.Data), nil
}

func assetMetadataForImage(revisedPrompt string) json.RawMessage {
	revisedPrompt = strings.TrimSpace(revisedPrompt)
	if revisedPrompt == "" {
		return nil
	}
	payload, err := json.Marshal(map[string]string{"revised_prompt": revisedPrompt})
	if err != nil {
		return nil
	}
	return payload
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

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(work.BaseURL, "/")+"/images/edits", body)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	auth := normalizeBearerToken(work.APIKey)
	if auth == "" {
		auth = normalizeBearerToken(w.defaultAPIKey)
	}
	if auth == "" {
		return errors.New("missing API key for async task")
	}
	req.Header.Set("Authorization", auth)

	resp, err := w.client.Do(req)
	if err != nil {
		return retryableError{err: err}
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	if resp.StatusCode >= http.StatusBadRequest {
		return upstreamError{status: resp.StatusCode, message: summarizeUpstreamError(respBody)}
	}
	_, err = w.saveImageResponse(ctx, work.ID, 0, 0, respBody)
	return err
}

func requestedImageCount(params map[string]any) int {
	const maxImagesPerTask = 10
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

func (w *Worker) imageBytes(ctx context.Context, b64 string, imageURL string) ([]byte, error) {
	if b64 != "" {
		return base64.StdEncoding.DecodeString(b64)
	}
	if imageURL == "" {
		return nil, errors.New("image response missing b64_json and url")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, imageURL, nil)
	if err != nil {
		return nil, err
	}
	resp, err := w.client.Do(req)
	if err != nil {
		return nil, retryableError{err: err}
	}
	defer resp.Body.Close()
	if resp.StatusCode >= http.StatusBadRequest {
		return nil, upstreamError{status: resp.StatusCode, message: fmt.Sprintf("image download HTTP %d", resp.StatusCode)}
	}
	return io.ReadAll(io.LimitReader(resp.Body, 100<<20))
}

func sleep(timer *time.Timer, duration time.Duration) {
	if !timer.Stop() {
		select {
		case <-timer.C:
		default:
		}
	}
	timer.Reset(duration)
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
