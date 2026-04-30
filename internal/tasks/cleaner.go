package tasks

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"time"

	"gpt-image-go/internal/storage"
)

type Cleaner struct {
	repo      *Repository
	store     *storage.Local
	retention time.Duration
	interval  time.Duration
	batchSize int
}

func NewCleaner(repo *Repository, store *storage.Local, retention time.Duration, interval time.Duration, batchSize int) *Cleaner {
	if interval <= 0 {
		interval = 30 * time.Minute
	}
	if batchSize <= 0 {
		batchSize = 200
	}
	return &Cleaner{
		repo:      repo,
		store:     store,
		retention: retention,
		interval:  interval,
		batchSize: batchSize,
	}
}

func (c *Cleaner) Start(ctx context.Context) {
	if c == nil || c.repo == nil || c.store == nil || c.retention <= 0 {
		return
	}
	go c.loop(ctx)
}

func (c *Cleaner) loop(ctx context.Context) {
	c.runOnce(ctx)
	ticker := time.NewTicker(c.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			c.runOnce(ctx)
		}
	}
}

func (c *Cleaner) runOnce(ctx context.Context) {
	cutoff := time.Now().Add(-c.retention)
	totalDeleted := 0
	totalBytes := int64(0)

	for {
		assets, err := c.repo.DeleteAssetsOlderThan(ctx, cutoff, c.batchSize)
		if err != nil {
			slog.Error("asset cleanup query failed", "error", err)
			return
		}
		if len(assets) == 0 {
			break
		}
		for _, asset := range assets {
			if err := c.store.Delete(asset.StorageKey); err != nil && !errors.Is(err, os.ErrNotExist) {
				slog.Warn("asset cleanup file delete failed", "asset_id", asset.ID, "storage_key", asset.StorageKey, "error", err)
				continue
			}
			totalDeleted++
			totalBytes += asset.SizeBytes
		}
		if len(assets) < c.batchSize {
			break
		}
	}

	if totalDeleted > 0 {
		slog.Info("asset cleanup completed", "deleted_assets", totalDeleted, "freed_bytes", totalBytes, "retention_hours", int(c.retention.Hours()))
	}
}
