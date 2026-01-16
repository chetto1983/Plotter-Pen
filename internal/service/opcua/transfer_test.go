package opcua

import (
	"testing"
)

func TestPadToSize(t *testing.T) {
	tests := []struct {
		name     string
		data     []string
		size     int
		wantLen  int
		wantData []string
	}{
		{
			name:     "pad smaller array",
			data:     []string{"a", "b", "c"},
			size:     5,
			wantLen:  5,
			wantData: []string{"a", "b", "c", "", ""},
		},
		{
			name:     "truncate larger array",
			data:     []string{"a", "b", "c", "d", "e"},
			size:     3,
			wantLen:  3,
			wantData: []string{"a", "b", "c"},
		},
		{
			name:     "exact size",
			data:     []string{"a", "b", "c"},
			size:     3,
			wantLen:  3,
			wantData: []string{"a", "b", "c"},
		},
		{
			name:     "empty array",
			data:     []string{},
			size:     3,
			wantLen:  3,
			wantData: []string{"", "", ""},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := padToSize(tt.data, tt.size)
			if len(got) != tt.wantLen {
				t.Errorf("padToSize() len = %d, want %d", len(got), tt.wantLen)
			}
			for i, v := range tt.wantData {
				if got[i] != v {
					t.Errorf("padToSize()[%d] = %q, want %q", i, got[i], v)
				}
			}
		})
	}
}

func TestNewChunkedTransfer(t *testing.T) {
	configMgr := NewConfigManager("")
	client := NewClient(configMgr)

	cfg := configMgr.Get()
	transfer := NewChunkedTransfer(client, cfg)

	if transfer == nil {
		t.Fatal("expected transfer to be created")
	}

	if transfer.IsRunning() {
		t.Error("expected transfer to not be running initially")
	}
}

func TestChunkedTransfer_DefaultConfig(t *testing.T) {
	configMgr := NewConfigManager("")
	client := NewClient(configMgr)

	// Test with zero values - should use defaults
	cfg := Config{}
	transfer := NewChunkedTransfer(client, cfg)

	if transfer.config.ChunkSize != 20 {
		t.Errorf("expected ChunkSize 20, got %d", transfer.config.ChunkSize)
	}
	if transfer.config.AckTimeout != 5000 {
		t.Errorf("expected AckTimeout 5000, got %d", transfer.config.AckTimeout)
	}
	if transfer.config.PollInterval != 100 {
		t.Errorf("expected PollInterval 100, got %d", transfer.config.PollInterval)
	}
}

func TestTransferProgress(t *testing.T) {
	progress := TransferProgress{
		Chunk:      5,
		Total:      10,
		Percent:    50,
		TotalLines: 200,
		Done:       false,
	}

	if progress.Chunk != 5 {
		t.Errorf("expected Chunk 5, got %d", progress.Chunk)
	}
	if progress.Percent != 50 {
		t.Errorf("expected Percent 50, got %d", progress.Percent)
	}
	if progress.Done {
		t.Error("expected Done false")
	}
}

func TestChunkCalculation(t *testing.T) {
	tests := []struct {
		totalLines int
		chunkSize  int
		wantChunks int
	}{
		{100, 20, 5},
		{101, 20, 6},
		{20, 20, 1},
		{19, 20, 1},
		{40, 20, 2},
		{0, 20, 0},
	}

	for _, tt := range tests {
		totalChunks := (tt.totalLines + tt.chunkSize - 1) / tt.chunkSize
		if tt.totalLines == 0 {
			totalChunks = 0
		}
		if totalChunks != tt.wantChunks {
			t.Errorf("chunks for %d lines with size %d: got %d, want %d",
				tt.totalLines, tt.chunkSize, totalChunks, tt.wantChunks)
		}
	}
}
