package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"mime/multipart"
	"net/http"
	"strings"

	"museforge/internal/storage"
	"museforge/internal/tasks"
)

func (s *Server) handleCreateGenerationTask(w http.ResponseWriter, r *http.Request) {
	if s.repo == nil || s.worker == nil {
		jsonResponse(w, http.StatusServiceUnavailable, errorPayload("Async task API requires DATABASE_URL."))
		return
	}
	clientHash, ok := requireClientHash(w, r)
	if !ok {
		return
	}

	var payload map[string]any
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(&payload); err != nil || payload == nil {
		jsonResponse(w, http.StatusBadRequest, errorPayload("Request body must be JSON."))
		return
	}

	options := extractRelayOptionsFromJSON(payload)
	options.ClientHash = clientHash
	if err := s.applyProviderProfile(r.Context(), &options); err != nil {
		jsonResponse(w, http.StatusBadRequest, errorPayload(err.Error()))
		return
	}
	authorizationHeader := s.getAuthorizationHeader(r, options.APIKey)
	if authorizationHeader == "" {
		jsonResponse(w, http.StatusBadRequest, missingAPIKeyPayload())
		return
	}

	upstreamBaseURL, err := s.resolveUpstreamBaseURL(options.UpstreamBaseURL)
	if err != nil {
		jsonResponse(w, http.StatusBadRequest, errorPayload(err.Error()))
		return
	}

	model, _ := payload["model"].(string)
	model = strings.TrimSpace(model)
	if model == "" {
		model = "gpt-image-2"
	}
	prompt, _ := payload["prompt"].(string)
	prompt = strings.TrimSpace(prompt)
	if prompt == "" {
		jsonResponse(w, http.StatusBadRequest, errorPayload("prompt is required."))
		return
	}

	params := make(map[string]any, len(payload))
	for key, value := range payload {
		if key == "model" || key == "prompt" {
			continue
		}
		params[key] = value
	}

	task, err := s.repo.CreateGeneration(r.Context(), tasks.CreateGenerationTask{
		BaseURL:     upstreamBaseURL,
		APIKey:      apiKeyForTaskStorage(authorizationHeader, options.APIKey),
		ClientHash:  clientHash,
		Model:       model,
		Prompt:      prompt,
		Params:      params,
		MaxAttempts: s.cfg.TaskMaxAttempts,
	})
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errorPayload("Create task failed: "+err.Error()))
		return
	}
	slog.Info("task created", "task_id", task.ID, "task_type", task.Type, "client", shortHash(clientHash), "model", model)

	s.worker.Wake()
	jsonResponse(w, http.StatusAccepted, map[string]any{"task": task})
}

func (s *Server) handleCreateEditTask(w http.ResponseWriter, r *http.Request) {
	if s.repo == nil || s.worker == nil || s.store == nil {
		jsonResponse(w, http.StatusServiceUnavailable, errorPayload("Async task API requires DATABASE_URL."))
		return
	}
	clientHash, ok := requireClientHash(w, r)
	if !ok {
		return
	}
	if err := r.ParseMultipartForm(maxMultipartMemory); err != nil {
		jsonResponse(w, http.StatusBadRequest, errorPayload("Request body must be multipart/form-data."))
		return
	}
	defer r.MultipartForm.RemoveAll()

	options := extractRelayOptionsFromForm(r.MultipartForm.Value)
	options.ClientHash = clientHash
	if err := s.applyProviderProfile(r.Context(), &options); err != nil {
		jsonResponse(w, http.StatusBadRequest, errorPayload(err.Error()))
		return
	}
	authorizationHeader := s.getAuthorizationHeader(r, options.APIKey)
	if authorizationHeader == "" {
		jsonResponse(w, http.StatusBadRequest, missingAPIKeyPayload())
		return
	}

	upstreamBaseURL, err := s.resolveUpstreamBaseURL(options.UpstreamBaseURL)
	if err != nil {
		jsonResponse(w, http.StatusBadRequest, errorPayload(err.Error()))
		return
	}

	model := strings.TrimSpace(firstFormValue(r.MultipartForm.Value, "model"))
	if model == "" {
		model = "gpt-image-2"
	}
	prompt := strings.TrimSpace(firstFormValue(r.MultipartForm.Value, "prompt"))
	if prompt == "" {
		jsonResponse(w, http.StatusBadRequest, errorPayload("prompt is required."))
		return
	}
	imageFiles := append([]*multipart.FileHeader{}, r.MultipartForm.File["image[]"]...)
	imageFiles = append(imageFiles, r.MultipartForm.File["image"]...)
	if len(imageFiles) == 0 {
		jsonResponse(w, http.StatusBadRequest, errorPayload("At least one image is required."))
		return
	}

	fields := formFieldsForTask(r.MultipartForm.Value)
	task, err := s.repo.CreateEdit(r.Context(), tasks.CreateEditTask{
		BaseURL:     upstreamBaseURL,
		APIKey:      apiKeyForTaskStorage(authorizationHeader, options.APIKey),
		ClientHash:  clientHash,
		Model:       model,
		Prompt:      prompt,
		Params:      map[string]any{"fields": fields},
		MaxAttempts: s.cfg.TaskMaxAttempts,
	})
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errorPayload("Create task failed: "+err.Error()))
		return
	}
	slog.Info("task created", "task_id", task.ID, "task_type", task.Type, "client", shortHash(clientHash), "model", model)

	images, mask, err := s.saveEditUploads(r.Context(), task.ID, imageFiles, r.MultipartForm.File["mask"])
	if err != nil {
		_ = s.repo.MarkFailed(r.Context(), task.ID, err.Error())
		jsonResponse(w, http.StatusInternalServerError, errorPayload("Save upload failed: "+err.Error()))
		return
	}

	params := map[string]any{
		"fields": fields,
		"images": images,
	}
	if mask != nil {
		params["mask"] = mask
	}
	if err := s.repo.UpdateParams(r.Context(), task.ID, params); err != nil {
		_ = s.repo.MarkFailed(r.Context(), task.ID, err.Error())
		jsonResponse(w, http.StatusInternalServerError, errorPayload("Update task failed: "+err.Error()))
		return
	}
	if err := s.repo.MarkQueued(r.Context(), task.ID); err != nil {
		_ = s.repo.MarkFailed(r.Context(), task.ID, err.Error())
		jsonResponse(w, http.StatusInternalServerError, errorPayload("Queue task failed: "+err.Error()))
		return
	}

	updatedTask, err := s.repo.Get(r.Context(), clientHash, task.ID)
	if err == nil && updatedTask != nil {
		task = updatedTask
	}
	s.worker.Wake()
	jsonResponse(w, http.StatusAccepted, map[string]any{"task": task})
}

func (s *Server) handleListTasks(w http.ResponseWriter, r *http.Request) {
	if s.repo == nil {
		jsonResponse(w, http.StatusServiceUnavailable, errorPayload("Async task API requires DATABASE_URL."))
		return
	}
	clientHash, ok := requireClientHash(w, r)
	if !ok {
		return
	}
	page, err := s.repo.ListPage(r.Context(), clientHash, strings.TrimSpace(r.URL.Query().Get("cursor")), queryLimit(r, 50, 100))
	if err != nil {
		if errors.Is(err, tasks.ErrInvalidCursor) {
			jsonResponse(w, http.StatusBadRequest, errorPayload("Invalid cursor."))
			return
		}
		jsonResponse(w, http.StatusInternalServerError, errorPayload(err.Error()))
		return
	}
	jsonResponse(w, http.StatusOK, map[string]any{"tasks": page.Items, "nextCursor": page.NextCursor})
}

func (s *Server) handleTaskByID(w http.ResponseWriter, r *http.Request) {
	if s.repo == nil {
		jsonResponse(w, http.StatusServiceUnavailable, errorPayload("Async task API requires DATABASE_URL."))
		return
	}
	rest := strings.TrimPrefix(r.URL.Path, "/api/v1/tasks/")
	id, action, _ := strings.Cut(rest, "/")
	if id == "" {
		jsonResponse(w, http.StatusNotFound, errorPayload("Not found."))
		return
	}
	if action == "cancel" && r.Method == http.MethodPost {
		clientHash, ok := requireClientHash(w, r)
		if !ok {
			return
		}
		canceled, err := s.repo.Cancel(r.Context(), clientHash, id)
		if err != nil {
			jsonResponse(w, http.StatusInternalServerError, errorPayload(err.Error()))
			return
		}
		jsonResponse(w, http.StatusOK, map[string]any{"canceled": canceled})
		return
	}
	if action != "" || r.Method != http.MethodGet {
		jsonResponse(w, http.StatusNotFound, errorPayload("Not found."))
		return
	}
	clientHash, ok := requireClientHash(w, r)
	if !ok {
		return
	}
	task, err := s.repo.Get(r.Context(), clientHash, id)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, errorPayload(err.Error()))
		return
	}
	if task == nil {
		jsonResponse(w, http.StatusNotFound, errorPayload("Task not found."))
		return
	}
	jsonResponse(w, http.StatusOK, map[string]any{"task": task})
}

func formFieldsForTask(values map[string][]string) map[string]string {
	fields := make(map[string]string)
	for key, list := range values {
		if strings.HasPrefix(key, "__") || key == "model" || key == "prompt" {
			continue
		}
		if len(list) == 0 {
			continue
		}
		fields[key] = list[0]
	}
	return fields
}

func (s *Server) saveEditUploads(ctx context.Context, taskID string, images []*multipart.FileHeader, masks []*multipart.FileHeader) ([]map[string]string, map[string]string, error) {
	savedImages := make([]map[string]string, 0, len(images))
	for i, file := range images {
		saved, err := s.store.SaveUpload(ctx, taskID, fmt.Sprintf("input_%d", i), file)
		if err != nil {
			return nil, nil, err
		}
		savedImages = append(savedImages, uploadParam(saved))
	}

	var savedMask map[string]string
	if len(masks) > 0 {
		saved, err := s.store.SaveUpload(ctx, taskID, "mask", masks[0])
		if err != nil {
			return nil, nil, err
		}
		savedMask = uploadParam(saved)
	}
	return savedImages, savedMask, nil
}

func uploadParam(file *storage.SavedFile) map[string]string {
	return map[string]string{
		"storage_key": file.StorageKey,
		"filename":    file.Filename,
		"mime":        file.MIME,
	}
}
