package tasks

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
)

type upstreamImageClient struct {
	client        *http.Client
	defaultAPIKey string
}

func newUpstreamImageClient(defaultAPIKey string) *upstreamImageClient {
	return &upstreamImageClient{
		defaultAPIKey: defaultAPIKey,
		client: &http.Client{
			Timeout: upstreamRequestTimeout,
		},
	}
}

func (c *upstreamImageClient) postJSON(ctx context.Context, baseURL string, apiKey string, path string, payload map[string]any) ([]byte, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, upstreamEndpoint(baseURL, path), bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if err := c.setAuthorization(req, apiKey); err != nil {
		return nil, err
	}
	return c.do(req, summarizeUpstreamError)
}

func (c *upstreamImageClient) postMultipart(ctx context.Context, baseURL string, apiKey string, path string, body io.Reader, contentType string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, upstreamEndpoint(baseURL, path), body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", contentType)
	if err := c.setAuthorization(req, apiKey); err != nil {
		return nil, err
	}
	return c.do(req, summarizeUpstreamError)
}

func (c *upstreamImageClient) downloadImage(ctx context.Context, imageURL string) ([]byte, error) {
	if strings.TrimSpace(imageURL) == "" {
		return nil, errors.New("image response missing b64_json and url")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, imageURL, nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.client.Do(req)
	if err != nil {
		return nil, retryableError{err: err}
	}
	defer resp.Body.Close()
	if resp.StatusCode >= http.StatusBadRequest {
		return nil, upstreamError{status: resp.StatusCode, message: fmt.Sprintf("image download HTTP %d", resp.StatusCode)}
	}
	return io.ReadAll(io.LimitReader(resp.Body, maxImageDownloadBytes))
}

func (c *upstreamImageClient) setAuthorization(req *http.Request, apiKey string) error {
	auth := normalizeBearerToken(apiKey)
	if auth == "" {
		auth = normalizeBearerToken(c.defaultAPIKey)
	}
	if auth == "" {
		return errors.New("missing API key for async task")
	}
	req.Header.Set("Authorization", auth)
	return nil
}

func (c *upstreamImageClient) do(req *http.Request, summarizeError func([]byte) string) ([]byte, error) {
	resp, err := c.client.Do(req)
	if err != nil {
		return nil, retryableError{err: err}
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= http.StatusBadRequest {
		return nil, upstreamError{status: resp.StatusCode, message: summarizeError(respBody)}
	}
	return respBody, nil
}

func upstreamEndpoint(baseURL string, path string) string {
	return strings.TrimRight(baseURL, "/") + "/" + strings.TrimLeft(path, "/")
}
