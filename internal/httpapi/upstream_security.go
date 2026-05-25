package httpapi

import (
	"errors"
	"net"
	"net/url"
	"strings"
)

func (s *Server) resolveUpstreamBaseURL(clientBaseURL string) (string, error) {
	return s.resolveUpstreamBaseURLWithFallback(clientBaseURL, s.cfg.DefaultUpstreamBaseURL)
}

func (s *Server) resolveUpstreamBaseURLNoFallback(clientBaseURL string) (string, error) {
	return s.resolveUpstreamBaseURLWithFallback(clientBaseURL, "")
}

func (s *Server) resolveUpstreamBaseURLWithFallback(clientBaseURL string, fallback string) (string, error) {
	baseURL := strings.TrimSpace(clientBaseURL)
	if baseURL == "" {
		baseURL = fallback
	}

	parsed, err := url.Parse(baseURL)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return "", errors.New("Invalid upstream base URL.")
	}
	if parsed.User != nil {
		return "", errors.New("Upstream base URL must not contain credentials.")
	}
	if parsed.RawQuery != "" || parsed.Fragment != "" {
		return "", errors.New("Upstream base URL must not contain query or fragment.")
	}
	if s.cfg.StrictUpstreamSecurity && parsed.Scheme != "https" && !s.cfg.AllowInsecureUpstreams {
		return "", errors.New("Upstream base URL must use https.")
	}
	if s.cfg.StrictUpstreamSecurity {
		if err := rejectUnsafeHost(parsed.Hostname()); err != nil {
			return "", err
		}
	}
	upstreamPath := strings.ToLower(strings.TrimRight(parsed.Path, "/"))
	if strings.HasSuffix(upstreamPath, "/images/generations") || strings.HasSuffix(upstreamPath, "/images/edits") {
		return "", errors.New("Upstream base URL should point to the provider /v1 address, not your local Go API address.")
	}
	return strings.TrimRight(baseURL, "/"), nil
}

func rejectUnsafeHost(host string) error {
	host = strings.TrimSpace(strings.Trim(host, "[]"))
	if host == "" {
		return errors.New("Invalid upstream base URL host.")
	}
	lower := strings.ToLower(host)
	if lower == "localhost" || strings.HasSuffix(lower, ".localhost") {
		return errors.New("Upstream base URL host is not allowed.")
	}
	if ip := net.ParseIP(host); ip != nil {
		if isUnsafeIP(ip) {
			return errors.New("Upstream base URL points to a private or local address.")
		}
		return nil
	}
	ips, err := net.LookupIP(host)
	if err != nil {
		return errors.New("Upstream base URL host could not be resolved.")
	}
	if len(ips) == 0 {
		return errors.New("Upstream base URL host could not be resolved.")
	}
	for _, ip := range ips {
		if isUnsafeIP(ip) {
			return errors.New("Upstream base URL resolves to a private or local address.")
		}
	}
	return nil
}

func isUnsafeIP(ip net.IP) bool {
	if ip == nil {
		return true
	}
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified() || ip.IsMulticast()
}
