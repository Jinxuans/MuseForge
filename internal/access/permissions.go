package access

import "strings"

const (
	VisibilityPrivate  = "private"
	VisibilityUnlisted = "unlisted"
	VisibilityPublic   = "public"
)

type Principal struct {
	UserID             string
	AnonymousTokenHash string
	SessionTokenHash   string
	Admin              bool
}

type ResourceOwner struct {
	UserID             string
	AnonymousTokenHash string
	Visibility         string
	Deleted            bool
}

type OwnerFilter struct {
	UserID             string
	AnonymousTokenHash string
}

func (f OwnerFilter) HasIdentity() bool {
	return strings.TrimSpace(f.UserID) != "" || strings.TrimSpace(f.AnonymousTokenHash) != ""
}

func (f OwnerFilter) Matches(resource ResourceOwner) bool {
	userID := strings.TrimSpace(f.UserID)
	if userID != "" && userID == strings.TrimSpace(resource.UserID) {
		return true
	}
	tokenHash := strings.TrimSpace(f.AnonymousTokenHash)
	return tokenHash != "" && tokenHash == strings.TrimSpace(resource.AnonymousTokenHash)
}

func NewAnonymousPrincipal(tokenHash string) Principal {
	return Principal{AnonymousTokenHash: strings.TrimSpace(tokenHash)}
}

func NewUserPrincipal(userID string) Principal {
	return Principal{UserID: strings.TrimSpace(userID)}
}

func (p Principal) HasIdentity() bool {
	return strings.TrimSpace(p.UserID) != "" || strings.TrimSpace(p.AnonymousTokenHash) != ""
}

func (p Principal) OwnerFilter() OwnerFilter {
	return OwnerFilter{
		UserID:             strings.TrimSpace(p.UserID),
		AnonymousTokenHash: strings.TrimSpace(p.AnonymousTokenHash),
	}
}

func CanRead(principal Principal, resource ResourceOwner) bool {
	if resource.Deleted && !principal.Admin {
		return false
	}
	if principal.Admin {
		return true
	}
	if isOwner(principal, resource) {
		return true
	}
	switch normalizeVisibility(resource.Visibility) {
	case VisibilityPublic, VisibilityUnlisted:
		return true
	default:
		return false
	}
}

func CanWrite(principal Principal, resource ResourceOwner) bool {
	if resource.Deleted && !principal.Admin {
		return false
	}
	return principal.Admin || isOwner(principal, resource)
}

func CanDelete(principal Principal, resource ResourceOwner) bool {
	return CanWrite(principal, resource)
}

func isOwner(principal Principal, resource ResourceOwner) bool {
	return principal.OwnerFilter().Matches(resource)
}

func normalizeVisibility(value string) string {
	switch strings.TrimSpace(strings.ToLower(value)) {
	case VisibilityPublic:
		return VisibilityPublic
	case VisibilityUnlisted:
		return VisibilityUnlisted
	default:
		return VisibilityPrivate
	}
}
