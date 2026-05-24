package tasks

import (
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
