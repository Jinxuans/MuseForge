package httpapi

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime/multipart"
	"net"
	"net/http"
	"net/textproto"
	"net/url"
	"os"
	"path"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"gpt-image-go/internal/config"
	"gpt-image-go/internal/providers"
	"gpt-image-go/internal/redact"
	"gpt-image-go/internal/storage"
	"gpt-image-go/internal/tasks"
)

const maxMultipartMemory = 64 << 20

var hopByHopHeaders = map[string]struct{}{
	"connection":          {},
	"content-encoding":    {},
	"content-length":      {},
	"keep-alive":          {},
	"proxy-authenticate":  {},
	"proxy-authorization": {},
	"te":                  {},
	"trailers":            {},
	"transfer-encoding":   {},
	"upgrade":             {},

	"access-control-allow-credentials": {},
	"access-control-allow-headers":     {},
	"access-control-allow-methods":     {},
	"access-control-allow-origin":      {},
	"access-control-expose-headers":    {},
	"access-control-max-age":           {},
}

type Server struct {
	cfg       config.Config
	client    *http.Client
	staticFS  http.FileSystem
	repo      *tasks.Repository
	providers *providers.Repository
	worker    *tasks.Worker
	store     *storage.Local
}

type relayOptions struct {
	UpstreamBaseURL   string
	APIKey            string
	ProviderProfileID int64
	ClientHash        string
}

func New(cfg config.Config, staticFS http.FileSystem, repo *tasks.Repository, providerRepo *providers.Repository, worker *tasks.Worker, store *storage.Local) *Server {
	return &Server{
		cfg:       cfg,
		staticFS:  staticFS,
		repo:      repo,
		providers: providerRepo,
		worker:    worker,
		store:     store,
		client: &http.Client{
			Timeout: 300 * time.Second,
			Transport: &http.Transport{
				Proxy:                 http.ProxyFromEnvironment,
				MaxIdleConns:          200,
				MaxIdleConnsPerHost:   50,
				IdleConnTimeout:       90 * time.Second,
				TLSHandshakeTimeout:   15 * time.Second,
				ExpectContinueTimeout: 1 * time.Second,
			},
		},
	}
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	startedAt := time.Now()
	requestID := requestIDFrom(r)
	w.Header().Set("X-Request-ID", requestID)
	r = r.WithContext(context.WithValue(r.Context(), requestIDContextKey{}, requestID))
	lrw := &loggingResponseWriter{ResponseWriter: w, status: http.StatusOK}
	defer func() {
		if rec := recover(); rec != nil {
			slog.Error("http panic", "request_id", requestID, "method", r.Method, "path", r.URL.Path, "panic", rec)
			if !lrw.wroteHeader {
				jsonResponse(lrw, http.StatusInternalServerError, errorPayload("Internal server error."))
			}
		}
		status := lrw.status
		level := slog.LevelInfo
		if status >= 500 {
			level = slog.LevelError
		} else if status >= 400 {
			level = slog.LevelWarn
		}
		slog.Log(r.Context(), level, "http request",
			"request_id", requestID,
			"method", r.Method,
			"path", r.URL.Path,
			"status", status,
			"bytes", lrw.bytes,
			"duration_ms", time.Since(startedAt).Milliseconds(),
			"remote_addr", clientIP(r),
			"user_agent", r.UserAgent(),
		)
	}()

	setCORS(lrw)
	if r.Method == http.MethodOptions {
		lrw.WriteHeader(http.StatusNoContent)
		return
	}

	switch {
	case r.URL.Path == "/health":
		s.handleHealth(lrw, r)
	case r.URL.Path == "/api/v1/health-capabilities" && r.Method == http.MethodGet:
		s.handleV1Capabilities(lrw, r)
	case r.URL.Path == "/api/v1/me" && r.Method == http.MethodGet:
		s.handleV1Me(lrw, r)
	case r.URL.Path == "/api/v1/auth/logout" && r.Method == http.MethodPost:
		s.handleV1AuthLogout(lrw, r)
	case r.URL.Path == "/api/v1/tasks/generations" && r.Method == http.MethodPost:
		s.handleV1Envelope(lrw, r, s.handleCreateGenerationTask)
	case r.URL.Path == "/api/v1/tasks/edits" && r.Method == http.MethodPost:
		s.handleV1Envelope(lrw, r, s.handleCreateEditTask)
	case r.URL.Path == "/api/v1/tasks" && r.Method == http.MethodGet:
		s.handleV1Envelope(lrw, r, s.handleListTasks)
	case strings.HasPrefix(r.URL.Path, "/api/v1/tasks/"):
		s.handleV1Envelope(lrw, r, s.handleTaskByID)
	case r.URL.Path == "/api/v1/assets" && r.Method == http.MethodGet:
		s.handleV1Envelope(lrw, r, s.handleListAssets)
	case strings.HasPrefix(r.URL.Path, "/api/v1/assets/"):
		s.handleV1Envelope(lrw, r, s.handleAssetByID)
	case r.URL.Path == "/api/v1/provider-profiles" && (r.Method == http.MethodGet || r.Method == http.MethodPost):
		s.handleV1Envelope(lrw, r, s.handleProviderProfiles)
	case strings.HasPrefix(r.URL.Path, "/api/v1/provider-profiles/"):
		s.handleV1Envelope(lrw, r, s.handleProviderProfileByID)
	case strings.HasPrefix(r.URL.Path, "/files/") && (r.Method == http.MethodGet || r.Method == http.MethodHead):
		s.handleFile(lrw, r)
	case (r.URL.Path == "/images/generations" || r.URL.Path == "/v1/images/generations") && r.Method == http.MethodPost:
		s.handleImageGenerations(lrw, r)
	case (r.URL.Path == "/images/edits" || r.URL.Path == "/v1/images/edits") && r.Method == http.MethodPost:
		s.handleImageEdits(lrw, r)
	case r.URL.Path == "/v1/responses" && r.Method == http.MethodPost:
		s.handleResponses(lrw, r)
	case r.Method == http.MethodGet || r.Method == http.MethodHead:
		s.serveStatic(lrw, r)
	default:
		jsonResponse(lrw, http.StatusNotFound, map[string]any{"error": map[string]string{"message": "Not found."}})
	}
}

func setCORS(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Client-ID, X-Request-ID")
}

type requestIDContextKey struct{}

type loggingResponseWriter struct {
	http.ResponseWriter
	status      int
	bytes       int64
	wroteHeader bool
}

func (w *loggingResponseWriter) WriteHeader(status int) {
	if w.wroteHeader {
		return
	}
	w.status = status
	w.wroteHeader = true
	w.ResponseWriter.WriteHeader(status)
}

func (w *loggingResponseWriter) Write(data []byte) (int, error) {
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}
	n, err := w.ResponseWriter.Write(data)
	w.bytes += int64(n)
	return n, err
}

type captureResponseWriter struct {
	header http.Header
	status int
	body   bytes.Buffer
}

func newCaptureResponseWriter() *captureResponseWriter {
	return &captureResponseWriter{header: make(http.Header), status: http.StatusOK}
}

func (w *captureResponseWriter) Header() http.Header {
	return w.header
}

func (w *captureResponseWriter) WriteHeader(status int) {
	w.status = status
}

func (w *captureResponseWriter) Write(data []byte) (int, error) {
	return w.body.Write(data)
}

func (s *Server) handleV1Capabilities(w http.ResponseWriter, r *http.Request) {
	upstreamBaseURL, err := s.resolveUpstreamBaseURL("")
	if err != nil {
		v1ErrorResponse(w, r, http.StatusBadRequest, "invalid_upstream_base_url", err.Error())
		return
	}

	v1Response(w, r, http.StatusOK, map[string]any{
		"asyncTasks":            s.repo != nil && s.worker != nil,
		"assets":                s.repo != nil && s.store != nil,
		"providerProfiles":      s.providers != nil,
		"square":                false,
		"auth":                  false,
		"defaultProviderApiKey": s.cfg.DefaultProviderAPIKey != "",
		"upstreamBaseUrl":       upstreamBaseURL,
	})
}

func (s *Server) handleV1Envelope(w http.ResponseWriter, r *http.Request, handler func(http.ResponseWriter, *http.Request)) {
	capture := newCaptureResponseWriter()
	handler(capture, r)

	for name, values := range capture.Header() {
		if strings.EqualFold(name, "Content-Type") || strings.EqualFold(name, "Content-Length") {
			continue
		}
		for _, value := range values {
			w.Header().Add(name, value)
		}
	}

	var payload map[string]any
	if err := json.Unmarshal(capture.body.Bytes(), &payload); err != nil {
		v1ErrorResponse(w, r, http.StatusInternalServerError, "invalid_handler_response", "Internal server error.")
		return
	}
	if capture.status >= http.StatusBadRequest {
		v1ErrorResponse(w, r, capture.status, errorCodeFromPayload(capture.status, payload), errorMessageFromPayload(payload))
		return
	}
	v1Response(w, r, capture.status, v1DataFromHandlerPayload(payload))
}

func v1DataFromHandlerPayload(payload map[string]any) any {
	if task, ok := payload["task"].(map[string]any); ok {
		return map[string]any{"task": v1TaskDTO(task)}
	}
	if tasks, ok := payload["tasks"].([]any); ok {
		items := make([]any, 0, len(tasks))
		for _, item := range tasks {
			if task, ok := item.(map[string]any); ok {
				items = append(items, v1TaskDTO(task))
			}
		}
		return map[string]any{"items": items, "tasks": items, "nextCursor": nullableStringValue(payload["nextCursor"])}
	}
	if asset, ok := payload["asset"].(map[string]any); ok {
		return map[string]any{"asset": v1AssetDTO(asset)}
	}
	if assets, ok := payload["assets"].([]any); ok {
		items := make([]any, 0, len(assets))
		for _, item := range assets {
			if asset, ok := item.(map[string]any); ok {
				items = append(items, v1AssetDTO(asset))
			}
		}
		return map[string]any{"items": items, "assets": items, "nextCursor": nullableStringValue(payload["nextCursor"])}
	}
	if profile, ok := payload["provider_profile"].(map[string]any); ok {
		return map[string]any{"provider_profile": v1ProviderProfileDTO(profile)}
	}
	if profiles, ok := payload["provider_profiles"].([]any); ok {
		items := make([]any, 0, len(profiles))
		for _, item := range profiles {
			if profile, ok := item.(map[string]any); ok {
				items = append(items, v1ProviderProfileDTO(profile))
			}
		}
		return map[string]any{"items": items, "provider_profiles": items, "nextCursor": nil}
	}
	return payload
}

func v1TaskDTO(task map[string]any) map[string]any {
	params := objectValue(task["params"])
	if params == nil {
		params = objectValue(task["params_json"])
	}
	assets := arrayValue(task["assets"])
	outputAssets := make([]any, 0, len(assets))
	for _, item := range assets {
		if asset, ok := item.(map[string]any); ok {
			outputAssets = append(outputAssets, v1AssetDTO(asset))
		}
	}
	return map[string]any{
		"id":                      task["id"],
		"type":                    v1TaskType(stringValue(task["type"])),
		"status":                  task["status"],
		"prompt":                  task["prompt"],
		"model":                   task["model"],
		"providerBaseUrlSnapshot": task["provider_base_url_snapshot"],
		"params":                  params,
		"inputAssets":             []any{},
		"outputAssets":            outputAssets,
		"assets":                  outputAssets,
		"error":                   nullableStringValue(task["error"]),
		"lastError":               nullableStringValue(task["last_error"]),
		"attemptCount":            numberValue(task["attempt_count"]),
		"maxAttempts":             numberValue(task["max_attempts"]),
		"nextRunAt":               nullableStringValue(task["next_run_at"]),
		"createdAt":               task["created_at"],
		"startedAt":               nullableStringValue(task["started_at"]),
		"completedAt":             nullableStringValue(task["completed_at"]),
		"projectId":               nilString(),
		"owner":                   map[string]any{"type": "anonymous", "id": "current"},
	}
}

func v1AssetDTO(asset map[string]any) map[string]any {
	metadata := objectValue(asset["metadata"])
	if len(metadata) == 0 {
		metadata = objectValue(asset["metadata_json"])
	}
	return map[string]any{
		"id":           asset["id"],
		"taskId":       asset["task_id"],
		"taskType":     asset["task_type"],
		"projectId":    nullableStringValue(asset["project_id"]),
		"kind":         stringValueDefault(asset["kind"], "output"),
		"prompt":       asset["prompt"],
		"storageKey":   asset["storage_key"],
		"publicUrl":    asset["public_url"],
		"thumbnailUrl": nilString(),
		"mime":         asset["mime"],
		"width":        numberValue(asset["width"]),
		"height":       numberValue(asset["height"]),
		"sizeBytes":    numberValue(asset["size_bytes"]),
		"sha256":       asset["sha256"],
		"visibility":   stringValueDefault(asset["visibility"], "private"),
		"metadata":     metadata,
		"createdAt":    asset["created_at"],
	}
}

func v1ProviderProfileDTO(profile map[string]any) map[string]any {
	return map[string]any{
		"id":             profile["id"],
		"name":           profile["name"],
		"type":           profile["type"],
		"baseUrl":        profile["base_url"],
		"apiKeyHint":     profile["api_key_hint"],
		"model":          profile["model"],
		"apiMode":        profile["api_mode"],
		"providerConfig": objectValue(profile["provider_config_json"]),
		"createdAt":      profile["created_at"],
		"deletedAt":      nullableStringValue(profile["deleted_at"]),
	}
}

func v1TaskType(taskType string) string {
	switch taskType {
	case tasks.TypeGeneration:
		return "image_generation"
	case tasks.TypeEdit:
		return "image_edit"
	default:
		return taskType
	}
}

func objectValue(value any) map[string]any {
	if record, ok := value.(map[string]any); ok {
		return record
	}
	return map[string]any{}
}

func arrayValue(value any) []any {
	if list, ok := value.([]any); ok {
		return list
	}
	return nil
}

func stringValue(value any) string {
	if text, ok := value.(string); ok {
		return text
	}
	return ""
}

func stringValueDefault(value any, fallback string) string {
	text := strings.TrimSpace(stringValue(value))
	if text == "" {
		return fallback
	}
	return text
}

func nullableStringValue(value any) any {
	if value == nil {
		return nil
	}
	if text, ok := value.(string); ok {
		if strings.TrimSpace(text) == "" {
			return nil
		}
		return text
	}
	return value
}

func numberValue(value any) any {
	if value == nil {
		return 0
	}
	return value
}

func nilString() any {
	return nil
}

func v1Response(w http.ResponseWriter, r *http.Request, status int, data any) {
	jsonResponse(w, status, map[string]any{
		"ok":        true,
		"data":      data,
		"requestId": requestIDFromContext(r.Context()),
	})
}

func v1ErrorResponse(w http.ResponseWriter, r *http.Request, status int, code string, message string) {
	if strings.TrimSpace(message) == "" {
		message = http.StatusText(status)
	}
	jsonResponse(w, status, map[string]any{
		"ok": false,
		"error": map[string]any{
			"code":    code,
			"message": message,
		},
		"requestId": requestIDFromContext(r.Context()),
	})
}

func errorMessageFromPayload(payload map[string]any) string {
	if errorValue, ok := payload["error"]; ok {
		if errorMap, ok := errorValue.(map[string]any); ok {
			if message, ok := errorMap["message"].(string); ok && strings.TrimSpace(message) != "" {
				return message
			}
		}
		if message, ok := errorValue.(string); ok && strings.TrimSpace(message) != "" {
			return message
		}
	}
	if message, ok := payload["message"].(string); ok && strings.TrimSpace(message) != "" {
		return message
	}
	return "Request failed."
}

func errorCodeFromPayload(status int, payload map[string]any) string {
	if errorValue, ok := payload["error"]; ok {
		if errorMap, ok := errorValue.(map[string]any); ok {
			if code, ok := errorMap["code"].(string); ok && strings.TrimSpace(code) != "" {
				return code
			}
		}
	}
	switch status {
	case http.StatusBadRequest:
		return "invalid_request"
	case http.StatusUnauthorized:
		return "unauthorized"
	case http.StatusForbidden:
		return "forbidden"
	case http.StatusNotFound:
		return "not_found"
	case http.StatusServiceUnavailable:
		return "service_unavailable"
	default:
		if status >= http.StatusInternalServerError {
			return "internal_error"
		}
		return "request_failed"
	}
}

func requestIDFromContext(ctx context.Context) string {
	if value, ok := ctx.Value(requestIDContextKey{}).(string); ok && strings.TrimSpace(value) != "" {
		return value
	}
	return newRequestID()
}

func requestIDFrom(r *http.Request) string {
	if value := strings.TrimSpace(r.Header.Get("X-Request-ID")); value != "" && len(value) <= 128 {
		return value
	}
	return newRequestID()
}

func newRequestID() string {
	now := time.Now().UnixNano()
	random := make([]byte, 8)
	if _, err := rand.Read(random); err != nil {
		random = []byte(fmt.Sprintf("%d", now))
	}
	sum := sha256.Sum256(append([]byte(fmt.Sprintf("%d:", now)), random...))
	return hex.EncodeToString(sum[:8])
}

func clientIP(r *http.Request) string {
	if value := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); value != "" {
		parts := strings.Split(value, ",")
		return strings.TrimSpace(parts[0])
	}
	if value := strings.TrimSpace(r.Header.Get("X-Real-IP")); value != "" {
		return value
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func (s *Server) serveStatic(w http.ResponseWriter, r *http.Request) {
	if s.staticFS == nil {
		jsonResponse(w, http.StatusNotFound, map[string]any{"error": map[string]string{"message": "Static files are not available."}})
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/")
	if path == "" {
		path = "index.html"
	}

	if f, err := s.staticFS.Open(path); err == nil {
		_ = f.Close()
		http.FileServer(s.staticFS).ServeHTTP(w, r)
		return
	}

	r2 := new(http.Request)
	*r2 = *r
	r2.URL = new(url.URL)
	*r2.URL = *r.URL
	r2.URL.Path = "/index.html"
	http.FileServer(s.staticFS).ServeHTTP(w, r2)
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	upstreamBaseURL, err := s.resolveUpstreamBaseURL("")
	if err != nil {
		jsonResponse(w, http.StatusBadRequest, errorPayload(err.Error()))
		return
	}

	jsonResponse(w, http.StatusOK, map[string]any{
		"ok":                 true,
		"upstream_base_url":  upstreamBaseURL,
		"has_server_api_key": s.cfg.DefaultProviderAPIKey != "",
		"async_enabled":      s.repo != nil,
	})
}

func (s *Server) handleCreateGenerationTask(w http.ResponseWriter, r *http.Request) {
	if s.repo == nil || s.worker == nil {
		jsonResponse(w, http.StatusServiceUnavailable, errorPayload("Async task API requires DATABASE_URL."))
		return
	}
	clientHash, ok := requireClientHash(w, r)
	if !ok {
		return
	}

	var payload map[string]any
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(&payload); err != nil || payload == nil {
		jsonResponse(w, http.StatusBadRequest, errorPayload("Request body must be JSON."))
		return
	}

	options := extractRelayOptionsFromJSON(payload)
	options.ClientHash = clientHash
	if err := s.applyProviderProfile(r.Context(), &options); err != nil {
		jsonResponse(w, http.StatusBadRequest, errorPayload(err.Error()))
		return
	}
	authorizationHeader := s.getAuthorizationHeader(r, options.APIKey)
	if authorizationHeader == "" {
		jsonResponse(w, http.StatusBadRequest, missingAPIKeyPayload())
		return
	}

	upstreamBaseURL, err := s.resolveUpstreamBaseURL(options.UpstreamBaseURL)
	if err != nil {
		jsonResponse(w, http.StatusBadRequest, errorPayload(err.Error()))
		return
	}

	model, _ := payload["model"].(string)
	model = strings.TrimSpace(model)
	if model == "" {
		model = "gpt-image-2"
	}
	prompt, _ := payload["prompt"].(string)
	prompt = strings.TrimSpace(prompt)
	if prompt == "" {
		jsonResponse(w, http.StatusBadRequest, errorPayload("prompt is required."))
		return
	}

	params := make(map[string]any, len(payload))
	for key, value := range payload {
		if key == "model" || key == "prompt" {
			continue
		}
		params[key] = value
	}

	task, err := s.repo.CreateGeneration(r.Context(), tasks.CreateGenerationTask{
		BaseURL:     upstreamBaseURL,
		APIKey:      apiKeyForTaskStorage(authorizationHeader, options.APIKey),
		ClientHash:  clientHash,
		Model:       model,
		Prompt:      prompt,
		Params:      params,
		MaxAttempts: s.cfg.TaskMaxAttempts,
	})
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errorPayload("Create task failed: "+err.Error()))
		return
	}
	slog.Info("task created", "task_id", task.ID, "task_type", task.Type, "client", shortHash(clientHash), "model", model)

	s.worker.Wake()
	jsonResponse(w, http.StatusAccepted, map[string]any{"task": task})
}

func (s *Server) handleCreateEditTask(w http.ResponseWriter, r *http.Request) {
	if s.repo == nil || s.worker == nil || s.store == nil {
		jsonResponse(w, http.StatusServiceUnavailable, errorPayload("Async task API requires DATABASE_URL."))
		return
	}
	clientHash, ok := requireClientHash(w, r)
	if !ok {
		return
	}
	if err := r.ParseMultipartForm(maxMultipartMemory); err != nil {
		jsonResponse(w, http.StatusBadRequest, errorPayload("Request body must be multipart/form-data."))
		return
	}
	defer r.MultipartForm.RemoveAll()

	options := extractRelayOptionsFromForm(r.MultipartForm.Value)
	options.ClientHash = clientHash
	if err := s.applyProviderProfile(r.Context(), &options); err != nil {
		jsonResponse(w, http.StatusBadRequest, errorPayload(err.Error()))
		return
	}
	authorizationHeader := s.getAuthorizationHeader(r, options.APIKey)
	if authorizationHeader == "" {
		jsonResponse(w, http.StatusBadRequest, missingAPIKeyPayload())
		return
	}

	upstreamBaseURL, err := s.resolveUpstreamBaseURL(options.UpstreamBaseURL)
	if err != nil {
		jsonResponse(w, http.StatusBadRequest, errorPayload(err.Error()))
		return
	}

	model := strings.TrimSpace(firstFormValue(r.MultipartForm.Value, "model"))
	if model == "" {
		model = "gpt-image-2"
	}
	prompt := strings.TrimSpace(firstFormValue(r.MultipartForm.Value, "prompt"))
	if prompt == "" {
		jsonResponse(w, http.StatusBadRequest, errorPayload("prompt is required."))
		return
	}
	imageFiles := append([]*multipart.FileHeader{}, r.MultipartForm.File["image[]"]...)
	imageFiles = append(imageFiles, r.MultipartForm.File["image"]...)
	if len(imageFiles) == 0 {
		jsonResponse(w, http.StatusBadRequest, errorPayload("At least one image is required."))
		return
	}

	fields := formFieldsForTask(r.MultipartForm.Value)
	task, err := s.repo.CreateEdit(r.Context(), tasks.CreateEditTask{
		BaseURL:     upstreamBaseURL,
		APIKey:      apiKeyForTaskStorage(authorizationHeader, options.APIKey),
		ClientHash:  clientHash,
		Model:       model,
		Prompt:      prompt,
		Params:      map[string]any{"fields": fields},
		MaxAttempts: s.cfg.TaskMaxAttempts,
	})
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errorPayload("Create task failed: "+err.Error()))
		return
	}
	slog.Info("task created", "task_id", task.ID, "task_type", task.Type, "client", shortHash(clientHash), "model", model)

	images, mask, err := s.saveEditUploads(r.Context(), task.ID, imageFiles, r.MultipartForm.File["mask"])
	if err != nil {
		_ = s.repo.MarkFailed(r.Context(), task.ID, err.Error())
		jsonResponse(w, http.StatusInternalServerError, errorPayload("Save upload failed: "+err.Error()))
		return
	}

	params := map[string]any{
		"fields": fields,
		"images": images,
	}
	if mask != nil {
		params["mask"] = mask
	}
	if err := s.repo.UpdateParams(r.Context(), task.ID, params); err != nil {
		_ = s.repo.MarkFailed(r.Context(), task.ID, err.Error())
		jsonResponse(w, http.StatusInternalServerError, errorPayload("Update task failed: "+err.Error()))
		return
	}
	if err := s.repo.MarkQueued(r.Context(), task.ID); err != nil {
		_ = s.repo.MarkFailed(r.Context(), task.ID, err.Error())
		jsonResponse(w, http.StatusInternalServerError, errorPayload("Queue task failed: "+err.Error()))
		return
	}

	updatedTask, err := s.repo.Get(r.Context(), clientHash, task.ID)
	if err == nil && updatedTask != nil {
		task = updatedTask
	}
	s.worker.Wake()
	jsonResponse(w, http.StatusAccepted, map[string]any{"task": task})
}

func (s *Server) handleListTasks(w http.ResponseWriter, r *http.Request) {
	if s.repo == nil {
		jsonResponse(w, http.StatusServiceUnavailable, errorPayload("Async task API requires DATABASE_URL."))
		return
	}
	clientHash, ok := requireClientHash(w, r)
	if !ok {
		return
	}
	page, err := s.repo.ListPage(r.Context(), clientHash, strings.TrimSpace(r.URL.Query().Get("cursor")), queryLimit(r, 50, 100))
	if err != nil {
		if errors.Is(err, tasks.ErrInvalidCursor) {
			jsonResponse(w, http.StatusBadRequest, errorPayload("Invalid cursor."))
			return
		}
		jsonResponse(w, http.StatusInternalServerError, errorPayload(err.Error()))
		return
	}
	jsonResponse(w, http.StatusOK, map[string]any{"tasks": page.Items, "nextCursor": page.NextCursor})
}

func (s *Server) handleTaskByID(w http.ResponseWriter, r *http.Request) {
	if s.repo == nil {
		jsonResponse(w, http.StatusServiceUnavailable, errorPayload("Async task API requires DATABASE_URL."))
		return
	}
	rest := strings.TrimPrefix(r.URL.Path, "/api/v1/tasks/")
	id, action, _ := strings.Cut(rest, "/")
	if id == "" {
		jsonResponse(w, http.StatusNotFound, errorPayload("Not found."))
		return
	}
	if action == "cancel" && r.Method == http.MethodPost {
		clientHash, ok := requireClientHash(w, r)
		if !ok {
			return
		}
		canceled, err := s.repo.Cancel(r.Context(), clientHash, id)
		if err != nil {
			jsonResponse(w, http.StatusInternalServerError, errorPayload(err.Error()))
			return
		}
		jsonResponse(w, http.StatusOK, map[string]any{"canceled": canceled})
		return
	}
	if action != "" || r.Method != http.MethodGet {
		jsonResponse(w, http.StatusNotFound, errorPayload("Not found."))
		return
	}
	clientHash, ok := requireClientHash(w, r)
	if !ok {
		return
	}
	task, err := s.repo.Get(r.Context(), clientHash, id)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errorPayload(err.Error()))
		return
	}
	if task == nil {
		jsonResponse(w, http.StatusNotFound, errorPayload("Task not found."))
		return
	}
	jsonResponse(w, http.StatusOK, map[string]any{"task": task})
}

func (s *Server) handleListAssets(w http.ResponseWriter, r *http.Request) {
	kind, ok := parseAssetKindFilter(r.URL.Query().Get("kind"))
	if !ok {
		jsonResponse(w, http.StatusBadRequest, errorPayload("Invalid asset kind."))
		return
	}
	taskID := strings.TrimSpace(r.URL.Query().Get("task_id"))
	if taskID != "" && !isUUIDText(taskID) {
		jsonResponse(w, http.StatusBadRequest, errorPayload("Invalid task id."))
		return
	}
	projectID := strings.TrimSpace(r.URL.Query().Get("project_id"))
	if s.repo == nil {
		jsonResponse(w, http.StatusServiceUnavailable, errorPayload("Asset API requires DATABASE_URL."))
		return
	}
	clientHash, ok := requireClientHash(w, r)
	if !ok {
		return
	}
	cursor := strings.TrimSpace(r.URL.Query().Get("cursor"))
	limit := queryLimit(r, 100, 200)
	var page tasks.AssetPage
	var err error
	page, err = s.repo.ListAssetsFilteredPage(r.Context(), clientHash, taskID, projectID, kind, cursor, limit)
	if err != nil {
		if errors.Is(err, tasks.ErrInvalidCursor) {
			jsonResponse(w, http.StatusBadRequest, errorPayload("Invalid cursor."))
			return
		}
		jsonResponse(w, http.StatusInternalServerError, errorPayload(err.Error()))
		return
	}
	jsonResponse(w, http.StatusOK, map[string]any{"assets": page.Items, "nextCursor": page.NextCursor})
}

func parseAssetKindFilter(value string) (string, bool) {
	kind := strings.TrimSpace(value)
	if kind == "" {
		return "", true
	}
	switch kind {
	case "input", "output", "mask", "reference", "thumbnail":
		return kind, true
	default:
		return "", false
	}
}

func isUUIDText(value string) bool {
	if len(value) != 36 {
		return false
	}
	for i := 0; i < len(value); i++ {
		switch i {
		case 8, 13, 18, 23:
			if value[i] != '-' {
				return false
			}
		default:
			if !isHexByte(value[i]) {
				return false
			}
		}
	}
	return true
}

func isHexByte(value byte) bool {
	return (value >= '0' && value <= '9') ||
		(value >= 'a' && value <= 'f') ||
		(value >= 'A' && value <= 'F')
}

func (s *Server) handleAssetByID(w http.ResponseWriter, r *http.Request) {
	if s.repo == nil || s.store == nil {
		jsonResponse(w, http.StatusServiceUnavailable, errorPayload("Asset API requires DATABASE_URL."))
		return
	}
	id := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/assets/"), "/")
	if id == "" {
		jsonResponse(w, http.StatusNotFound, errorPayload("Asset not found."))
		return
	}
	switch r.Method {
	case http.MethodGet:
		clientHash, ok := requireClientHash(w, r)
		if !ok {
			return
		}
		asset, err := s.repo.GetAsset(r.Context(), clientHash, id)
		if err != nil {
			jsonResponse(w, http.StatusInternalServerError, errorPayload(err.Error()))
			return
		}
		if asset == nil {
			jsonResponse(w, http.StatusNotFound, errorPayload("Asset not found."))
			return
		}
		jsonResponse(w, http.StatusOK, map[string]any{"asset": asset})
	case http.MethodDelete:
		clientHash, ok := requireClientHash(w, r)
		if !ok {
			return
		}
		asset, err := s.repo.DeleteAsset(r.Context(), clientHash, id)
		if err != nil {
			jsonResponse(w, http.StatusInternalServerError, errorPayload(err.Error()))
			return
		}
		if asset == nil {
			jsonResponse(w, http.StatusNotFound, errorPayload("Asset not found."))
			return
		}
		if err := s.store.Delete(asset.StorageKey); err != nil && !errors.Is(err, os.ErrNotExist) {
			jsonResponse(w, http.StatusInternalServerError, errorPayload(err.Error()))
			return
		}
		slog.Info("asset deleted", "asset_id", asset.ID, "task_id", asset.TaskID, "client", shortHash(clientHash), "storage_key", asset.StorageKey)
		jsonResponse(w, http.StatusOK, map[string]any{"deleted": true, "asset": asset})
	default:
		jsonResponse(w, http.StatusNotFound, errorPayload("Not found."))
	}
}

func (s *Server) handleProviderProfiles(w http.ResponseWriter, r *http.Request) {
	if s.providers == nil {
		jsonResponse(w, http.StatusServiceUnavailable, errorPayload("Provider profile API requires DATABASE_URL."))
		return
	}
	clientHash, ok := requireClientHash(w, r)
	if !ok {
		return
	}
	switch r.Method {
	case http.MethodGet:
		list, err := s.providers.List(r.Context(), clientHash)
		if err != nil {
			jsonResponse(w, http.StatusInternalServerError, errorPayload(err.Error()))
			return
		}
		jsonResponse(w, http.StatusOK, map[string]any{"provider_profiles": list})
	case http.MethodPost:
		var payload struct {
			Name               string          `json:"name"`
			Type               string          `json:"type"`
			BaseURL            string          `json:"base_url"`
			APIKey             string          `json:"api_key"`
			Model              string          `json:"model"`
			APIMode            string          `json:"api_mode"`
			ProviderConfig     json.RawMessage `json:"provider_config"`
			ProviderConfigJSON json.RawMessage `json:"provider_config_json"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			jsonResponse(w, http.StatusBadRequest, errorPayload("Request body must be JSON."))
			return
		}
		name := strings.TrimSpace(payload.Name)
		if name == "" {
			jsonResponse(w, http.StatusBadRequest, errorPayload("name is required."))
			return
		}
		baseURL, err := s.resolveUpstreamBaseURLNoFallback(payload.BaseURL)
		if err != nil {
			jsonResponse(w, http.StatusBadRequest, errorPayload(err.Error()))
			return
		}
		profileType, err := normalizeProviderProfileType(payload.Type)
		if err != nil {
			jsonResponse(w, http.StatusBadRequest, errorPayload(err.Error()))
			return
		}
		apiMode, err := normalizeProviderProfileAPIMode(payload.APIMode)
		if err != nil {
			jsonResponse(w, http.StatusBadRequest, errorPayload(err.Error()))
			return
		}
		providerConfig, err := normalizeProviderProfileConfig(firstRawJSON(payload.ProviderConfig, payload.ProviderConfigJSON))
		if err != nil {
			jsonResponse(w, http.StatusBadRequest, errorPayload(err.Error()))
			return
		}
		profile, err := s.providers.Create(r.Context(), clientHash, name, profileType, baseURL, strings.TrimSpace(payload.APIKey), strings.TrimSpace(payload.Model), apiMode, providerConfig)
		if err != nil {
			jsonResponse(w, http.StatusInternalServerError, errorPayload(err.Error()))
			return
		}
		slog.Info("provider profile created", "profile_id", profile.ID, "client", shortHash(clientHash), "base_url", redact.String(baseURL))
		jsonResponse(w, http.StatusCreated, map[string]any{"provider_profile": profile})
	}
}

func (s *Server) handleProviderProfileByID(w http.ResponseWriter, r *http.Request) {
	if s.providers == nil {
		jsonResponse(w, http.StatusServiceUnavailable, errorPayload("Provider profile API requires DATABASE_URL."))
		return
	}
	clientHash, ok := requireClientHash(w, r)
	if !ok {
		return
	}
	idText := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/provider-profiles/"), "/")
	id, err := strconv.ParseInt(idText, 10, 64)
	if err != nil || id <= 0 {
		jsonResponse(w, http.StatusBadRequest, errorPayload("Invalid provider profile id."))
		return
	}
	switch r.Method {
	case http.MethodPatch:
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil || payload == nil {
			jsonResponse(w, http.StatusBadRequest, errorPayload("Request body must be JSON."))
			return
		}
		name, ok, valid := optionalPayloadString(payload, "name")
		if !valid {
			jsonResponse(w, http.StatusBadRequest, errorPayload("name must be a string."))
			return
		}
		if ok {
			trimmed := strings.TrimSpace(name)
			if trimmed == "" {
				jsonResponse(w, http.StatusBadRequest, errorPayload("name cannot be empty."))
				return
			}
			name = trimmed
		}
		profileType, hasType, valid := optionalPayloadString(payload, "type")
		if !valid {
			jsonResponse(w, http.StatusBadRequest, errorPayload("type must be a string."))
			return
		}
		if hasType {
			profileType, err = normalizeProviderProfileType(profileType)
			if err != nil {
				jsonResponse(w, http.StatusBadRequest, errorPayload(err.Error()))
				return
			}
		}
		baseURL, hasBaseURL, valid := optionalPayloadString(payload, "base_url", "baseUrl")
		if !valid {
			jsonResponse(w, http.StatusBadRequest, errorPayload("base_url must be a string."))
			return
		}
		if hasBaseURL {
			baseURL, err = s.resolveUpstreamBaseURLNoFallback(baseURL)
			if err != nil {
				jsonResponse(w, http.StatusBadRequest, errorPayload(err.Error()))
				return
			}
		}
		apiKey, hasAPIKey, valid := optionalPayloadString(payload, "api_key", "apiKey")
		if !valid {
			jsonResponse(w, http.StatusBadRequest, errorPayload("api_key must be a string."))
			return
		}
		if hasAPIKey {
			apiKey = strings.TrimSpace(apiKey)
		}
		model, hasModel, valid := optionalPayloadString(payload, "model", "default_model", "defaultModel")
		if !valid {
			jsonResponse(w, http.StatusBadRequest, errorPayload("model must be a string."))
			return
		}
		if hasModel {
			model = strings.TrimSpace(model)
		}
		apiMode, hasAPIMode, valid := optionalPayloadString(payload, "api_mode", "apiMode")
		if !valid {
			jsonResponse(w, http.StatusBadRequest, errorPayload("api_mode must be a string."))
			return
		}
		if hasAPIMode {
			apiMode, err = normalizeProviderProfileAPIMode(apiMode)
			if err != nil {
				jsonResponse(w, http.StatusBadRequest, errorPayload(err.Error()))
				return
			}
		}
		providerConfig, hasProviderConfig, valid := optionalPayloadJSON(payload, "provider_config", "providerConfig", "provider_config_json")
		if !valid {
			jsonResponse(w, http.StatusBadRequest, errorPayload("provider_config must be valid JSON."))
			return
		}
		if hasProviderConfig {
			providerConfig, err = normalizeProviderProfileConfig(providerConfig)
			if err != nil {
				jsonResponse(w, http.StatusBadRequest, errorPayload(err.Error()))
				return
			}
		}
		profile, err := s.providers.Update(
			r.Context(),
			clientHash,
			id,
			optionalStringPointer(name, ok),
			optionalStringPointer(profileType, hasType),
			optionalStringPointer(baseURL, hasBaseURL),
			optionalStringPointer(apiKey, hasAPIKey),
			optionalStringPointer(model, hasModel),
			optionalStringPointer(apiMode, hasAPIMode),
			optionalJSONPointer(providerConfig, hasProviderConfig),
		)
		if err != nil {
			jsonResponse(w, http.StatusInternalServerError, errorPayload(err.Error()))
			return
		}
		if profile == nil {
			jsonResponse(w, http.StatusNotFound, errorPayload("Provider profile not found."))
			return
		}
		slog.Info("provider profile updated", "profile_id", profile.ID, "client", shortHash(clientHash), "base_url", redact.String(profile.BaseURL))
		jsonResponse(w, http.StatusOK, map[string]any{"provider_profile": profile})
	case http.MethodDelete:
		deleted, err := s.providers.Delete(r.Context(), clientHash, id)
		if err != nil {
			jsonResponse(w, http.StatusInternalServerError, errorPayload(err.Error()))
			return
		}
		if !deleted {
			jsonResponse(w, http.StatusNotFound, errorPayload("Provider profile not found."))
			return
		}
		slog.Info("provider profile deleted", "profile_id", id, "client", shortHash(clientHash))
		jsonResponse(w, http.StatusOK, map[string]any{"deleted": true})
	default:
		jsonResponse(w, http.StatusNotFound, errorPayload("Not found."))
	}
}

func optionalPayloadString(payload map[string]any, keys ...string) (string, bool, bool) {
	for _, key := range keys {
		value, ok := payload[key]
		if !ok {
			continue
		}
		text, ok := value.(string)
		return text, true, ok
	}
	return "", false, true
}

func optionalPayloadJSON(payload map[string]any, keys ...string) (json.RawMessage, bool, bool) {
	for _, key := range keys {
		value, ok := payload[key]
		if !ok {
			continue
		}
		raw, err := json.Marshal(value)
		if err != nil {
			return nil, true, false
		}
		return raw, true, true
	}
	return nil, false, true
}

func optionalStringPointer(value string, ok bool) *string {
	if !ok {
		return nil
	}
	return &value
}

func optionalJSONPointer(value json.RawMessage, ok bool) *json.RawMessage {
	if !ok {
		return nil
	}
	return &value
}

func firstRawJSON(values ...json.RawMessage) json.RawMessage {
	for _, value := range values {
		if len(value) > 0 && strings.TrimSpace(string(value)) != "" {
			return value
		}
	}
	return nil
}

func normalizeProviderProfileType(value string) (string, error) {
	switch strings.TrimSpace(value) {
	case "":
		return "openai", nil
	case "openai", "fal", "custom-http-image":
		return strings.TrimSpace(value), nil
	case "custom":
		return "custom-http-image", nil
	default:
		return "", fmt.Errorf("provider profile type must be openai, fal, or custom-http-image")
	}
}

func normalizeProviderProfileConfig(value json.RawMessage) (json.RawMessage, error) {
	if len(value) == 0 || strings.TrimSpace(string(value)) == "" {
		return json.RawMessage(`{}`), nil
	}
	var decoded any
	if err := json.Unmarshal(value, &decoded); err != nil {
		return nil, errors.New("provider_config must be valid JSON.")
	}
	if decoded == nil {
		return json.RawMessage(`{}`), nil
	}
	if _, ok := decoded.(map[string]any); !ok {
		return nil, errors.New("provider_config must be a JSON object.")
	}
	return value, nil
}

func normalizeProviderProfileAPIMode(value string) (string, error) {
	switch strings.TrimSpace(value) {
	case "":
		return "images", nil
	case "images", "responses":
		return strings.TrimSpace(value), nil
	default:
		return "", fmt.Errorf("provider profile api_mode must be images or responses")
	}
}

func (s *Server) handleFile(w http.ResponseWriter, r *http.Request) {
	if s.repo == nil || s.store == nil {
		jsonResponse(w, http.StatusServiceUnavailable, errorPayload("File API requires DATABASE_URL."))
		return
	}
	storageKey := strings.TrimPrefix(path.Clean("/"+strings.TrimPrefix(r.URL.Path, "/files/")), "/")
	if storageKey == "" {
		jsonResponse(w, http.StatusNotFound, errorPayload("File not found."))
		return
	}
	http.ServeFile(w, r, s.store.Path(storageKey))
}

func (s *Server) handleImageGenerations(w http.ResponseWriter, r *http.Request) {
	var payload map[string]any
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(&payload); err != nil || payload == nil {
		jsonResponse(w, http.StatusBadRequest, errorPayload("Request body must be JSON."))
		return
	}

	options := extractRelayOptionsFromJSON(payload)
	options.ClientHash = clientHashFromRequest(r)
	if err := s.applyProviderProfile(r.Context(), &options); err != nil {
		jsonResponse(w, http.StatusBadRequest, errorPayload(err.Error()))
		return
	}
	authorizationHeader := s.getAuthorizationHeader(r, options.APIKey)
	if authorizationHeader == "" {
		jsonResponse(w, http.StatusBadRequest, missingAPIKeyPayload())
		return
	}

	upstreamBaseURL, err := s.resolveUpstreamBaseURL(options.UpstreamBaseURL)
	if err != nil {
		jsonResponse(w, http.StatusBadRequest, errorPayload(err.Error()))
		return
	}

	body, err := json.Marshal(payload)
	if err != nil {
		jsonResponse(w, http.StatusBadRequest, errorPayload("Request body must be JSON."))
		return
	}

	s.proxyRequest(w, r.Context().Done(), upstreamBaseURL+"/images/generations", authorizationHeader, "application/json", bytes.NewReader(body))
}

func (s *Server) handleImageEdits(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(maxMultipartMemory); err != nil {
		jsonResponse(w, http.StatusBadRequest, errorPayload("Request body must be multipart/form-data."))
		return
	}
	defer r.MultipartForm.RemoveAll()

	options := extractRelayOptionsFromForm(r.MultipartForm.Value)
	options.ClientHash = clientHashFromRequest(r)
	if err := s.applyProviderProfile(r.Context(), &options); err != nil {
		jsonResponse(w, http.StatusBadRequest, errorPayload(err.Error()))
		return
	}
	authorizationHeader := s.getAuthorizationHeader(r, options.APIKey)
	if authorizationHeader == "" {
		jsonResponse(w, http.StatusBadRequest, missingAPIKeyPayload())
		return
	}

	upstreamBaseURL, err := s.resolveUpstreamBaseURL(options.UpstreamBaseURL)
	if err != nil {
		jsonResponse(w, http.StatusBadRequest, errorPayload(err.Error()))
		return
	}

	body, contentType, err := buildMultipartBody(r.MultipartForm)
	if err != nil {
		jsonResponse(w, http.StatusBadRequest, errorPayload(err.Error()))
		return
	}

	s.proxyRequest(w, r.Context().Done(), upstreamBaseURL+"/images/edits", authorizationHeader, contentType, body)
}

func (s *Server) handleResponses(w http.ResponseWriter, r *http.Request) {
	var payload map[string]any
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(&payload); err != nil || payload == nil {
		jsonResponse(w, http.StatusBadRequest, errorPayload("Request body must be JSON."))
		return
	}

	options := extractRelayOptionsFromJSON(payload)
	options.ClientHash = clientHashFromRequest(r)
	if err := s.applyProviderProfile(r.Context(), &options); err != nil {
		jsonResponse(w, http.StatusBadRequest, errorPayload(err.Error()))
		return
	}
	authorizationHeader := s.getAuthorizationHeader(r, options.APIKey)
	if authorizationHeader == "" {
		jsonResponse(w, http.StatusBadRequest, missingAPIKeyPayload())
		return
	}

	upstreamBaseURL, err := s.resolveUpstreamBaseURL(options.UpstreamBaseURL)
	if err != nil {
		jsonResponse(w, http.StatusBadRequest, errorPayload(err.Error()))
		return
	}

	body, err := json.Marshal(payload)
	if err != nil {
		jsonResponse(w, http.StatusBadRequest, errorPayload("Request body must be JSON."))
		return
	}

	s.proxyRequest(w, r.Context().Done(), upstreamBaseURL+"/responses", authorizationHeader, "application/json", bytes.NewReader(body))
}

func extractRelayOptionsFromJSON(payload map[string]any) relayOptions {
	options := relayOptions{}
	if value, ok := payload["__upstream_base_url"]; ok {
		options.UpstreamBaseURL = strings.TrimSpace(fmt.Sprint(value))
		delete(payload, "__upstream_base_url")
	}
	if value, ok := payload["__api_key"]; ok {
		options.APIKey = strings.TrimSpace(fmt.Sprint(value))
		delete(payload, "__api_key")
	}
	if value, ok := payload["__provider_profile_id"]; ok {
		options.ProviderProfileID, _ = strconv.ParseInt(strings.TrimSpace(fmt.Sprint(value)), 10, 64)
		delete(payload, "__provider_profile_id")
	}
	return options
}

func extractRelayOptionsFromForm(values map[string][]string) relayOptions {
	options := relayOptions{}
	if value := firstFormValue(values, "__upstream_base_url"); value != "" {
		options.UpstreamBaseURL = strings.TrimSpace(value)
		delete(values, "__upstream_base_url")
	}
	if value := firstFormValue(values, "__api_key"); value != "" {
		options.APIKey = strings.TrimSpace(value)
		delete(values, "__api_key")
	}
	if value := firstFormValue(values, "__provider_profile_id"); value != "" {
		options.ProviderProfileID, _ = strconv.ParseInt(strings.TrimSpace(value), 10, 64)
		delete(values, "__provider_profile_id")
	}
	return options
}

func firstFormValue(values map[string][]string, key string) string {
	if len(values[key]) == 0 {
		return ""
	}
	return values[key][0]
}

func queryLimit(r *http.Request, fallback int, max int) int {
	value := strings.TrimSpace(r.URL.Query().Get("limit"))
	if value == "" {
		return fallback
	}
	limit, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	if limit <= 0 {
		return fallback
	}
	if limit > max {
		return max
	}
	return limit
}

func (s *Server) applyProviderProfile(ctx context.Context, options *relayOptions) error {
	if options.ProviderProfileID <= 0 {
		return nil
	}
	if strings.TrimSpace(options.UpstreamBaseURL) != "" || strings.TrimSpace(options.APIKey) != "" {
		return nil
	}
	if options.ClientHash == "" {
		return errors.New("Client ID is required for provider profile.")
	}
	if s.providers == nil {
		return errors.New("Provider profile API requires DATABASE_URL.")
	}
	baseURL, apiKey, ok, err := s.providers.GetSecret(ctx, options.ClientHash, options.ProviderProfileID)
	if err != nil {
		return err
	}
	if !ok {
		return errors.New("Provider profile not found.")
	}
	options.UpstreamBaseURL = baseURL
	options.APIKey = apiKey
	return nil
}

func requireClientHash(w http.ResponseWriter, r *http.Request) (string, bool) {
	hash := clientHashFromRequest(r)
	if hash == "" {
		jsonResponse(w, http.StatusBadRequest, errorPayload("Client ID is required."))
		return "", false
	}
	return hash, true
}

func clientHashFromRequest(r *http.Request) string {
	value := strings.TrimSpace(r.Header.Get("X-Client-ID"))
	if value == "" || len(value) > 128 {
		return ""
	}
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

func shortHash(value string) string {
	if len(value) <= 12 {
		return value
	}
	return value[:12]
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

func (s *Server) getAuthorizationHeader(r *http.Request, clientAPIKey string) string {
	if value := strings.TrimSpace(r.Header.Get("Authorization")); value != "" {
		return value
	}
	if value := normalizeBearerToken(clientAPIKey); value != "" {
		return value
	}
	return normalizeBearerToken(s.cfg.DefaultProviderAPIKey)
}

func (s *Server) resolveUpstreamBaseURL(clientBaseURL string) (string, error) {
	return s.resolveUpstreamBaseURLWithFallback(clientBaseURL, s.cfg.DefaultUpstreamBaseURL)
}

func (s *Server) resolveUpstreamBaseURLNoFallback(clientBaseURL string) (string, error) {
	return s.resolveUpstreamBaseURLWithFallback(clientBaseURL, "")
}

func (s *Server) resolveUpstreamBaseURLWithFallback(clientBaseURL string, fallback string) (string, error) {
	baseURL := strings.TrimSpace(clientBaseURL)
	if baseURL == "" {
		baseURL = fallback
	}

	parsed, err := url.Parse(baseURL)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return "", errors.New("Invalid upstream base URL.")
	}
	if parsed.User != nil {
		return "", errors.New("Upstream base URL must not contain credentials.")
	}
	if parsed.RawQuery != "" || parsed.Fragment != "" {
		return "", errors.New("Upstream base URL must not contain query or fragment.")
	}
	if s.cfg.StrictUpstreamSecurity && parsed.Scheme != "https" && !s.cfg.AllowInsecureUpstreams {
		return "", errors.New("Upstream base URL must use https.")
	}
	if s.cfg.StrictUpstreamSecurity {
		if err := rejectUnsafeHost(parsed.Hostname()); err != nil {
			return "", err
		}
	}
	upstreamPath := strings.ToLower(strings.TrimRight(parsed.Path, "/"))
	if strings.HasSuffix(upstreamPath, "/images/generations") || strings.HasSuffix(upstreamPath, "/images/edits") {
		return "", errors.New("Upstream base URL should point to the provider /v1 address, not your local Go API address.")
	}
	return strings.TrimRight(baseURL, "/"), nil
}

func rejectUnsafeHost(host string) error {
	host = strings.TrimSpace(strings.Trim(host, "[]"))
	if host == "" {
		return errors.New("Invalid upstream base URL host.")
	}
	lower := strings.ToLower(host)
	if lower == "localhost" || strings.HasSuffix(lower, ".localhost") {
		return errors.New("Upstream base URL host is not allowed.")
	}
	if ip := net.ParseIP(host); ip != nil {
		if isUnsafeIP(ip) {
			return errors.New("Upstream base URL points to a private or local address.")
		}
		return nil
	}
	ips, err := net.LookupIP(host)
	if err != nil {
		return errors.New("Upstream base URL host could not be resolved.")
	}
	if len(ips) == 0 {
		return errors.New("Upstream base URL host could not be resolved.")
	}
	for _, ip := range ips {
		if isUnsafeIP(ip) {
			return errors.New("Upstream base URL resolves to a private or local address.")
		}
	}
	return nil
}

func isUnsafeIP(ip net.IP) bool {
	if ip == nil {
		return true
	}
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified() || ip.IsMulticast()
}

func buildMultipartBody(form *multipart.Form) (io.Reader, string, error) {
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	for key, values := range form.Value {
		for _, value := range values {
			if err := writer.WriteField(key, value); err != nil {
				return nil, "", err
			}
		}
	}

	for fieldName, files := range form.File {
		for _, fileHeader := range files {
			if err := copyMultipartFile(writer, fieldName, fileHeader); err != nil {
				return nil, "", err
			}
		}
	}

	if err := writer.Close(); err != nil {
		return nil, "", err
	}
	return body, writer.FormDataContentType(), nil
}

func copyMultipartFile(writer *multipart.Writer, fieldName string, fileHeader *multipart.FileHeader) error {
	file, err := fileHeader.Open()
	if err != nil {
		return err
	}
	defer file.Close()

	header := make(textproto.MIMEHeader)
	header.Set("Content-Disposition", fmt.Sprintf(`form-data; name="%s"; filename="%s"`, escapeQuotes(fieldName), escapeQuotes(fileHeader.Filename)))
	contentType := fileHeader.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	header.Set("Content-Type", contentType)

	part, err := writer.CreatePart(header)
	if err != nil {
		return err
	}
	_, err = io.Copy(part, file)
	return err
}

func escapeQuotes(value string) string {
	return strings.NewReplacer("\\", "\\\\", "\"", "\\\"").Replace(value)
}

func (s *Server) proxyRequest(w http.ResponseWriter, done <-chan struct{}, upstreamURL string, authorizationHeader string, contentType string, body io.Reader) {
	startedAt := time.Now()
	req, err := http.NewRequest(http.MethodPost, upstreamURL, body)
	if err != nil {
		jsonResponse(w, http.StatusBadGateway, errorPayload("Upstream request failed: "+err.Error()))
		return
	}
	req.Header.Set("Authorization", authorizationHeader)
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}

	resp, err := s.client.Do(req)
	upstreamHeaderDuration := time.Since(startedAt)
	select {
	case <-done:
		return
	default:
	}
	if err != nil {
		slog.Warn("proxy upstream request failed", "upstream_url", redact.String(upstreamURL), "duration_ms", upstreamHeaderDuration.Milliseconds(), "error", redact.String(err.Error()))
		jsonResponse(w, http.StatusBadGateway, errorPayload("Upstream request failed: "+err.Error()))
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode < http.StatusBadRequest {
		copyResponseHeaders(w.Header(), resp.Header)
		w.Header().Set("X-Proxy-Upstream-Headers-Ms", fmt.Sprintf("%d", upstreamHeaderDuration.Milliseconds()))
		w.WriteHeader(resp.StatusCode)
		written, copyErr := io.Copy(w, resp.Body)
		slog.Info("proxy upstream response",
			"upstream_url", redact.String(upstreamURL),
			"status", resp.StatusCode,
			"upstream_headers_ms", upstreamHeaderDuration.Milliseconds(),
			"downstream_body_ms", (time.Since(startedAt) - upstreamHeaderDuration).Milliseconds(),
			"bytes", written,
			"copy_error", copyErr,
		)
		return
	}

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		jsonResponse(w, http.StatusBadGateway, errorPayload("Upstream request failed: "+err.Error()))
		return
	}
	if rewriteStatus, rewriteBody, ok := rewriteKnownUpstreamError(resp.StatusCode, respBody); ok {
		slog.Warn("proxy upstream error rewritten",
			"upstream_url", redact.String(upstreamURL),
			"status", resp.StatusCode,
			"rewritten_status", rewriteStatus,
			"upstream_headers_ms", upstreamHeaderDuration.Milliseconds(),
			"body", summarizeBody(respBody, 4096),
		)
		jsonResponse(w, rewriteStatus, rewriteBody)
		return
	}

	copyResponseHeaders(w.Header(), resp.Header)
	w.Header().Set("X-Proxy-Upstream-Headers-Ms", fmt.Sprintf("%d", upstreamHeaderDuration.Milliseconds()))
	w.WriteHeader(resp.StatusCode)
	_, _ = w.Write(respBody)
	slog.Warn("proxy upstream error",
		"upstream_url", redact.String(upstreamURL),
		"status", resp.StatusCode,
		"upstream_headers_ms", upstreamHeaderDuration.Milliseconds(),
		"downstream_body_ms", (time.Since(startedAt) - upstreamHeaderDuration).Milliseconds(),
		"bytes", len(respBody),
		"body", summarizeBody(respBody, 4096),
	)
}

func summarizeBody(body []byte, limit int) string {
	body = bytes.TrimSpace(body)
	if len(body) == 0 {
		return ""
	}
	truncated := len(body) > limit
	if truncated {
		body = body[:limit]
		for !utf8.Valid(body) && len(body) > 0 {
			body = body[:len(body)-1]
		}
	}
	summary := string(body)
	summary = strings.ReplaceAll(summary, "\r", "\\r")
	summary = strings.ReplaceAll(summary, "\n", "\\n")
	summary = redact.String(summary)
	if truncated {
		summary += "...<truncated>"
	}
	return summary
}

func copyResponseHeaders(dst http.Header, src http.Header) {
	for name, values := range src {
		if _, blocked := hopByHopHeaders[strings.ToLower(name)]; blocked {
			continue
		}
		for _, value := range values {
			dst.Add(name, value)
		}
	}
}

func rewriteKnownUpstreamError(status int, body []byte) (int, map[string]any, bool) {
	if status != http.StatusBadRequest {
		return 0, nil, false
	}

	var decoded struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(body, &decoded); err != nil {
		return 0, nil, false
	}
	if strings.TrimSpace(decoded.Error.Message) != "Tool choice 'image_generation' not found in 'tools' parameter." {
		return 0, nil, false
	}
	return http.StatusServiceUnavailable, errorPayload("当前使用人数过多，请重试"), true
}

func jsonResponse(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func errorPayload(message string) map[string]any {
	return map[string]any{"error": map[string]string{"message": message}}
}

func missingAPIKeyPayload() map[string]any {
	return errorPayload("Missing API key. Set OPENAI_API_KEY on the server or send api_key / Authorization from the client.")
}

func apiKeyForTaskStorage(authorizationHeader string, explicitAPIKey string) string {
	if strings.TrimSpace(explicitAPIKey) != "" {
		return explicitAPIKey
	}
	serverAuth := normalizeBearerToken(os.Getenv("OPENAI_API_KEY"))
	if serverAuth != "" && authorizationHeader == serverAuth {
		return ""
	}
	return authorizationHeader
}

func formFieldsForTask(values map[string][]string) map[string]string {
	fields := make(map[string]string)
	for key, list := range values {
		if strings.HasPrefix(key, "__") || key == "model" || key == "prompt" {
			continue
		}
		if len(list) == 0 {
			continue
		}
		fields[key] = list[0]
	}
	return fields
}

func (s *Server) saveEditUploads(ctx context.Context, taskID string, images []*multipart.FileHeader, masks []*multipart.FileHeader) ([]map[string]string, map[string]string, error) {
	savedImages := make([]map[string]string, 0, len(images))
	for i, file := range images {
		saved, err := s.store.SaveUpload(ctx, taskID, fmt.Sprintf("input_%d", i), file)
		if err != nil {
			return nil, nil, err
		}
		savedImages = append(savedImages, uploadParam(saved))
	}

	var savedMask map[string]string
	if len(masks) > 0 {
		saved, err := s.store.SaveUpload(ctx, taskID, "mask", masks[0])
		if err != nil {
			return nil, nil, err
		}
		savedMask = uploadParam(saved)
	}
	return savedImages, savedMask, nil
}

func uploadParam(file *storage.SavedFile) map[string]string {
	return map[string]string{
		"storage_key": file.StorageKey,
		"filename":    file.Filename,
		"mime":        file.MIME,
	}
}
