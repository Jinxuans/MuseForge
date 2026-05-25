package db_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"testing"
	"time"

	"gpt-image-go/internal/db"
	"gpt-image-go/internal/providers"
	"gpt-image-go/internal/tasks"

	_ "github.com/lib/pq"
)

func TestPostgresIntegrationMigrationsAndRepositories(t *testing.T) {
	databaseURL := os.Getenv("MUSEFORGE_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("set MUSEFORGE_TEST_DATABASE_URL to run PostgreSQL integration tests")
	}

	ctx := context.Background()
	schema := fmt.Sprintf("museforge_test_%d", time.Now().UnixNano())

	admin, err := sql.Open("postgres", databaseURL)
	if err != nil {
		t.Fatalf("open admin db: %v", err)
	}
	defer admin.Close()
	if _, err := admin.ExecContext(ctx, "CREATE SCHEMA "+schema); err != nil {
		t.Fatalf("create schema: %v", err)
	}
	t.Cleanup(func() {
		_, _ = admin.ExecContext(context.Background(), "DROP SCHEMA IF EXISTS "+schema+" CASCADE")
	})

	testURL, err := databaseURLWithSearchPath(databaseURL, schema)
	if err != nil {
		t.Fatalf("build schema url: %v", err)
	}
	conn, err := db.Open(ctx, testURL)
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	defer conn.Close()

	if err := db.Migrate(ctx, conn); err != nil {
		t.Fatalf("migrate empty schema: %v", err)
	}
	if err := db.Migrate(ctx, conn); err != nil {
		t.Fatalf("migrate twice: %v", err)
	}

	taskRepo := tasks.NewRepository(conn)
	providerRepo := providers.NewRepository(conn)
	clientA := "client-a-hash"
	clientB := "client-b-hash"

	task, err := taskRepo.CreateGeneration(ctx, tasks.CreateGenerationTask{
		BaseURL:     "https://api.openai.com/v1",
		APIKey:      "sk-test",
		ClientHash:  clientA,
		Model:       "gpt-image-2",
		Prompt:      "integration prompt",
		Params:      map[string]any{"size": "1024x1024"},
		MaxAttempts: 3,
	})
	if err != nil {
		t.Fatalf("create generation task: %v", err)
	}

	tasksA, err := taskRepo.List(ctx, clientA, 10)
	if err != nil {
		t.Fatalf("list client A tasks: %v", err)
	}
	if len(tasksA) != 1 || tasksA[0].ID != task.ID {
		t.Fatalf("client A tasks = %#v, want created task", tasksA)
	}
	tasksB, err := taskRepo.List(ctx, clientB, 10)
	if err != nil {
		t.Fatalf("list client B tasks: %v", err)
	}
	if len(tasksB) != 0 {
		t.Fatalf("client B must not see client A tasks: %#v", tasksB)
	}

	asset := tasks.Asset{
		ID:         "11111111-1111-7111-8111-111111111111",
		TaskID:     task.ID,
		Kind:       "output",
		StorageKey: "results/" + task.ID + "/0.png",
		PublicURL:  "/files/results/" + task.ID + "/0.png",
		MIME:       "image/png",
		Width:      1024,
		Height:     1024,
		SizeBytes:  12,
		SHA256:     "sha256",
		Visibility: "private",
		Metadata:   json.RawMessage(`{"revised_prompt":"rewritten prompt"}`),
	}
	if err := taskRepo.CreateAsset(ctx, asset); err != nil {
		t.Fatalf("create asset: %v", err)
	}
	assetsA, err := taskRepo.ListAssets(ctx, clientA, 10)
	if err != nil {
		t.Fatalf("list client A assets: %v", err)
	}
	if len(assetsA) != 1 || assetsA[0].ID != asset.ID {
		t.Fatalf("client A assets = %#v, want created asset", assetsA)
	}
	var assetMetadata map[string]string
	if err := json.Unmarshal(assetsA[0].Metadata, &assetMetadata); err != nil {
		t.Fatalf("decode asset metadata: %v", err)
	}
	if assetMetadata["revised_prompt"] != "rewritten prompt" {
		t.Fatalf("revised_prompt = %q, want rewritten prompt", assetMetadata["revised_prompt"])
	}
	assetB, err := taskRepo.GetAsset(ctx, clientB, asset.ID)
	if err != nil {
		t.Fatalf("get client B asset: %v", err)
	}
	if assetB != nil {
		t.Fatalf("client B must not read client A asset: %#v", assetB)
	}

	profile, err := providerRepo.Create(ctx, clientA, "OpenAI", "openai", "https://api.openai.com/v1", "sk-profile", "gpt-image-2", "images", json.RawMessage(`{"timeoutSeconds":300}`))
	if err != nil {
		t.Fatalf("create provider profile: %v", err)
	}
	profilesA, err := providerRepo.List(ctx, clientA)
	if err != nil {
		t.Fatalf("list client A profiles: %v", err)
	}
	if len(profilesA) != 1 || profilesA[0].ID != profile.ID {
		t.Fatalf("client A profiles = %#v, want created profile", profilesA)
	}
	profilesB, err := providerRepo.List(ctx, clientB)
	if err != nil {
		t.Fatalf("list client B profiles: %v", err)
	}
	if len(profilesB) != 0 {
		t.Fatalf("client B must not see client A profiles: %#v", profilesB)
	}
	_, _, ok, err := providerRepo.GetSecret(ctx, clientB, profile.ID)
	if err != nil {
		t.Fatalf("get client B profile secret: %v", err)
	}
	if ok {
		t.Fatalf("client B must not read client A profile secret")
	}
}

func databaseURLWithSearchPath(databaseURL string, schema string) (string, error) {
	parsed, err := url.Parse(databaseURL)
	if err != nil {
		return "", err
	}
	query := parsed.Query()
	query.Set("options", "-c search_path="+schema)
	parsed.RawQuery = query.Encode()
	return parsed.String(), nil
}
