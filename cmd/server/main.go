package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"gpt-image-go/internal/config"
	"gpt-image-go/internal/db"
	"gpt-image-go/internal/httpapi"
	"gpt-image-go/internal/providers"
	"gpt-image-go/internal/redact"
	"gpt-image-go/internal/storage"
	"gpt-image-go/internal/tasks"
	"gpt-image-go/web"
)

func main() {
	cfg := config.Load()
	setupLogger(cfg)
	redact.AddSecret(cfg.DefaultProviderAPIKey)
	ctx := context.Background()

	var repo *tasks.Repository
	var providerRepo *providers.Repository
	var worker *tasks.Worker
	var store *storage.Local
	if cfg.DatabaseURL != "" {
		conn, err := db.Open(ctx, cfg.DatabaseURL)
		if err != nil {
			panic(err)
		}
		defer conn.Close()
		if err := db.Migrate(ctx, conn); err != nil {
			panic(err)
		}

		repo = tasks.NewRepository(conn)
		providerRepo = providers.NewRepository(conn)
		if err := repo.RecoverRunning(ctx); err != nil {
			panic(err)
		}
		store = storage.NewLocal(cfg.DataDir)
		worker = tasks.NewWorker(repo, store, cfg.WorkerConcurrency, cfg.DefaultProviderAPIKey)
		worker.Start(ctx)
		if cfg.ResultRetentionHours > 0 {
			cleaner := tasks.NewCleaner(
				repo,
				store,
				time.Duration(cfg.ResultRetentionHours)*time.Hour,
				time.Duration(cfg.CleanupIntervalMinutes)*time.Minute,
				cfg.CleanupBatchSize,
			)
			cleaner.Start(ctx)
			slog.Info("asset cleaner enabled",
				"retention_hours", cfg.ResultRetentionHours,
				"interval_minutes", cfg.CleanupIntervalMinutes,
				"batch_size", cfg.CleanupBatchSize,
			)
		}
		slog.Info("async task worker enabled", "concurrency", cfg.WorkerConcurrency, "data_dir", cfg.DataDir)
	} else {
		slog.Warn("DATABASE_URL is not set; async task API is disabled")
	}

	srv := httpapi.New(cfg, web.StaticFS(), repo, providerRepo, worker, store)

	fmt.Printf("GPT image Go server listening on http://127.0.0.1%s\n", cfg.Addr)
	slog.Info("server listening", "addr", cfg.Addr)
	if err := http.ListenAndServe(cfg.Addr, srv); err != nil {
		panic(err)
	}
}

func setupLogger(cfg config.Config) {
	var level slog.Level
	switch strings.ToLower(strings.TrimSpace(cfg.LogLevel)) {
	case "debug":
		level = slog.LevelDebug
	case "warn", "warning":
		level = slog.LevelWarn
	case "error":
		level = slog.LevelError
	default:
		level = slog.LevelInfo
	}
	opts := &slog.HandlerOptions{Level: level}
	if strings.EqualFold(strings.TrimSpace(cfg.LogFormat), "json") {
		slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, opts)))
		return
	}
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stdout, opts)))
}
