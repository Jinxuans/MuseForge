package tasks

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"sync"
	"time"

	"museforge/internal/redact"
)

func (w *Worker) Start(ctx context.Context) {
	var wg sync.WaitGroup
	for i := 0; i < w.concurrency; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			w.loop(ctx)
		}()
	}
	go func() {
		<-ctx.Done()
		wg.Wait()
	}()
}

func (w *Worker) Wake() {
	select {
	case w.wake <- struct{}{}:
	default:
	}
}

func (w *Worker) loop(ctx context.Context) {
	timer := time.NewTimer(0)
	defer timer.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-w.wake:
		case <-timer.C:
		}

		for {
			work, err := w.repo.ClaimNextQueued(ctx)
			if err != nil {
				sleep(timer, workerIdlePollInterval)
				break
			}
			if work == nil {
				sleep(timer, workerIdlePollInterval)
				break
			}
			w.runOne(ctx, work)
		}
	}
}

func (w *Worker) runOne(ctx context.Context, work *TaskWork) {
	startedAt := time.Now()
	defer func() {
		if rec := recover(); rec != nil {
			message := sanitizeError(fmt.Errorf("worker panic: %v", rec))
			if err := w.repo.MarkFailed(ctx, work.ID, message); err != nil {
				slog.Error("task panic mark failed error", "task_id", work.ID, "error", err)
			}
			slog.Error("task worker panic", "task_id", work.ID, "task_type", work.Type, "duration_ms", time.Since(startedAt).Milliseconds(), "panic", rec)
		}
	}()
	slog.Info("task started", "task_id", work.ID, "task_type", work.Type, "model", work.Model, "upstream_base_url", redact.String(work.BaseURL))
	var err error
	switch work.Type {
	case TypeGeneration:
		err = w.executeGeneration(ctx, work)
	case TypeEdit:
		err = w.executeEdit(ctx, work)
	default:
		err = fmt.Errorf("unsupported task type %q", work.Type)
	}
	if err != nil {
		sanitized := sanitizeError(err)
		if isRetryable(err) {
			attempts, maxAttempts, attemptErr := w.repo.Attempts(ctx, work.ID)
			if attemptErr == nil && attempts < maxAttempts {
				_ = w.repo.RequeueRetry(ctx, work.ID, sanitized, 0)
				slog.Warn("task retry queued",
					"task_id", work.ID,
					"task_type", work.Type,
					"attempt", attempts,
					"max_attempts", maxAttempts,
					"duration_ms", time.Since(startedAt).Milliseconds(),
					"error", sanitized,
				)
				w.Wake()
				return
			}
		}
		if markErr := w.repo.MarkFailed(ctx, work.ID, sanitized); markErr != nil {
			slog.Error("task mark failed error", "task_id", work.ID, "error", markErr)
		}
		if cleanupErr := w.store.DeleteTaskUploads(work.ID); cleanupErr != nil && !errors.Is(cleanupErr, os.ErrNotExist) {
			slog.Warn("task upload cleanup failed", "task_id", work.ID, "error", cleanupErr)
		}
		slog.Error("task failed",
			"task_id", work.ID,
			"task_type", work.Type,
			"duration_ms", time.Since(startedAt).Milliseconds(),
			"error", sanitized,
		)
		return
	}
	if err := w.repo.MarkSucceeded(ctx, work.ID); err != nil {
		slog.Error("task mark succeeded error", "task_id", work.ID, "error", err)
		return
	}
	if cleanupErr := w.store.DeleteTaskUploads(work.ID); cleanupErr != nil && !errors.Is(cleanupErr, os.ErrNotExist) {
		slog.Warn("task upload cleanup failed", "task_id", work.ID, "error", cleanupErr)
	}
	slog.Info("task succeeded", "task_id", work.ID, "task_type", work.Type, "duration_ms", time.Since(startedAt).Milliseconds())
}

func sleep(timer *time.Timer, duration time.Duration) {
	if !timer.Stop() {
		select {
		case <-timer.C:
		default:
		}
	}
	timer.Reset(duration)
}
