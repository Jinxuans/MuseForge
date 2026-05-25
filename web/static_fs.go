//go:build !with_embed

package web

import (
	"net/http"
	"os"
)

func StaticFS() http.FileSystem {
	if _, err := os.Stat("web/dist/index.html"); err != nil {
		return nil
	}
	return http.Dir("web/dist")
}
