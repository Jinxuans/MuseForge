package httpapi

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"museforge/internal/config"
	"museforge/internal/providers"
	"museforge/internal/storage"
	"museforge/internal/tasks"
)

const maxMultipartMemory = 64 << 20

type Server struct {
	cfg       config.Config
	client    *http.Client
	staticFS  http.FileSystem
	repo      *tasks.Repository
	providers *providers.Repository
	worker    *tasks.Worker
	store     *storage.Local
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
