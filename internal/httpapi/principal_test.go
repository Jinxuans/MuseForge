package httpapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

type fakeSessionResolver map[string]string

func (r fakeSessionResolver) ResolveSessionPrincipal(_ context.Context, tokenHash string) (string, bool, error) {
	userID, ok := r[tokenHash]
	return userID, ok, nil
}

func TestPrincipalFromRequestUsesClientHash(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/v1/tasks", nil)
	req.Header.Set("X-Client-ID", "client-a")

	principal := principalFromRequest(req)
	want := clientHashFromRequest(req)
	if principal.AnonymousTokenHash != want {
		t.Fatalf("AnonymousTokenHash = %q, want %q", principal.AnonymousTokenHash, want)
	}
	if principal.UserID != "" {
		t.Fatalf("UserID = %q, want empty", principal.UserID)
	}
}

func TestPrincipalFromRequestWithSessionResolverUsesBearerToken(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/v1/tasks", nil)
	req.Header.Set("X-Client-ID", "client-a")
	req.Header.Set("Authorization", "Bearer session-token")
	tokenHash := sessionTokenHashFromRequest(req)

	principal, err := principalFromRequestWithSessionResolver(req, fakeSessionResolver{tokenHash: "user-1"})
	if err != nil {
		t.Fatalf("principalFromRequestWithSessionResolver: %v", err)
	}
	if principal.UserID != "user-1" {
		t.Fatalf("UserID = %q, want user-1", principal.UserID)
	}
	if principal.AnonymousTokenHash != clientHashFromRequest(req) {
		t.Fatalf("AnonymousTokenHash = %q, want %q", principal.AnonymousTokenHash, clientHashFromRequest(req))
	}
	if principal.SessionTokenHash != tokenHash {
		t.Fatalf("SessionTokenHash = %q, want %q", principal.SessionTokenHash, tokenHash)
	}
}

func TestPrincipalFromRequestWithSessionResolverUsesSessionCookie(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/v1/tasks", nil)
	req.Header.Set("X-Client-ID", "client-a")
	req.Header.Set("Authorization", "Bearer api-token")
	req.AddCookie(&http.Cookie{Name: sessionCookieName, Value: "cookie-session-token", HttpOnly: true})
	tokenHash := sessionTokenHashFromRequest(req)

	principal, err := principalFromRequestWithSessionResolver(req, fakeSessionResolver{tokenHash: "user-cookie"})
	if err != nil {
		t.Fatalf("principalFromRequestWithSessionResolver: %v", err)
	}
	if principal.UserID != "user-cookie" {
		t.Fatalf("UserID = %q, want user-cookie", principal.UserID)
	}
	if bearerHash := hashSessionTokenForTest("api-token"); tokenHash == bearerHash {
		t.Fatalf("expected cookie session token to take precedence over bearer token")
	}
	if cookieHash := hashSessionTokenForTest("cookie-session-token"); tokenHash != cookieHash {
		t.Fatalf("SessionTokenHash = %q, want cookie hash %q", tokenHash, cookieHash)
	}
}

func TestPrincipalFromRequestWithUnknownSessionFallsBackToAnonymous(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/v1/tasks", nil)
	req.Header.Set("X-Client-ID", "client-a")
	req.Header.Set("Authorization", "Bearer session-token")

	principal, err := principalFromRequestWithSessionResolver(req, fakeSessionResolver{})
	if err != nil {
		t.Fatalf("principalFromRequestWithSessionResolver: %v", err)
	}
	if principal.UserID != "" {
		t.Fatalf("UserID = %q, want empty", principal.UserID)
	}
	if principal.AnonymousTokenHash != clientHashFromRequest(req) {
		t.Fatalf("AnonymousTokenHash = %q, want %q", principal.AnonymousTokenHash, clientHashFromRequest(req))
	}
	if principal.SessionTokenHash == "" {
		t.Fatalf("expected session token hash to be retained")
	}
}

func TestSessionTokenFromRequestFallsBackToBearer(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/v1/tasks", nil)
	req.Header.Set("Authorization", "Bearer session-token")

	if got := sessionTokenFromRequest(req); got != "session-token" {
		t.Fatalf("sessionTokenFromRequest() = %q, want session-token", got)
	}
}

func TestBearerTokenFromAuthorization(t *testing.T) {
	tests := []struct {
		name  string
		value string
		want  string
	}{
		{name: "empty", value: "", want: ""},
		{name: "not bearer", value: "ApiKey token", want: ""},
		{name: "bearer", value: "Bearer token", want: "token"},
		{name: "lowercase bearer", value: "bearer token", want: "token"},
		{name: "trim token", value: " Bearer  token  ", want: "token"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := bearerTokenFromAuthorization(tt.value); got != tt.want {
				t.Fatalf("bearerTokenFromAuthorization(%q) = %q, want %q", tt.value, got, tt.want)
			}
		})
	}
}

func hashSessionTokenForTest(token string) string {
	req := httptest.NewRequest(http.MethodGet, "/api/v1/tasks", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	return sessionTokenHashFromRequest(req)
}

func TestWithPrincipalAddsPrincipalToContext(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/v1/tasks", nil)
	req.Header.Set("X-Client-ID", "client-a")

	var gotHash string
	handler := withPrincipal(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		principal, ok := principalFromContext(r.Context())
		if !ok {
			t.Fatalf("expected principal in context")
		}
		gotHash = principal.AnonymousTokenHash
		w.WriteHeader(http.StatusNoContent)
	}))

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusNoContent)
	}
	if gotHash != clientHashFromRequest(req) {
		t.Fatalf("AnonymousTokenHash = %q, want %q", gotHash, clientHashFromRequest(req))
	}
}

func TestPrincipalFromContextMissing(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/v1/tasks", nil)
	if principal, ok := principalFromContext(req.Context()); ok {
		t.Fatalf("expected missing principal, got %#v", principal)
	}
}
