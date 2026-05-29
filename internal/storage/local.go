package storage

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

type Local struct {
	dataDir string
}

const maxUploadReadBytes = 100 << 20

type SavedFile struct {
	StorageKey string
	PublicURL  string
	MIME       string
	Width      int
	Height     int
	SizeBytes  int64
	SHA256     string
	Filename   string
}

func NewLocal(dataDir string) *Local {
	return &Local{dataDir: dataDir}
}

func (s *Local) SaveResult(ctx context.Context, taskID string, name string, data []byte) (*SavedFile, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	mime := http.DetectContentType(data)
	ext := extensionForMIME(mime)
	if ext == "" {
		ext = strings.ToLower(filepath.Ext(name))
	}
	if ext == "" {
		ext = ".bin"
	}

	dir := filepath.Join(s.dataDir, "results", taskID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}

	base := strings.TrimSuffix(filepath.Base(name), filepath.Ext(name))
	if base == "." || base == "" {
		base = "result"
	}
	filename := base + ext
	fullPath := filepath.Join(dir, filename)
	if err := os.WriteFile(fullPath, data, 0o644); err != nil {
		return nil, err
	}

	hash := sha256.Sum256(data)
	width, height := imageSize(data)
	storageKey := filepath.ToSlash(filepath.Join("results", taskID, filename))
	return &SavedFile{
		StorageKey: storageKey,
		PublicURL:  "/files/" + storageKey,
		MIME:       mime,
		Width:      width,
		Height:     height,
		SizeBytes:  int64(len(data)),
		SHA256:     hex.EncodeToString(hash[:]),
		Filename:   filename,
	}, nil
}

func (s *Local) SaveUpload(ctx context.Context, taskID string, name string, fileHeader *multipart.FileHeader) (*SavedFile, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	file, err := fileHeader.Open()
	if err != nil {
		return nil, err
	}
	defer file.Close()

	data, err := io.ReadAll(io.LimitReader(file, maxUploadReadBytes))
	if err != nil {
		return nil, err
	}
	if len(data) == maxUploadReadBytes {
		return nil, fmt.Errorf("upload %s is too large", fileHeader.Filename)
	}

	mime := http.DetectContentType(data)
	ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
	if ext == "" {
		ext = extensionForMIME(mime)
	}
	if ext == "" {
		ext = ".bin"
	}

	dir := filepath.Join(s.dataDir, "uploads", taskID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}

	filename := strings.TrimSuffix(filepath.Base(name), filepath.Ext(name)) + ext
	if filename == ext {
		filename = "upload" + ext
	}
	fullPath := filepath.Join(dir, filename)
	if err := os.WriteFile(fullPath, data, 0o644); err != nil {
		return nil, err
	}

	hash := sha256.Sum256(data)
	width, height := imageSize(data)
	storageKey := filepath.ToSlash(filepath.Join("uploads", taskID, filename))
	return &SavedFile{
		StorageKey: storageKey,
		PublicURL:  "/files/" + storageKey,
		MIME:       mime,
		Width:      width,
		Height:     height,
		SizeBytes:  int64(len(data)),
		SHA256:     hex.EncodeToString(hash[:]),
		Filename:   filename,
	}, nil
}

func (s *Local) Open(storageKey string) (io.ReadCloser, error) {
	return os.Open(s.Path(storageKey))
}

func (s *Local) Delete(storageKey string) error {
	fullPath := s.Path(storageKey)
	if err := os.Remove(fullPath); err != nil {
		return err
	}
	s.removeEmptyParents(filepath.Dir(fullPath))
	return nil
}

func (s *Local) DeleteTaskUploads(taskID string) error {
	dir := filepath.Join(s.dataDir, "uploads", taskID)
	if err := os.RemoveAll(dir); err != nil {
		return err
	}
	s.removeEmptyParents(filepath.Dir(dir))
	return nil
}

func (s *Local) Path(storageKey string) string {
	clean := filepath.Clean(filepath.FromSlash(storageKey))
	if strings.HasPrefix(clean, "..") || filepath.IsAbs(clean) {
		return filepath.Join(s.dataDir, "__missing__")
	}
	return filepath.Join(s.dataDir, clean)
}

func (s *Local) removeEmptyParents(dir string) {
	root := filepath.Clean(s.dataDir)
	for {
		dir = filepath.Clean(dir)
		if dir == root || dir == "." || dir == string(filepath.Separator) {
			return
		}
		err := os.Remove(dir)
		if err != nil {
			return
		}
		dir = filepath.Dir(dir)
	}
}

func extensionForMIME(mime string) string {
	switch mime {
	case "image/png":
		return ".png"
	case "image/jpeg":
		return ".jpg"
	case "image/webp":
		return ".webp"
	default:
		return ""
	}
}

func imageSize(data []byte) (int, int) {
	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return 0, 0
	}
	return cfg.Width, cfg.Height
}
