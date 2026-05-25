package httpapi

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strings"

	"museforge/internal/access"
)

type principalContextKey struct{}

const sessionCookieName = "museforge_session"

// Session principals are reserved for the future user-system phase. The
// self-hosted stable build still reports auth=false and uses X-Client-ID as
// the only ownership boundary for persisted tasks, assets, and profiles.
type sessionPrincipalResolver interface {
	ResolveSessionPrincipal(ctx context.Context, tokenHash string) (userID string, ok bool, err error)
}

func withPrincipal(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		principal := principalFromRequest(r)
		ctx := context.WithValue(r.Context(), principalContextKey{}, principal)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (s *Server) handleV1Me(w http.ResponseWriter, r *http.Request) {
	v1Response(w, r, http.StatusOK, map[string]any{
		"principal": principalDTO(principalFromRequest(r)),
	})
}

func (s *Server) handleV1AuthLogout(w http.ResponseWriter, r *http.Request) {
	clearSessionCookie(w)
	v1Response(w, r, http.StatusOK, map[string]any{
		"loggedOut": true,
	})
}

func principalFromContext(ctx context.Context) (access.Principal, bool) {
	principal, ok := ctx.Value(principalContextKey{}).(access.Principal)
	return principal, ok
}

func principalFromRequest(r *http.Request) access.Principal {
	principal, _ := principalFromRequestWithSessionResolver(r, nil)
	return principal
}

func principalFromRequestWithSessionResolver(r *http.Request, resolver sessionPrincipalResolver) (access.Principal, error) {
	principal := access.NewAnonymousPrincipal(clientHashFromRequest(r))
	principal.SessionTokenHash = sessionTokenHashFromRequest(r)
	if principal.SessionTokenHash == "" || resolver == nil {
		return principal, nil
	}

	userID, ok, err := resolver.ResolveSessionPrincipal(r.Context(), principal.SessionTokenHash)
	if err != nil {
		return access.Principal{}, err
	}
	if ok {
		principal.UserID = strings.TrimSpace(userID)
	}
	return principal, nil
}

func sessionTokenHashFromRequest(r *http.Request) string {
	token := sessionTokenFromRequest(r)
	if token == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func sessionTokenFromRequest(r *http.Request) string {
	if cookie, err := r.Cookie(sessionCookieName); err == nil {
		if token := strings.TrimSpace(cookie.Value); token != "" {
			return token
		}
	}
	return bearerTokenFromAuthorization(r.Header.Get("Authorization"))
}

func bearerTokenFromAuthorization(value string) string {
	value = strings.TrimSpace(value)
	if value == "" || !strings.HasPrefix(strings.ToLower(value), "bearer ") {
		return ""
	}
	return strings.TrimSpace(value[len("bearer "):])
}

func clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}

func principalDTO(principal access.Principal) map[string]any {
	principalType := "guest"
	userID := strings.TrimSpace(principal.UserID)
	anonymousTokenHash := strings.TrimSpace(principal.AnonymousTokenHash)
	if userID != "" {
		principalType = "user"
	} else if anonymousTokenHash != "" {
		principalType = "anonymous"
	}
	return map[string]any{
		"type":                  principalType,
		"authenticated":         userID != "",
		"userId":                nullableStringValue(userID),
		"hasAnonymousIdentity":  anonymousTokenHash != "",
		"hasSession":            strings.TrimSpace(principal.SessionTokenHash) != "",
		"anonymousIdentityType": "client_hash",
	}
}
