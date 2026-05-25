package httpapi

import (
	"errors"
	"log/slog"
	"net/http"
	"os"
	"path"
	"strings"

	"museforge/internal/tasks"
)

func (s *Server) handleListAssets(w http.ResponseWriter, r *http.Request) {
	kind, ok := parseAssetKindFilter(r.URL.Query().Get("kind"))
	if !ok {
		jsonResponse(w, http.StatusBadRequest, errorPayload("Invalid asset kind."))
		return
	}
	taskID := strings.TrimSpace(r.URL.Query().Get("task_id"))
	if taskID != "" && !isUUIDText(taskID) {
		jsonResponse(w, http.StatusBadRequest, errorPayload("Invalid task id."))
		return
	}
	projectID := strings.TrimSpace(r.URL.Query().Get("project_id"))
	if s.repo == nil {
		jsonResponse(w, http.StatusServiceUnavailable, errorPayload("Asset API requires DATABASE_URL."))
		return
	}
	clientHash, ok := requireClientHash(w, r)
	if !ok {
		return
	}
	cursor := strings.TrimSpace(r.URL.Query().Get("cursor"))
	limit := queryLimit(r, 100, 200)
	var page tasks.AssetPage
	var err error
	page, err = s.repo.ListAssetsFilteredPage(r.Context(), clientHash, taskID, projectID, kind, cursor, limit)
	if err != nil {
		if errors.Is(err, tasks.ErrInvalidCursor) {
			jsonResponse(w, http.StatusBadRequest, errorPayload("Invalid cursor."))
			return
		}
		jsonResponse(w, http.StatusInternalServerError, errorPayload(err.Error()))
		return
	}
	jsonResponse(w, http.StatusOK, map[string]any{"assets": page.Items, "nextCursor": page.NextCursor})
}

func parseAssetKindFilter(value string) (string, bool) {
	kind := strings.TrimSpace(value)
	if kind == "" {
		return "", true
	}
	switch kind {
	case "input", "output", "mask", "reference", "thumbnail":
		return kind, true
	default:
		return "", false
	}
}

func isUUIDText(value string) bool {
	if len(value) != 36 {
		return false
	}
	for i := 0; i < len(value); i++ {
		switch i {
		case 8, 13, 18, 23:
			if value[i] != '-' {
				return false
			}
		default:
			if !isHexByte(value[i]) {
				return false
			}
		}
	}
	return true
}

func isHexByte(value byte) bool {
	return (value >= '0' && value <= '9') ||
		(value >= 'a' && value <= 'f') ||
		(value >= 'A' && value <= 'F')
}

func (s *Server) handleAssetByID(w http.ResponseWriter, r *http.Request) {
	if s.repo == nil || s.store == nil {
		jsonResponse(w, http.StatusServiceUnavailable, errorPayload("Asset API requires DATABASE_URL."))
		return
	}
	id := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/assets/"), "/")
	if id == "" {
		jsonResponse(w, http.StatusNotFound, errorPayload("Asset not found."))
		return
	}
	switch r.Method {
	case http.MethodGet:
		clientHash, ok := requireClientHash(w, r)
		if !ok {
			return
		}
		asset, err := s.repo.GetAsset(r.Context(), clientHash, id)
		if err != nil {
			jsonResponse(w, http.StatusInternalServerError, errorPayload(err.Error()))
			return
		}
		if asset == nil {
			jsonResponse(w, http.StatusNotFound, errorPayload("Asset not found."))
			return
		}
		jsonResponse(w, http.StatusOK, map[string]any{"asset": asset})
	case http.MethodDelete:
		clientHash, ok := requireClientHash(w, r)
		if !ok {
			return
		}
		asset, err := s.repo.DeleteAsset(r.Context(), clientHash, id)
		if err != nil {
			jsonResponse(w, http.StatusInternalServerError, errorPayload(err.Error()))
			return
		}
		if asset == nil {
			jsonResponse(w, http.StatusNotFound, errorPayload("Asset not found."))
			return
		}
		if err := s.store.Delete(asset.StorageKey); err != nil && !errors.Is(err, os.ErrNotExist) {
			jsonResponse(w, http.StatusInternalServerError, errorPayload(err.Error()))
			return
		}
		slog.Info("asset deleted", "asset_id", asset.ID, "task_id", asset.TaskID, "client", shortHash(clientHash), "storage_key", asset.StorageKey)
		jsonResponse(w, http.StatusOK, map[string]any{"deleted": true, "asset": asset})
	default:
		jsonResponse(w, http.StatusNotFound, errorPayload("Not found."))
	}
}

func (s *Server) handleFile(w http.ResponseWriter, r *http.Request) {
	if s.repo == nil || s.store == nil {
		jsonResponse(w, http.StatusServiceUnavailable, errorPayload("File API requires DATABASE_URL."))
		return
	}
	storageKey := strings.TrimPrefix(path.Clean("/"+strings.TrimPrefix(r.URL.Path, "/files/")), "/")
	if storageKey == "" {
		jsonResponse(w, http.StatusNotFound, errorPayload("File not found."))
		return
	}
	http.ServeFile(w, r, s.store.Path(storageKey))
}
