package access

import "testing"

func TestCanRead(t *testing.T) {
	tests := []struct {
		name      string
		principal Principal
		resource  ResourceOwner
		want      bool
	}{
		{
			name:      "anonymous owner reads private resource",
			principal: NewAnonymousPrincipal("anon-hash"),
			resource:  ResourceOwner{AnonymousTokenHash: "anon-hash", Visibility: VisibilityPrivate},
			want:      true,
		},
		{
			name:      "user owner reads private resource",
			principal: NewUserPrincipal("user-1"),
			resource:  ResourceOwner{UserID: "user-1", Visibility: VisibilityPrivate},
			want:      true,
		},
		{
			name:      "public resource is readable without owner match",
			principal: Principal{},
			resource:  ResourceOwner{UserID: "user-1", Visibility: VisibilityPublic},
			want:      true,
		},
		{
			name:      "unlisted resource is readable without owner match",
			principal: Principal{},
			resource:  ResourceOwner{UserID: "user-1", Visibility: VisibilityUnlisted},
			want:      true,
		},
		{
			name:      "private resource is not readable by another identity",
			principal: NewAnonymousPrincipal("other"),
			resource:  ResourceOwner{AnonymousTokenHash: "owner", Visibility: VisibilityPrivate},
			want:      false,
		},
		{
			name:      "deleted resource is hidden from owner",
			principal: NewAnonymousPrincipal("owner"),
			resource:  ResourceOwner{AnonymousTokenHash: "owner", Deleted: true, Visibility: VisibilityPrivate},
			want:      false,
		},
		{
			name:      "admin reads deleted resource",
			principal: Principal{Admin: true},
			resource:  ResourceOwner{Deleted: true, Visibility: VisibilityPrivate},
			want:      true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := CanRead(tt.principal, tt.resource); got != tt.want {
				t.Fatalf("CanRead() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestCanWriteAndDelete(t *testing.T) {
	owner := NewAnonymousPrincipal("owner")
	resource := ResourceOwner{AnonymousTokenHash: "owner", Visibility: VisibilityPrivate}
	other := NewAnonymousPrincipal("other")

	if !CanWrite(owner, resource) {
		t.Fatalf("expected owner write")
	}
	if !CanDelete(owner, resource) {
		t.Fatalf("expected owner delete")
	}
	if CanWrite(other, resource) {
		t.Fatalf("expected non-owner write denied")
	}
	if CanDelete(other, resource) {
		t.Fatalf("expected non-owner delete denied")
	}
	if CanWrite(owner, ResourceOwner{AnonymousTokenHash: "owner", Deleted: true}) {
		t.Fatalf("expected deleted owner write denied")
	}
	if !CanWrite(Principal{Admin: true}, ResourceOwner{Deleted: true}) {
		t.Fatalf("expected admin write on deleted resource")
	}
}

func TestOwnerFilterAndIdentity(t *testing.T) {
	principal := Principal{UserID: " user-1 ", AnonymousTokenHash: " anon-1 "}
	filter := principal.OwnerFilter()

	if filter.UserID != "user-1" {
		t.Fatalf("UserID = %q, want user-1", filter.UserID)
	}
	if filter.AnonymousTokenHash != "anon-1" {
		t.Fatalf("AnonymousTokenHash = %q, want anon-1", filter.AnonymousTokenHash)
	}
	if !filter.HasIdentity() {
		t.Fatalf("expected filter to have identity")
	}
	if !filter.Matches(ResourceOwner{UserID: "user-1"}) {
		t.Fatalf("expected filter to match user owner")
	}
	if !filter.Matches(ResourceOwner{AnonymousTokenHash: "anon-1"}) {
		t.Fatalf("expected filter to match anonymous owner")
	}
	if filter.Matches(ResourceOwner{UserID: "other", AnonymousTokenHash: "other"}) {
		t.Fatalf("expected filter not to match another owner")
	}
	if !principal.HasIdentity() {
		t.Fatalf("expected principal to have identity")
	}
	if (Principal{}).HasIdentity() {
		t.Fatalf("expected empty principal to have no identity")
	}
	if (OwnerFilter{}).HasIdentity() {
		t.Fatalf("expected empty owner filter to have no identity")
	}
}
