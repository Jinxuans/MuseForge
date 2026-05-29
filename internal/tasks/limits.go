package tasks

import "time"

const (
	workerIdlePollInterval = 2 * time.Second
	upstreamRequestTimeout = 300 * time.Second
	imageDownloadTimeout   = 30 * time.Second

	maxImagesPerTask      = 10
	maxImageDownloadBytes = 100 << 20
)
