package httpapi

import "museforge/internal/tasks"

type v1TaskDTOData struct {
	ID                      any              `json:"id"`
	Type                    string           `json:"type"`
	Status                  any              `json:"status"`
	Prompt                  any              `json:"prompt"`
	Model                   any              `json:"model"`
	ProviderBaseURLSnapshot any              `json:"providerBaseUrlSnapshot"`
	Params                  map[string]any   `json:"params"`
	InputAssets             []any            `json:"inputAssets"`
	OutputAssets            []v1AssetDTOData `json:"outputAssets"`
	Assets                  []v1AssetDTOData `json:"assets"`
	Error                   any              `json:"error"`
	LastError               any              `json:"lastError"`
	AttemptCount            any              `json:"attemptCount"`
	MaxAttempts             any              `json:"maxAttempts"`
	NextRunAt               any              `json:"nextRunAt"`
	CreatedAt               any              `json:"createdAt"`
	StartedAt               any              `json:"startedAt"`
	CompletedAt             any              `json:"completedAt"`
	ProjectID               any              `json:"projectId"`
	Owner                   map[string]any   `json:"owner"`
}

type v1AssetDTOData struct {
	ID           any            `json:"id"`
	TaskID       any            `json:"taskId"`
	TaskType     any            `json:"taskType"`
	ProjectID    any            `json:"projectId"`
	Kind         string         `json:"kind"`
	Prompt       any            `json:"prompt"`
	StorageKey   any            `json:"storageKey"`
	PublicURL    any            `json:"publicUrl"`
	ThumbnailURL any            `json:"thumbnailUrl"`
	MIME         any            `json:"mime"`
	Width        any            `json:"width"`
	Height       any            `json:"height"`
	SizeBytes    any            `json:"sizeBytes"`
	SHA256       any            `json:"sha256"`
	Visibility   string         `json:"visibility"`
	Metadata     map[string]any `json:"metadata"`
	CreatedAt    any            `json:"createdAt"`
}

type v1ProviderProfileDTOData struct {
	ID             any            `json:"id"`
	Name           any            `json:"name"`
	Type           any            `json:"type"`
	BaseURL        any            `json:"baseUrl"`
	APIKeyHint     any            `json:"apiKeyHint"`
	Model          any            `json:"model"`
	APIMode        any            `json:"apiMode"`
	ProviderConfig map[string]any `json:"providerConfig"`
	CreatedAt      any            `json:"createdAt"`
	DeletedAt      any            `json:"deletedAt"`
}

func v1TaskDTO(task map[string]any) v1TaskDTOData {
	params := objectValue(task["params"])
	if len(params) == 0 {
		params = objectValue(task["params_json"])
	}
	assets := arrayValue(task["assets"])
	outputAssets := make([]v1AssetDTOData, 0, len(assets))
	for _, item := range assets {
		if asset, ok := item.(map[string]any); ok {
			outputAssets = append(outputAssets, v1AssetDTO(asset))
		}
	}
	return v1TaskDTOData{
		ID:                      task["id"],
		Type:                    v1TaskType(stringValue(task["type"])),
		Status:                  task["status"],
		Prompt:                  task["prompt"],
		Model:                   task["model"],
		ProviderBaseURLSnapshot: task["provider_base_url_snapshot"],
		Params:                  params,
		InputAssets:             []any{},
		OutputAssets:            outputAssets,
		Assets:                  outputAssets,
		Error:                   nullableStringValue(task["error"]),
		LastError:               nullableStringValue(task["last_error"]),
		AttemptCount:            numberValue(task["attempt_count"]),
		MaxAttempts:             numberValue(task["max_attempts"]),
		NextRunAt:               nullableStringValue(task["next_run_at"]),
		CreatedAt:               task["created_at"],
		StartedAt:               nullableStringValue(task["started_at"]),
		CompletedAt:             nullableStringValue(task["completed_at"]),
		ProjectID:               nilString(),
		Owner:                   map[string]any{"type": "anonymous", "id": "current"},
	}
}

func v1AssetDTO(asset map[string]any) v1AssetDTOData {
	metadata := objectValue(asset["metadata"])
	if len(metadata) == 0 {
		metadata = objectValue(asset["metadata_json"])
	}
	return v1AssetDTOData{
		ID:           asset["id"],
		TaskID:       asset["task_id"],
		TaskType:     asset["task_type"],
		ProjectID:    nullableStringValue(asset["project_id"]),
		Kind:         stringValueDefault(asset["kind"], "output"),
		Prompt:       asset["prompt"],
		StorageKey:   asset["storage_key"],
		PublicURL:    asset["public_url"],
		ThumbnailURL: nilString(),
		MIME:         asset["mime"],
		Width:        numberValue(asset["width"]),
		Height:       numberValue(asset["height"]),
		SizeBytes:    numberValue(asset["size_bytes"]),
		SHA256:       asset["sha256"],
		Visibility:   stringValueDefault(asset["visibility"], "private"),
		Metadata:     metadata,
		CreatedAt:    asset["created_at"],
	}
}

func v1ProviderProfileDTO(profile map[string]any) v1ProviderProfileDTOData {
	return v1ProviderProfileDTOData{
		ID:             profile["id"],
		Name:           profile["name"],
		Type:           profile["type"],
		BaseURL:        profile["base_url"],
		APIKeyHint:     profile["api_key_hint"],
		Model:          profile["model"],
		APIMode:        profile["api_mode"],
		ProviderConfig: objectValue(profile["provider_config_json"]),
		CreatedAt:      profile["created_at"],
		DeletedAt:      nullableStringValue(profile["deleted_at"]),
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
