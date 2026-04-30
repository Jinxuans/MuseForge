package config

import (
	"bufio"
	"os"
	"strings"
)

func loadDotEnv(path string) map[string]string {
	file, err := os.Open(path)
	if err != nil {
		return map[string]string{}
	}
	defer file.Close()

	values := make(map[string]string)
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		if key == "" {
			continue
		}
		values[key] = parseDotEnvValue(value)
	}
	return values
}

func parseDotEnvValue(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	if (strings.HasPrefix(value, `"`) && strings.HasSuffix(value, `"`)) ||
		(strings.HasPrefix(value, `'`) && strings.HasSuffix(value, `'`)) {
		return strings.Trim(value, `"'`)
	}
	if hash := strings.Index(value, " #"); hash >= 0 {
		value = value[:hash]
	}
	return strings.TrimSpace(value)
}
