package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strings"

	"museforge/internal/tasks"
)

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
	if len(params) == 0 {
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
