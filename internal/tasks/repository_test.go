package tasks

import (
	"encoding/json"
	"errors"
	"testing"
	"time"
)

func TestPageCursorRoundTrip(t *testing.T) {
	createdAt := time.Date(2026, 5, 23, 15, 30, 45, 123456789, time.FixedZone("CST", 8*60*60))
	id := "9f5d2db4-7eb3-4d98-bf41-2b8be6a34d5c"

	encoded := encodePageCursor(createdAt, id)
	decoded, err := decodePageCursor(encoded)
	if err != nil {
		t.Fatalf("decode cursor: %v", err)
	}
	if decoded == nil {
		t.Fatalf("expected decoded cursor")
	}
	if !decoded.CreatedAt.Equal(createdAt.UTC()) {
		t.Fatalf("createdAt = %s, want %s", decoded.CreatedAt, createdAt.UTC())
	}
	if decoded.ID != id {
		t.Fatalf("id = %q, want %q", decoded.ID, id)
	}
}

func TestDecodePageCursorRejectsInvalidValues(t *testing.T) {
	tests := []struct {
		name  string
		value string
	}{
		{name: "not base64", value: "not a cursor"},
		{name: "missing separator", value: "MjAyNi0wNS0yM1QwNzozMDo0NS4xMjM0NTY3ODla"},
		{name: "bad timestamp", value: "bm90LWEtdGltZXw5ZjVkMmRiNC03ZWIzLTRkOTgtYmY0MS0yYjhiZTZhMzRkNWM"},
		{name: "missing id", value: "MjAyNi0wNS0yM1QwNzozMDo0NS4xMjM0NTY3ODlafA"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			decoded, err := decodePageCursor(tt.value)
			if decoded != nil {
				t.Fatalf("expected nil cursor, got %#v", decoded)
			}
			if !errors.Is(err, ErrInvalidCursor) {
				t.Fatalf("expected ErrInvalidCursor, got %v", err)
			}
		})
	}
}

func TestDecodePageCursorTreatsBlankAsNoCursor(t *testing.T) {
	decoded, err := decodePageCursor("  ")
	if err != nil {
		t.Fatalf("decode blank cursor: %v", err)
	}
	if decoded != nil {
		t.Fatalf("expected nil cursor, got %#v", decoded)
	}
}

func TestNormalizeLimit(t *testing.T) {
	tests := []struct {
		name     string
		value    int
		fallback int
		max      int
		want     int
	}{
		{name: "zero", value: 0, fallback: 50, max: 100, want: 50},
		{name: "negative", value: -1, fallback: 50, max: 100, want: 50},
		{name: "valid", value: 25, fallback: 50, max: 100, want: 25},
		{name: "clamped", value: 150, fallback: 50, max: 100, want: 100},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := normalizeLimit(tt.value, tt.fallback, tt.max); got != tt.want {
				t.Fatalf("normalizeLimit(%d, %d, %d) = %d, want %d", tt.value, tt.fallback, tt.max, got, tt.want)
			}
		})
	}
}

func TestAssetMetadataForImage(t *testing.T) {
	metadata := assetMetadataForImage("  rewritten prompt  ")
	var decoded map[string]string
	if err := json.Unmarshal(metadata, &decoded); err != nil {
		t.Fatalf("decode metadata: %v", err)
	}
	if decoded["revised_prompt"] != "rewritten prompt" {
		t.Fatalf("revised_prompt = %q, want rewritten prompt", decoded["revised_prompt"])
	}
	if metadata := assetMetadataForImage(" "); metadata != nil {
		t.Fatalf("blank revised prompt metadata = %s, want nil", string(metadata))
	}
}

func TestRemoteImageAssetKeepsProviderURL(t *testing.T) {
	asset := remoteImageAsset("task-1", "0", "https://cdn.example.com/result.webp?token=secret", " revised ")
	if asset.TaskID != "task-1" {
		t.Fatalf("TaskID = %q, want task-1", asset.TaskID)
	}
	if asset.PublicURL != "https://cdn.example.com/result.webp?token=secret" {
		t.Fatalf("PublicURL = %q", asset.PublicURL)
	}
	if asset.StorageKey != "external/task-1/0" {
		t.Fatalf("StorageKey = %q, want external/task-1/0", asset.StorageKey)
	}
	if asset.MIME != "image/webp" {
		t.Fatalf("MIME = %q, want image/webp", asset.MIME)
	}
	if asset.SHA256 == "" {
		t.Fatalf("expected SHA256 for remote URL")
	}
	var metadata map[string]string
	if err := json.Unmarshal(asset.Metadata, &metadata); err != nil {
		t.Fatalf("decode metadata: %v", err)
	}
	if metadata["revised_prompt"] != "revised" {
		t.Fatalf("revised_prompt = %q, want revised", metadata["revised_prompt"])
	}
}

func TestRequestedImageCount(t *testing.T) {
	tests := []struct {
		name string
		n    any
		want int
	}{
		{name: "missing", want: 1},
		{name: "zero", n: 0, want: 1},
		{name: "float from json", n: float64(2), want: 2},
		{name: "json number", n: json.Number("3"), want: 3},
		{name: "clamped", n: 99, want: 10},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			params := map[string]any{}
			if tt.n != nil {
				params["n"] = tt.n
			}
			if got := requestedImageCount(params); got != tt.want {
				t.Fatalf("requestedImageCount(%v) = %d, want %d", tt.n, got, tt.want)
			}
		})
	}
}
