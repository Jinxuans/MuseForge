package tasks

import (
	"encoding/json"
	"time"
)

const (
	TypeGeneration = "generation"
	TypeEdit       = "edit"

	StatusPreparing = "preparing"
	StatusQueued    = "queued"
	StatusRunning   = "running"
	StatusSucceeded = "succeeded"
	StatusFailed    = "failed"
	StatusCanceled  = "canceled"
)

type Task struct {
	ID                      string          `json:"id"`
	Type                    string          `json:"type"`
	Model                   string          `json:"model"`
	Prompt                  string          `json:"prompt"`
	Params                  json.RawMessage `json:"params_json"`
	Status                  string          `json:"status"`
	Error                   string          `json:"error,omitempty"`
	LastError               string          `json:"last_error,omitempty"`
	AttemptCount            int             `json:"attempt_count"`
	MaxAttempts             int             `json:"max_attempts"`
	NextRunAt               *time.Time      `json:"next_run_at,omitempty"`
	ProviderBaseURLSnapshot string          `json:"provider_base_url_snapshot"`
	CreatedAt               time.Time       `json:"created_at"`
	StartedAt               *time.Time      `json:"started_at,omitempty"`
	CompletedAt             *time.Time      `json:"completed_at,omitempty"`
	Assets                  []Asset         `json:"assets,omitempty"`
}

type Asset struct {
	ID         string          `json:"id"`
	TaskID     string          `json:"task_id"`
	ProjectID  string          `json:"project_id,omitempty"`
	Kind       string          `json:"kind"`
	TaskType   string          `json:"task_type,omitempty"`
	Prompt     string          `json:"prompt,omitempty"`
	StorageKey string          `json:"storage_key"`
	PublicURL  string          `json:"public_url"`
	MIME       string          `json:"mime"`
	Width      int             `json:"width,omitempty"`
	Height     int             `json:"height,omitempty"`
	SizeBytes  int64           `json:"size_bytes"`
	SHA256     string          `json:"sha256"`
	Visibility string          `json:"visibility"`
	Metadata   json.RawMessage `json:"metadata_json,omitempty"`
	CreatedAt  time.Time       `json:"created_at"`
	DeletedAt  *time.Time      `json:"deleted_at,omitempty"`
}

type CreateGenerationTask struct {
	BaseURL     string
	APIKey      string
	ClientHash  string
	Model       string
	Prompt      string
	Params      map[string]any
	MaxAttempts int
}

type CreateEditTask struct {
	BaseURL     string
	APIKey      string
	ClientHash  string
	Model       string
	Prompt      string
	Params      map[string]any
	MaxAttempts int
}
