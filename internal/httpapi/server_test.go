package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"museforge/internal/config"
)

func TestV1HealthCapabilitiesWrapsEnvelopeAndRequestID(t *testing.T) {
	srv := New(config.Config{
		DefaultUpstreamBaseURL: "https://api.openai.com/v1",
		DefaultProviderAPIKey:  "test-key",
	}, nil, nil, nil, nil, nil)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/health-capabilities", nil)
	req.Header.Set("X-Request-ID", "req-123")
	rec := httptest.NewRecorder()

	srv.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("unexpected status: %d", rec.Code)
	}

	var payload map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if ok, _ := payload["ok"].(bool); !ok {
		t.Fatalf("expected ok=true, got %v", payload["ok"])
	}
	if requestID, _ := payload["requestId"].(string); requestID != "req-123" {
		t.Fatalf("expected requestId=req-123, got %q", requestID)
	}

	data, _ := payload["data"].(map[string]any)
	if data == nil {
		t.Fatalf("expected data object, got %T", payload["data"])
	}
	if asyncTasks, _ := data["asyncTasks"].(bool); asyncTasks {
		t.Fatalf("expected asyncTasks=false without repo/worker")
	}
	if defaultProviderApiKey, _ := data["defaultProviderApiKey"].(bool); !defaultProviderApiKey {
		t.Fatalf("expected defaultProviderApiKey=true")
	}
	if upstreamBaseURL, _ := data["upstreamBaseUrl"].(string); upstreamBaseURL != "https://api.openai.com/v1" {
		t.Fatalf("expected upstreamBaseUrl=https://api.openai.com/v1, got %q", upstreamBaseURL)
	}
	if auth, _ := data["auth"].(bool); auth {
		t.Fatalf("auth must remain false until user sessions are implemented")
	}
	if square, _ := data["square"].(bool); square {
		t.Fatalf("square must remain false until the Go square backend is implemented")
	}
}

func TestV1MeReturnsAnonymousPrincipal(t *testing.T) {
	srv := New(config.Config{}, nil, nil, nil, nil, nil)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/me", nil)
	req.Header.Set("X-Client-ID", "client-a")
	req.Header.Set("X-Request-ID", "req-me")
	rec := httptest.NewRecorder()

	srv.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("unexpected status: %d", rec.Code)
	}

	var payload map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if ok, _ := payload["ok"].(bool); !ok {
		t.Fatalf("expected ok=true, got %v", payload["ok"])
	}
	if requestID, _ := payload["requestId"].(string); requestID != "req-me" {
		t.Fatalf("requestId = %q, want req-me", requestID)
	}
	data, _ := payload["data"].(map[string]any)
	if data == nil {
		t.Fatalf("expected data object, got %T", payload["data"])
	}
	principal, _ := data["principal"].(map[string]any)
	if principal == nil {
		t.Fatalf("expected principal object, got %T", data["principal"])
	}
	if principalType, _ := principal["type"].(string); principalType != "anonymous" {
		t.Fatalf("type = %q, want anonymous", principalType)
	}
	if authenticated, _ := principal["authenticated"].(bool); authenticated {
		t.Fatalf("expected authenticated=false")
	}
	if hasAnonymousIdentity, _ := principal["hasAnonymousIdentity"].(bool); !hasAnonymousIdentity {
		t.Fatalf("expected hasAnonymousIdentity=true")
	}
	if hasSession, _ := principal["hasSession"].(bool); hasSession {
		t.Fatalf("expected hasSession=false")
	}
	if _, ok := principal["anonymousTokenHash"]; ok {
		t.Fatalf("principal must not expose anonymousTokenHash")
	}
}

func TestV1MeDoesNotExposeBearerTokenHash(t *testing.T) {
	srv := New(config.Config{}, nil, nil, nil, nil, nil)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/me", nil)
	req.Header.Set("X-Client-ID", "client-a")
	req.Header.Set("Authorization", "Bearer session-token")
	rec := httptest.NewRecorder()

	srv.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("unexpected status: %d", rec.Code)
	}

	var payload map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	data, _ := payload["data"].(map[string]any)
	principal, _ := data["principal"].(map[string]any)
	if hasSession, _ := principal["hasSession"].(bool); !hasSession {
		t.Fatalf("expected hasSession=true")
	}
	if _, ok := principal["sessionTokenHash"]; ok {
		t.Fatalf("principal must not expose sessionTokenHash")
	}
}

func TestV1AuthLogoutClearsSessionCookie(t *testing.T) {
	srv := New(config.Config{}, nil, nil, nil, nil, nil)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/logout", nil)
	req.AddCookie(&http.Cookie{Name: sessionCookieName, Value: "session-token"})
	rec := httptest.NewRecorder()

	srv.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("unexpected status: %d", rec.Code)
	}

	var payload map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if ok, _ := payload["ok"].(bool); !ok {
		t.Fatalf("expected ok=true, got %v", payload["ok"])
	}
	data, _ := payload["data"].(map[string]any)
	if loggedOut, _ := data["loggedOut"].(bool); !loggedOut {
		t.Fatalf("expected loggedOut=true")
	}

	cookies := rec.Result().Cookies()
	if len(cookies) == 0 {
		t.Fatalf("expected Set-Cookie")
	}
	var sessionCookie *http.Cookie
	for _, cookie := range cookies {
		if cookie.Name == sessionCookieName {
			sessionCookie = cookie
			break
		}
	}
	if sessionCookie == nil {
		t.Fatalf("expected %s cookie", sessionCookieName)
	}
	if sessionCookie.Value != "" {
		t.Fatalf("session cookie value = %q, want empty", sessionCookie.Value)
	}
	if sessionCookie.MaxAge != -1 {
		t.Fatalf("session cookie MaxAge = %d, want -1", sessionCookie.MaxAge)
	}
	if !sessionCookie.HttpOnly {
		t.Fatalf("expected HttpOnly session cookie")
	}
}

func TestParseAssetKindFilter(t *testing.T) {
	tests := []struct {
		name     string
		value    string
		wantKind string
		wantOK   bool
	}{
		{name: "empty", value: "", wantKind: "", wantOK: true},
		{name: "trim output", value: " output ", wantKind: "output", wantOK: true},
		{name: "input", value: "input", wantKind: "input", wantOK: true},
		{name: "mask", value: "mask", wantKind: "mask", wantOK: true},
		{name: "reference", value: "reference", wantKind: "reference", wantOK: true},
		{name: "thumbnail", value: "thumbnail", wantKind: "thumbnail", wantOK: true},
		{name: "invalid", value: "avatar", wantKind: "", wantOK: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotKind, gotOK := parseAssetKindFilter(tt.value)
			if gotKind != tt.wantKind || gotOK != tt.wantOK {
				t.Fatalf("parseAssetKindFilter(%q) = (%q, %v), want (%q, %v)", tt.value, gotKind, gotOK, tt.wantKind, tt.wantOK)
			}
		})
	}
}

func TestV1AssetsRejectsInvalidKindBeforeRepository(t *testing.T) {
	srv := New(config.Config{}, nil, nil, nil, nil, nil)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/assets?kind=avatar", nil)
	req.Header.Set("X-Client-ID", "client-a")
	rec := httptest.NewRecorder()

	srv.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("unexpected status: %d", rec.Code)
	}

	var payload map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if ok, _ := payload["ok"].(bool); ok {
		t.Fatalf("expected ok=false, got %v", payload["ok"])
	}
	errPayload, _ := payload["error"].(map[string]any)
	if errPayload == nil {
		t.Fatalf("expected error object, got %T", payload["error"])
	}
	if message, _ := errPayload["message"].(string); message != "Invalid asset kind." {
		t.Fatalf("expected invalid kind message, got %q", message)
	}
	if code, _ := errPayload["code"].(string); code != "invalid_request" {
		t.Fatalf("expected invalid_request code, got %q", code)
	}
}

func TestV1AssetsRejectsInvalidTaskIDBeforeRepository(t *testing.T) {
	srv := New(config.Config{}, nil, nil, nil, nil, nil)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/assets?task_id=not-a-uuid", nil)
	req.Header.Set("X-Client-ID", "client-a")
	rec := httptest.NewRecorder()

	srv.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("unexpected status: %d", rec.Code)
	}

	var payload map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if ok, _ := payload["ok"].(bool); ok {
		t.Fatalf("expected ok=false, got %v", payload["ok"])
	}
	errPayload, _ := payload["error"].(map[string]any)
	if errPayload == nil {
		t.Fatalf("expected error object, got %T", payload["error"])
	}
	if message, _ := errPayload["message"].(string); message != "Invalid task id." {
		t.Fatalf("expected invalid task id message, got %q", message)
	}
	if code, _ := errPayload["code"].(string); code != "invalid_request" {
		t.Fatalf("expected invalid_request code, got %q", code)
	}
}

func TestV1TasksWithoutDatabaseReturnsServiceUnavailableEnvelope(t *testing.T) {
	srv := New(config.Config{}, nil, nil, nil, nil, nil)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/tasks", nil)
	req.Header.Set("X-Client-ID", "client-a")
	req.Header.Set("X-Request-ID", "req-no-db")
	rec := httptest.NewRecorder()

	srv.ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("unexpected status: %d", rec.Code)
	}

	var payload map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if ok, _ := payload["ok"].(bool); ok {
		t.Fatalf("expected ok=false, got %v", payload["ok"])
	}
	if requestID, _ := payload["requestId"].(string); requestID != "req-no-db" {
		t.Fatalf("requestId = %q, want req-no-db", requestID)
	}
	errPayload, _ := payload["error"].(map[string]any)
	if errPayload == nil {
		t.Fatalf("expected error object, got %T", payload["error"])
	}
	if code, _ := errPayload["code"].(string); code != "service_unavailable" {
		t.Fatalf("expected service_unavailable code, got %q", code)
	}
	if message, _ := errPayload["message"].(string); message != "Async task API requires DATABASE_URL." {
		t.Fatalf("unexpected message: %q", message)
	}
}

func TestV1TaskDTOFallsBackToParamsJSON(t *testing.T) {
	dto := v1TaskDTO(map[string]any{
		"id":          "task-1",
		"type":        "generation",
		"status":      "running",
		"prompt":      "prompt",
		"model":       "gpt-image-2",
		"params_json": map[string]any{"size": "1024x1024", "n": float64(1)},
	})

	params, _ := dto["params"].(map[string]any)
	if params == nil {
		t.Fatalf("expected params object, got %T", dto["params"])
	}
	if size, _ := params["size"].(string); size != "1024x1024" {
		t.Fatalf("size = %q, want 1024x1024", size)
	}
	if taskType, _ := dto["type"].(string); taskType != "image_generation" {
		t.Fatalf("type = %q, want image_generation", taskType)
	}
}

func TestV1AssetDTOUsesVisibilityWhenPresent(t *testing.T) {
	dto := v1AssetDTO(map[string]any{
		"id":         "asset-1",
		"task_id":    "task-1",
		"public_url": "/files/result.png",
		"mime":       "image/png",
		"visibility": "unlisted",
	})

	if visibility, _ := dto["visibility"].(string); visibility != "unlisted" {
		t.Fatalf("visibility = %q, want unlisted", visibility)
	}
}

func TestV1AssetDTODefaultsVisibilityToPrivate(t *testing.T) {
	dto := v1AssetDTO(map[string]any{
		"id":         "asset-1",
		"task_id":    "task-1",
		"public_url": "/files/result.png",
		"mime":       "image/png",
	})

	if visibility, _ := dto["visibility"].(string); visibility != "private" {
		t.Fatalf("visibility = %q, want private", visibility)
	}
}

func TestV1AssetDTOIncludesMetadata(t *testing.T) {
	dto := v1AssetDTO(map[string]any{
		"id":            "asset-1",
		"task_id":       "task-1",
		"public_url":    "/files/result.png",
		"mime":          "image/png",
		"metadata_json": map[string]any{"revised_prompt": "rewritten prompt"},
	})

	metadata, _ := dto["metadata"].(map[string]any)
	if metadata == nil {
		t.Fatalf("expected metadata object, got %T", dto["metadata"])
	}
	if revisedPrompt, _ := metadata["revised_prompt"].(string); revisedPrompt != "rewritten prompt" {
		t.Fatalf("revised_prompt = %q, want rewritten prompt", revisedPrompt)
	}
}
