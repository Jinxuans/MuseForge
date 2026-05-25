package httpapi

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"strings"
	"time"
	"unicode/utf8"

	"museforge/internal/redact"
)

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
