package tasks

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"
)

type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) CreateGeneration(ctx context.Context, input CreateGenerationTask) (*Task, error) {
	return r.createTask(ctx, TypeGeneration, input.ClientHash, input.BaseURL, input.APIKey, input.Model, input.Prompt, input.Params, input.MaxAttempts, StatusQueued)
}

func (r *Repository) CreateEdit(ctx context.Context, input CreateEditTask) (*Task, error) {
	return r.createTask(ctx, TypeEdit, input.ClientHash, input.BaseURL, input.APIKey, input.Model, input.Prompt, input.Params, input.MaxAttempts, StatusPreparing)
}

func (r *Repository) createTask(ctx context.Context, taskType string, clientHash string, baseURL string, apiKey string, model string, prompt string, paramsMap map[string]any, maxAttempts int, status string) (*Task, error) {
	params, err := json.Marshal(paramsMap)
	if err != nil {
		return nil, err
	}
	if maxAttempts <= 0 {
		maxAttempts = 1
	}
	if status == "" {
		status = StatusQueued
	}

	id := newID()
	var task Task
	err = r.db.QueryRowContext(ctx, `
		INSERT INTO tasks (
			id, anonymous_token_hash, provider_base_url_snapshot, provider_api_key_plaintext,
			type, model, prompt, params_json, status, max_attempts
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING id, type, model, prompt, params_json, status, COALESCE(error, ''),
			COALESCE(last_error, ''), attempt_count, max_attempts, next_run_at,
			provider_base_url_snapshot, created_at, started_at, completed_at
	`, id, clientHash, baseURL, nullString(apiKey), taskType, model, prompt, params, status, maxAttempts).Scan(
		&task.ID, &task.Type, &task.Model, &task.Prompt, &task.Params, &task.Status, &task.Error,
		&task.LastError, &task.AttemptCount, &task.MaxAttempts, &task.NextRunAt,
		&task.ProviderBaseURLSnapshot, &task.CreatedAt, &task.StartedAt, &task.CompletedAt,
	)
	if err != nil {
		return nil, err
	}
	return &task, nil
}

func (r *Repository) List(ctx context.Context, clientHash string, limit int) ([]Task, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, type, model, prompt, params_json, status, COALESCE(error, ''),
			COALESCE(last_error, ''), attempt_count, max_attempts, next_run_at,
			provider_base_url_snapshot, created_at, started_at, completed_at
		FROM tasks
		WHERE anonymous_token_hash = $1
		ORDER BY created_at DESC
		LIMIT $2
	`, clientHash, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []Task
	for rows.Next() {
		var task Task
		if err := scanTask(rows, &task); err != nil {
			return nil, err
		}
		list = append(list, task)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return r.attachAssets(ctx, clientHash, list)
}

func (r *Repository) Get(ctx context.Context, clientHash string, id string) (*Task, error) {
	var task Task
	err := r.db.QueryRowContext(ctx, `
		SELECT id, type, model, prompt, params_json, status, COALESCE(error, ''),
			COALESCE(last_error, ''), attempt_count, max_attempts, next_run_at,
			provider_base_url_snapshot, created_at, started_at, completed_at
		FROM tasks
		WHERE id = $1 AND anonymous_token_hash = $2
	`, id, clientHash).Scan(
		&task.ID, &task.Type, &task.Model, &task.Prompt, &task.Params, &task.Status, &task.Error,
		&task.LastError, &task.AttemptCount, &task.MaxAttempts, &task.NextRunAt,
		&task.ProviderBaseURLSnapshot, &task.CreatedAt, &task.StartedAt, &task.CompletedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	assets, err := r.ListAssetsByTask(ctx, clientHash, id)
	if err != nil {
		return nil, err
	}
	task.Assets = assets
	return &task, nil
}

func (r *Repository) ClaimNextQueued(ctx context.Context) (*TaskWork, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var work TaskWork
	err = tx.QueryRowContext(ctx, `
		SELECT id, type, provider_base_url_snapshot, COALESCE(provider_api_key_plaintext, ''),
			model, prompt, params_json
		FROM tasks
		WHERE status = $1 AND next_run_at <= now()
		ORDER BY next_run_at, created_at
		FOR UPDATE SKIP LOCKED
		LIMIT 1
	`, StatusQueued).Scan(&work.ID, &work.Type, &work.BaseURL, &work.APIKey, &work.Model, &work.Prompt, &work.Params)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	if _, err := tx.ExecContext(ctx, `
		UPDATE tasks
		SET status = $1, started_at = now(), error = NULL, attempt_count = attempt_count + 1
		WHERE id = $2
	`, StatusRunning, work.ID); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &work, nil
}

func (r *Repository) MarkSucceeded(ctx context.Context, taskID string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE tasks
		SET status = $1, completed_at = now(), provider_api_key_plaintext = NULL, last_error = NULL
		WHERE id = $2
	`, StatusSucceeded, taskID)
	return err
}

func (r *Repository) MarkFailed(ctx context.Context, taskID string, message string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE tasks
		SET status = $1, error = $2, last_error = $2, completed_at = now(), provider_api_key_plaintext = NULL
		WHERE id = $3
	`, StatusFailed, message, taskID)
	return err
}

func (r *Repository) RequeueRetry(ctx context.Context, taskID string, message string, delay time.Duration) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE tasks
		SET status = $1, last_error = $2, error = NULL, next_run_at = now() + ($3::text)::interval
		WHERE id = $4
	`, StatusQueued, message, intervalString(delay), taskID)
	return err
}

func (r *Repository) MarkQueued(ctx context.Context, taskID string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE tasks
		SET status = $1, error = NULL, next_run_at = now()
		WHERE id = $2 AND status = $3
	`, StatusQueued, taskID, StatusPreparing)
	return err
}

func (r *Repository) Attempts(ctx context.Context, taskID string) (attemptCount int, maxAttempts int, err error) {
	err = r.db.QueryRowContext(ctx, `SELECT attempt_count, max_attempts FROM tasks WHERE id = $1`, taskID).Scan(&attemptCount, &maxAttempts)
	return attemptCount, maxAttempts, err
}

func (r *Repository) Cancel(ctx context.Context, clientHash string, taskID string) (bool, error) {
	res, err := r.db.ExecContext(ctx, `
		UPDATE tasks
		SET status = $1, completed_at = now(), provider_api_key_plaintext = NULL
		WHERE id = $2 AND anonymous_token_hash = $3 AND status = $4
	`, StatusCanceled, taskID, clientHash, StatusQueued)
	if err != nil {
		return false, err
	}
	count, err := res.RowsAffected()
	return count > 0, err
}

func (r *Repository) UpdateParams(ctx context.Context, taskID string, paramsMap map[string]any) error {
	params, err := json.Marshal(paramsMap)
	if err != nil {
		return err
	}
	_, err = r.db.ExecContext(ctx, `UPDATE tasks SET params_json = $1 WHERE id = $2`, params, taskID)
	return err
}

func (r *Repository) RecoverRunning(ctx context.Context) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE tasks
		SET status = $1, error = $2, completed_at = now(), provider_api_key_plaintext = NULL
		WHERE status = $3
	`, StatusFailed, "Task was interrupted by server restart.", StatusRunning)
	return err
}

func (r *Repository) CreateAsset(ctx context.Context, asset Asset) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO assets (
			id, task_id, storage_key, public_url, mime, width, height, size_bytes, sha256
		)
		VALUES ($1, $2, $3, $4, $5, NULLIF($6, 0), NULLIF($7, 0), $8, $9)
	`, asset.ID, asset.TaskID, asset.StorageKey, asset.PublicURL, asset.MIME, asset.Width, asset.Height, asset.SizeBytes, asset.SHA256)
	return err
}

func (r *Repository) ListAssetsByTask(ctx context.Context, clientHash string, taskID string) ([]Asset, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT a.id, a.task_id, t.type, t.prompt, a.storage_key, a.public_url, a.mime,
			COALESCE(a.width, 0), COALESCE(a.height, 0), a.size_bytes, a.sha256, a.created_at
		FROM assets a
		JOIN tasks t ON t.id = a.task_id
		WHERE a.task_id = $1 AND t.anonymous_token_hash = $2
		ORDER BY a.created_at
	`, taskID, clientHash)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanAssets(rows)
}

func (r *Repository) ListAssets(ctx context.Context, clientHash string, limit int) ([]Asset, error) {
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	rows, err := r.db.QueryContext(ctx, `
		SELECT a.id, a.task_id, t.type, t.prompt, a.storage_key, a.public_url, a.mime,
			COALESCE(a.width, 0), COALESCE(a.height, 0), a.size_bytes, a.sha256, a.created_at
		FROM assets a
		JOIN tasks t ON t.id = a.task_id
		WHERE t.anonymous_token_hash = $1
		ORDER BY a.created_at DESC
		LIMIT $2
	`, clientHash, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanAssets(rows)
}

func (r *Repository) GetAsset(ctx context.Context, clientHash string, id string) (*Asset, error) {
	var asset Asset
	err := r.db.QueryRowContext(ctx, `
		SELECT a.id, a.task_id, t.type, t.prompt, a.storage_key, a.public_url, a.mime,
			COALESCE(a.width, 0), COALESCE(a.height, 0), a.size_bytes, a.sha256, a.created_at
		FROM assets a
		JOIN tasks t ON t.id = a.task_id
		WHERE a.id = $1 AND t.anonymous_token_hash = $2
	`, id, clientHash).Scan(&asset.ID, &asset.TaskID, &asset.TaskType, &asset.Prompt, &asset.StorageKey, &asset.PublicURL, &asset.MIME, &asset.Width, &asset.Height, &asset.SizeBytes, &asset.SHA256, &asset.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &asset, nil
}

func (r *Repository) DeleteAsset(ctx context.Context, clientHash string, id string) (*Asset, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var asset Asset
	err = tx.QueryRowContext(ctx, `
		SELECT a.id, a.task_id, t.type, t.prompt, a.storage_key, a.public_url, a.mime,
			COALESCE(a.width, 0), COALESCE(a.height, 0), a.size_bytes, a.sha256, a.created_at
		FROM assets a
		JOIN tasks t ON t.id = a.task_id
		WHERE a.id = $1 AND t.anonymous_token_hash = $2
		FOR UPDATE
	`, id, clientHash).Scan(&asset.ID, &asset.TaskID, &asset.TaskType, &asset.Prompt, &asset.StorageKey, &asset.PublicURL, &asset.MIME, &asset.Width, &asset.Height, &asset.SizeBytes, &asset.SHA256, &asset.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM assets WHERE id = $1`, id); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &asset, nil
}

func (r *Repository) DeleteAssetsOlderThan(ctx context.Context, before time.Time, limit int) ([]Asset, error) {
	if limit <= 0 {
		limit = 200
	}
	rows, err := r.db.QueryContext(ctx, `
		WITH doomed AS (
			SELECT id, task_id, storage_key, public_url, mime,
				COALESCE(width, 0) AS width, COALESCE(height, 0) AS height,
				size_bytes, sha256, created_at
			FROM assets
			WHERE created_at < $1
			ORDER BY created_at
			LIMIT $2
		),
		deleted AS (
			DELETE FROM assets a
			USING doomed d
			WHERE a.id = d.id
			RETURNING d.id, d.task_id, d.storage_key, d.public_url, d.mime,
				d.width, d.height, d.size_bytes, d.sha256, d.created_at
		)
		SELECT id, task_id, storage_key, public_url, mime, width, height, size_bytes, sha256, created_at
		FROM deleted
	`, before, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []Asset
	for rows.Next() {
		var asset Asset
		if err := rows.Scan(&asset.ID, &asset.TaskID, &asset.StorageKey, &asset.PublicURL, &asset.MIME, &asset.Width, &asset.Height, &asset.SizeBytes, &asset.SHA256, &asset.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, asset)
	}
	return list, rows.Err()
}

func scanTask(scanner interface {
	Scan(dest ...any) error
}, task *Task) error {
	return scanner.Scan(
		&task.ID, &task.Type, &task.Model, &task.Prompt, &task.Params, &task.Status, &task.Error,
		&task.LastError, &task.AttemptCount, &task.MaxAttempts, &task.NextRunAt,
		&task.ProviderBaseURLSnapshot, &task.CreatedAt, &task.StartedAt, &task.CompletedAt,
	)
}

func scanAssets(rows *sql.Rows) ([]Asset, error) {
	var list []Asset
	for rows.Next() {
		var asset Asset
		if err := rows.Scan(&asset.ID, &asset.TaskID, &asset.TaskType, &asset.Prompt, &asset.StorageKey, &asset.PublicURL, &asset.MIME, &asset.Width, &asset.Height, &asset.SizeBytes, &asset.SHA256, &asset.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, asset)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return list, nil
}

func (r *Repository) attachAssets(ctx context.Context, clientHash string, list []Task) ([]Task, error) {
	for i := range list {
		assets, err := r.ListAssetsByTask(ctx, clientHash, list[i].ID)
		if err != nil {
			return nil, err
		}
		list[i].Assets = assets
	}
	return list, nil
}

func nullString(value string) any {
	if value == "" {
		return nil
	}
	return value
}

type TaskWork struct {
	ID      string
	Type    string
	BaseURL string
	APIKey  string
	Model   string
	Prompt  string
	Params  json.RawMessage
}

func newID() string {
	now := time.Now().UTC()
	random := make([]byte, 10)
	fillRandom(random)
	return encodeUUIDv7(now, random)
}

func intervalString(delay time.Duration) string {
	if delay <= 0 {
		return "0 seconds"
	}
	seconds := int(delay.Truncate(time.Second).Seconds())
	if seconds < 1 {
		seconds = 1
	}
	return fmt.Sprintf("%d seconds", seconds)
}
