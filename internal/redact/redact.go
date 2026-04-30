package redact

import (
	"regexp"
	"strings"
	"sync"
)

var (
	bearerPattern = regexp.MustCompile(`(?i)bearer\s+[a-z0-9._\-]+`)
	keyPattern    = regexp.MustCompile(`(?i)\bsk-[a-z0-9_\-]{8,}`)
	authPattern   = regexp.MustCompile(`(?i)(authorization["'\s:=]+)([^"',\s}]+)`)
)

var extraSecrets sync.Map

func AddSecret(secret string) {
	secret = strings.TrimSpace(secret)
	if secret != "" {
		extraSecrets.Store(secret, struct{}{})
	}
}

func String(value string) string {
	if value == "" {
		return ""
	}
	value = bearerPattern.ReplaceAllString(value, "Bearer [redacted]")
	value = keyPattern.ReplaceAllString(value, "sk-[redacted]")
	value = authPattern.ReplaceAllString(value, "${1}[redacted]")

	extraSecrets.Range(func(key any, _ any) bool {
		value = strings.ReplaceAll(value, key.(string), "[redacted]")
		return true
	})
	return value
}
