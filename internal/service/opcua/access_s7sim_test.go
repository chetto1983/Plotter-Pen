//go:build s7sim

package opcua

import (
	"context"
	"testing"
	"time"
)

func TestAccessLevels_S7Sim(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	client, cfg := connectS7Sim(ctx, t)
	for _, tc := range []struct {
		name string
		read func(context.Context, string) (uint8, error)
	}{
		{"access", client.ReadNodeAccessLevel},
		{"user access", client.ReadNodeUserAccessLevel},
	} {
		t.Run(tc.name, func(t *testing.T) {
			level, err := tc.read(ctx, cfg.PointArrayNode)
			if err != nil || level != 3 { // CurrentRead | CurrentWrite
				t.Fatalf("level %d, error %v; want read and write", level, err)
			}
			if _, err := tc.read(ctx, "ns=4;i=999999"); err == nil {
				t.Fatal("missing node must return a status error")
			}
		})
	}
}
