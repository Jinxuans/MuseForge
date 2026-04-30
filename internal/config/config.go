package config

import (
	"os"
	"strings"
)

const (
	DefaultAddr            = ":5000"
	DefaultUpstreamBaseURL = "https://api.openai.com/v1"
)

type Config struct {
	Addr                   string
	DefaultUpstreamBaseURL string
	DefaultProviderAPIKey  string
	DatabaseURL            string
	DataDir                string
	WorkerConcurrency      int
	TaskMaxAttempts        int
	ResultRetentionHours   int
	CleanupIntervalMinutes int
	CleanupBatchSize       int
	AllowInsecureUpstreams bool
	StrictUpstreamSecurity bool
	LogLevel               string
	LogFormat              string
}

func Load() Config {
	fileValues := loadDotEnv(configPath())

	addr := configValue(fileValues, "ADDR")
	if addr == "" {
		addr = DefaultAddr
	}
	dataDir := configValue(fileValues, "DATA_DIR")
	if dataDir == "" {
		dataDir = "./data"
	}

	return Config{
		Addr:                   addr,
		DefaultUpstreamBaseURL: firstNonEmpty(configValue(fileValues, "OPENAI_BASE_URL"), configValue(fileValues, "DEFAULT_PROVIDER_BASE_URL"), DefaultUpstreamBaseURL),
		DefaultProviderAPIKey:  firstNonEmpty(configValue(fileValues, "OPENAI_API_KEY"), configValue(fileValues, "DEFAULT_PROVIDER_API_KEY")),
		DatabaseURL:            configValue(fileValues, "DATABASE_URL"),
		DataDir:                dataDir,
		WorkerConcurrency:      intFromConfig(fileValues, "WORKER_CONCURRENCY", 2),
		TaskMaxAttempts:        intFromConfig(fileValues, "TASK_MAX_ATTEMPTS", 3),
		ResultRetentionHours:   intFromConfig(fileValues, "RESULT_RETENTION_HOURS", 168),
		CleanupIntervalMinutes: intFromConfig(fileValues, "CLEANUP_INTERVAL_MINUTES", 30),
		CleanupBatchSize:       intFromConfig(fileValues, "CLEANUP_BATCH_SIZE", 200),
		AllowInsecureUpstreams: configValue(fileValues, "ALLOW_INSECURE_UPSTREAMS") == "1",
		StrictUpstreamSecurity: configValue(fileValues, "STRICT_UPSTREAM_SECURITY") == "1",
		LogLevel:               firstNonEmpty(configValue(fileValues, "LOG_LEVEL"), "info"),
		LogFormat:              firstNonEmpty(configValue(fileValues, "LOG_FORMAT"), "text"),
	}
}

func configPath() string {
	if path := strings.TrimSpace(os.Getenv("CONFIG_FILE")); path != "" {
		return path
	}
	return ".env"
}

func configValue(fileValues map[string]string, key string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return strings.TrimSpace(fileValues[key])
}

func intFromConfig(fileValues map[string]string, key string, fallback int) int {
	value := configValue(fileValues, key)
	if value == "" {
		return fallback
	}
	var parsed int
	for _, r := range value {
		if r < '0' || r > '9' {
			return fallback
		}
		parsed = parsed*10 + int(r-'0')
	}
	if parsed <= 0 {
		return fallback
	}
	return parsed
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			return value
		}
	}
	return ""
}
