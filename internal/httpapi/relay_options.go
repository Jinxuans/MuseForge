package httpapi

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
)

type relayOptions struct {
	UpstreamBaseURL   string
	APIKey            string
	ProviderProfileID int64
	ClientHash        string
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

func firstRawJSON(values ...json.RawMessage) json.RawMessage {
	for _, value := range values {
		if len(value) > 0 && strings.TrimSpace(string(value)) != "" {
			return value
		}
	}
	return nil
}
