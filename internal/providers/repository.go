package providers

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"
)

type Profile struct {
	ID         int64      `json:"id"`
	Name       string     `json:"name"`
	Type       string     `json:"type"`
	BaseURL    string     `json:"base_url"`
	APIKeyHint string     `json:"api_key_hint"`
	CreatedAt  time.Time  `json:"created_at"`
	DeletedAt  *time.Time `json:"deleted_at,omitempty"`
}

type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) List(ctx context.Context, ownerHash string) ([]Profile, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, name, type, base_url, COALESCE(api_key_hint, ''), created_at, deleted_at
		FROM provider_profiles
		WHERE user_id IS NULL AND anonymous_token_hash = $1 AND deleted_at IS NULL
		ORDER BY created_at DESC
	`, ownerHash)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []Profile
	for rows.Next() {
		var profile Profile
		if err := rows.Scan(&profile.ID, &profile.Name, &profile.Type, &profile.BaseURL, &profile.APIKeyHint, &profile.CreatedAt, &profile.DeletedAt); err != nil {
			return nil, err
		}
		list = append(list, profile)
	}
	return list, rows.Err()
}

func (r *Repository) Create(ctx context.Context, ownerHash string, name string, profileType string, baseURL string, apiKey string) (*Profile, error) {
	if strings.TrimSpace(profileType) == "" {
		profileType = "custom"
	}
	var profile Profile
	err := r.db.QueryRowContext(ctx, `
		INSERT INTO provider_profiles (anonymous_token_hash, name, type, base_url, api_key_plaintext, api_key_hint)
		VALUES ($1, $2, $3, $4, NULLIF($5, ''), $6)
		RETURNING id, name, type, base_url, COALESCE(api_key_hint, ''), created_at, deleted_at
	`, ownerHash, name, profileType, baseURL, apiKey, keyHint(apiKey)).Scan(
		&profile.ID, &profile.Name, &profile.Type, &profile.BaseURL, &profile.APIKeyHint, &profile.CreatedAt, &profile.DeletedAt,
	)
	if err != nil {
		return nil, err
	}
	return &profile, nil
}

func (r *Repository) Delete(ctx context.Context, ownerHash string, id int64) (bool, error) {
	res, err := r.db.ExecContext(ctx, `
		UPDATE provider_profiles
		SET deleted_at = now(), api_key_plaintext = NULL
		WHERE id = $1 AND user_id IS NULL AND anonymous_token_hash = $2 AND deleted_at IS NULL
	`, id, ownerHash)
	if err != nil {
		return false, err
	}
	count, err := res.RowsAffected()
	return count > 0, err
}

func (r *Repository) GetSecret(ctx context.Context, ownerHash string, id int64) (baseURL string, apiKey string, ok bool, err error) {
	err = r.db.QueryRowContext(ctx, `
		SELECT base_url, COALESCE(api_key_plaintext, '')
		FROM provider_profiles
		WHERE id = $1 AND user_id IS NULL AND anonymous_token_hash = $2 AND deleted_at IS NULL
	`, id, ownerHash).Scan(&baseURL, &apiKey)
	if errors.Is(err, sql.ErrNoRows) {
		return "", "", false, nil
	}
	if err != nil {
		return "", "", false, err
	}
	return baseURL, apiKey, true, nil
}

func keyHint(apiKey string) string {
	apiKey = strings.TrimSpace(apiKey)
	if len(apiKey) <= 4 {
		return ""
	}
	return apiKey[len(apiKey)-4:]
}
