package pagination

import (
	"errors"
	"net/url"
	"testing"
	"time"
)

func TestCursorRoundTrip(t *testing.T) {
	createdAt := time.Date(2026, 5, 24, 9, 10, 11, 123456789, time.FixedZone("CST", 8*60*60))
	id := "3f76f4da-4ea9-43f7-b44b-4d82352b9a77"

	decoded, err := DecodeCursor(EncodeCursor(createdAt, id))
	if err != nil {
		t.Fatalf("DecodeCursor: %v", err)
	}
	if decoded == nil {
		t.Fatalf("expected cursor")
	}
	if !decoded.CreatedAt.Equal(createdAt.UTC()) {
		t.Fatalf("CreatedAt = %s, want %s", decoded.CreatedAt, createdAt.UTC())
	}
	if decoded.ID != id {
		t.Fatalf("ID = %q, want %q", decoded.ID, id)
	}
}

func TestDecodeCursorRejectsInvalidValues(t *testing.T) {
	tests := []struct {
		name  string
		value string
	}{
		{name: "not base64", value: "not a cursor"},
		{name: "missing separator", value: "MjAyNi0wNS0yNFQwMToxMDoxMS4xMjM0NTY3ODla"},
		{name: "bad timestamp", value: "bm90LWEtdGltZXwzZjc2ZjRkYS00ZWE5LTQzZjctYjQ0Yi00ZDgyMzUyYjlhNzc"},
		{name: "missing id", value: "MjAyNi0wNS0yNFQwMToxMDoxMS4xMjM0NTY3ODlafA"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cursor, err := DecodeCursor(tt.value)
			if cursor != nil {
				t.Fatalf("cursor = %#v, want nil", cursor)
			}
			if !errors.Is(err, ErrInvalidCursor) {
				t.Fatalf("err = %v, want ErrInvalidCursor", err)
			}
		})
	}
}

func TestDecodeCursorTreatsBlankAsNoCursor(t *testing.T) {
	cursor, err := DecodeCursor("  ")
	if err != nil {
		t.Fatalf("DecodeCursor blank: %v", err)
	}
	if cursor != nil {
		t.Fatalf("cursor = %#v, want nil", cursor)
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
		{name: "unbounded max", value: 150, fallback: 50, max: 0, want: 150},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := NormalizeLimit(tt.value, tt.fallback, tt.max); got != tt.want {
				t.Fatalf("NormalizeLimit(%d, %d, %d) = %d, want %d", tt.value, tt.fallback, tt.max, got, tt.want)
			}
		})
	}
}

func TestLimitFromValues(t *testing.T) {
	values := url.Values{"limit": []string{"125"}}
	if got := LimitFromValues(values, "limit", 50, 100); got != 100 {
		t.Fatalf("LimitFromValues clamped = %d, want 100", got)
	}

	values = url.Values{"limit": []string{"bad"}}
	if got := LimitFromValues(values, "limit", 50, 100); got != 50 {
		t.Fatalf("LimitFromValues invalid = %d, want 50", got)
	}

	values = url.Values{}
	if got := LimitFromValues(values, "limit", 50, 100); got != 50 {
		t.Fatalf("LimitFromValues missing = %d, want 50", got)
	}
}
