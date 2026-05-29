package httpapi

import (
	"encoding/json"
	"strings"
)

type providerProfilePatch struct {
	Name           *string
	Type           *string
	BaseURL        *string
	APIKey         *string
	Model          *string
	APIMode        *string
	ProviderConfig *json.RawMessage
}

func parseProviderProfilePatch(payload map[string]any, resolveBaseURL func(string) (string, error)) (*providerProfilePatch, error) {
	patch := &providerProfilePatch{}

	name, ok, valid := optionalPayloadString(payload, "name")
	if !valid {
		return nil, badRequestError("name must be a string.")
	}
	if ok {
		trimmed := strings.TrimSpace(name)
		if trimmed == "" {
			return nil, badRequestError("name cannot be empty.")
		}
		patch.Name = &trimmed
	}

	profileType, ok, valid := optionalPayloadString(payload, "type")
	if !valid {
		return nil, badRequestError("type must be a string.")
	}
	if ok {
		normalized, err := normalizeProviderProfileType(profileType)
		if err != nil {
			return nil, err
		}
		patch.Type = &normalized
	}

	baseURL, ok, valid := optionalPayloadString(payload, "base_url", "baseUrl")
	if !valid {
		return nil, badRequestError("base_url must be a string.")
	}
	if ok {
		resolved, err := resolveBaseURL(baseURL)
		if err != nil {
			return nil, err
		}
		patch.BaseURL = &resolved
	}

	apiKey, ok, valid := optionalPayloadString(payload, "api_key", "apiKey")
	if !valid {
		return nil, badRequestError("api_key must be a string.")
	}
	if ok {
		trimmed := strings.TrimSpace(apiKey)
		patch.APIKey = &trimmed
	}

	model, ok, valid := optionalPayloadString(payload, "model", "default_model", "defaultModel")
	if !valid {
		return nil, badRequestError("model must be a string.")
	}
	if ok {
		trimmed := strings.TrimSpace(model)
		patch.Model = &trimmed
	}

	apiMode, ok, valid := optionalPayloadString(payload, "api_mode", "apiMode")
	if !valid {
		return nil, badRequestError("api_mode must be a string.")
	}
	if ok {
		normalized, err := normalizeProviderProfileAPIMode(apiMode)
		if err != nil {
			return nil, err
		}
		patch.APIMode = &normalized
	}

	providerConfig, ok, valid := optionalPayloadJSON(payload, "provider_config", "providerConfig", "provider_config_json")
	if !valid {
		return nil, badRequestError("provider_config must be valid JSON.")
	}
	if ok {
		normalized, err := normalizeProviderProfileConfig(providerConfig)
		if err != nil {
			return nil, err
		}
		patch.ProviderConfig = &normalized
	}

	return patch, nil
}

type badRequestError string

func (e badRequestError) Error() string {
	return string(e)
}
