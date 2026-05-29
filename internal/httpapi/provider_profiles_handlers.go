package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"museforge/internal/redact"
)

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
		patch, err := parseProviderProfilePatch(payload, s.resolveUpstreamBaseURLNoFallback)
		if err != nil {
			jsonResponse(w, http.StatusBadRequest, errorPayload(err.Error()))
			return
		}
		profile, err := s.providers.Update(
			r.Context(),
			clientHash,
			id,
			patch.Name,
			patch.Type,
			patch.BaseURL,
			patch.APIKey,
			patch.Model,
			patch.APIMode,
			patch.ProviderConfig,
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
