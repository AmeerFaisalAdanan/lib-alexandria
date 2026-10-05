package auth

import (
	"context"
	"fmt"
	"net/http"
)

// Probe checks that the team's public key set can be fetched, which is what validating tokens depends on.
// It sends no credentials and is cheap, so the admin status page can call it.
func (c *Cloudflare) Probe(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.jwksURL, nil)
	if err != nil {
		return err
	}
	resp, err := c.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("jwks status %d", resp.StatusCode)
	}
	return nil
}
