package httpapi

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestParseProviderProfilePatchNormalizesAliases(t *testing.T) {
	patch, err := parseProviderProfilePatch(map[string]any{
		"name":           "  Demo  ",
		"type":           "custom",
		"baseUrl":        "  https://example.com/v1  ",
		"apiKey":         "  secret  ",
		"defaultModel":   "  model-a  ",
		"apiMode":        "responses",
		"providerConfig": map[string]any{"endpoint": "/images"},
	}, func(value string) (string, error) {
		return strings.TrimSpace(value), nil
	})
	if err != nil {
		t.Fatalf("parseProviderProfilePatch returned error: %v", err)
	}

	assertStringPointer(t, "name", patch.Name, "Demo")
	assertStringPointer(t, "type", patch.Type, "custom-http-image")
	assertStringPointer(t, "base url", patch.BaseURL, "https://example.com/v1")
	assertStringPointer(t, "api key", patch.APIKey, "secret")
	assertStringPointer(t, "model", patch.Model, "model-a")
	assertStringPointer(t, "api mode", patch.APIMode, "responses")
	if patch.ProviderConfig == nil {
		t.Fatalf("provider config is nil")
	}
	var config map[string]any
	if err := json.Unmarshal(*patch.ProviderConfig, &config); err != nil {
		t.Fatalf("decode provider config: %v", err)
	}
	if endpoint, _ := config["endpoint"].(string); endpoint != "/images" {
		t.Fatalf("endpoint = %q, want /images", endpoint)
	}
}

func TestParseProviderProfilePatchRejectsInvalidFields(t *testing.T) {
	tests := []struct {
		name    string
		payload map[string]any
		wantErr string
	}{
		{name: "invalid name type", payload: map[string]any{"name": 123}, wantErr: "name must be a string."},
		{name: "empty name", payload: map[string]any{"name": "  "}, wantErr: "name cannot be empty."},
		{name: "invalid type", payload: map[string]any{"type": "other"}, wantErr: "provider profile type must be openai, fal, or custom-http-image"},
		{name: "invalid api mode", payload: map[string]any{"apiMode": "chat"}, wantErr: "provider profile api_mode must be images or responses"},
		{name: "invalid provider config", payload: map[string]any{"providerConfig": []any{"bad"}}, wantErr: "provider_config must be a JSON object."},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := parseProviderProfilePatch(tt.payload, func(value string) (string, error) {
				return strings.TrimSpace(value), nil
			})
			if err == nil || err.Error() != tt.wantErr {
				t.Fatalf("error = %v, want %q", err, tt.wantErr)
			}
		})
	}
}

func assertStringPointer(t *testing.T, label string, got *string, want string) {
	t.Helper()
	if got == nil {
		t.Fatalf("%s is nil, want %q", label, want)
	}
	if *got != want {
		t.Fatalf("%s = %q, want %q", label, *got, want)
	}
}
