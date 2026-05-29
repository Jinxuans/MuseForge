package tasks

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"path/filepath"
	"strings"

	"museforge/internal/redact"
	"museforge/internal/storage"
)

type assetSaver struct {
	repo     *Repository
	store    *storage.Local
	upstream *upstreamImageClient
}

func newAssetSaver(repo *Repository, store *storage.Local, upstream *upstreamImageClient) *assetSaver {
	return &assetSaver{
		repo:     repo,
		store:    store,
		upstream: upstream,
	}
}

func (s *assetSaver) saveImageResponse(ctx context.Context, taskID string, startIndex int, maxImages int, respBody []byte) (int, error) {
	var decoded struct {
		Data []struct {
			B64JSON       string `json:"b64_json"`
			URL           string `json:"url"`
			RevisedPrompt string `json:"revised_prompt"`
		} `json:"data"`
	}
	if err := json.Unmarshal(respBody, &decoded); err != nil {
		return 0, err
	}
	if len(decoded.Data) == 0 {
		return 0, errors.New("upstream response did not contain images")
	}
	if maxImages > 0 && len(decoded.Data) > maxImages {
		decoded.Data = decoded.Data[:maxImages]
	}

	for i, image := range decoded.Data {
		asset, err := s.assetFromImageResponse(ctx, taskID, fmt.Sprintf("%d", startIndex+i), image.B64JSON, image.URL, image.RevisedPrompt)
		if err != nil {
			return i, err
		}
		if err := s.repo.CreateAsset(ctx, asset); err != nil {
			return i, err
		}
		slog.Info("asset created", "task_id", taskID, "asset_id", asset.ID, "storage_key", asset.StorageKey, "mime", asset.MIME, "size_bytes", asset.SizeBytes)
	}
	return len(decoded.Data), nil
}

func (s *assetSaver) assetFromImageResponse(ctx context.Context, taskID string, name string, b64 string, imageURL string, revisedPrompt string) (Asset, error) {
	if b64 != "" {
		data, err := base64.StdEncoding.DecodeString(b64)
		if err != nil {
			return Asset{}, err
		}
		return s.localImageAsset(ctx, taskID, name, data, revisedPrompt)
	}
	if imageURL == "" {
		return Asset{}, errors.New("image response missing b64_json and url")
	}

	downloadCtx, cancel := context.WithTimeout(ctx, imageDownloadTimeout)
	data, err := s.upstream.downloadImage(downloadCtx, imageURL)
	cancel()
	if err == nil {
		return s.localImageAsset(ctx, taskID, name, data, revisedPrompt)
	}
	if ctx.Err() != nil {
		return Asset{}, ctx.Err()
	}

	slog.Warn("image download failed; storing remote asset URL", "task_id", taskID, "url", redact.String(imageURL), "error", sanitizeError(err))
	return remoteImageAsset(taskID, name, imageURL, revisedPrompt), nil
}

func (s *assetSaver) localImageAsset(ctx context.Context, taskID string, name string, data []byte, revisedPrompt string) (Asset, error) {
	saved, err := s.store.SaveResult(ctx, taskID, name, data)
	if err != nil {
		return Asset{}, err
	}
	return Asset{
		ID:         newID(),
		TaskID:     taskID,
		StorageKey: saved.StorageKey,
		PublicURL:  saved.PublicURL,
		MIME:       saved.MIME,
		Width:      saved.Width,
		Height:     saved.Height,
		SizeBytes:  saved.SizeBytes,
		SHA256:     saved.SHA256,
		Metadata:   assetMetadataForImage(revisedPrompt),
	}, nil
}

func remoteImageAsset(taskID string, name string, imageURL string, revisedPrompt string) Asset {
	sum := sha256.Sum256([]byte(imageURL))
	return Asset{
		ID:         newID(),
		TaskID:     taskID,
		StorageKey: filepath.ToSlash(filepath.Join("external", taskID, name)),
		PublicURL:  imageURL,
		MIME:       mimeForImageURL(imageURL),
		SizeBytes:  0,
		SHA256:     hex.EncodeToString(sum[:]),
		Metadata:   assetMetadataForImage(revisedPrompt),
	}
}

func mimeForImageURL(imageURL string) string {
	parsed, err := url.Parse(imageURL)
	pathValue := imageURL
	if err == nil {
		pathValue = parsed.Path
	}
	switch strings.ToLower(filepath.Ext(pathValue)) {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".webp":
		return "image/webp"
	case ".png":
		return "image/png"
	default:
		return "image/png"
	}
}

func assetMetadataForImage(revisedPrompt string) json.RawMessage {
	revisedPrompt = strings.TrimSpace(revisedPrompt)
	if revisedPrompt == "" {
		return nil
	}
	payload, err := json.Marshal(map[string]string{"revised_prompt": revisedPrompt})
	if err != nil {
		return nil
	}
	return payload
}
