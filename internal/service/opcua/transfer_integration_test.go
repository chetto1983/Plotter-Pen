// +build integration

package opcua

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/gopcua/opcua/ua"
)

// getConfigPath finds opcua_config.json from project root
func getConfigPath() string {
	// Try relative paths from test location
	paths := []string{
		"../../../opcua_config.json",
		"opcua_config.json",
		filepath.Join(os.Getenv("USERPROFILE"), "OneDrive - Sonepar", "Documenti", "Plotter-Pen", "opcua_config.json"),
	}
	for _, p := range paths {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return "../../../opcua_config.json"
}

// TestChunkedTransfer_RealPLC tests chunked transfer with actual PLC hardware
// Run with: go test -tags=integration -v ./internal/service/opcua/... -run TestChunkedTransfer_RealPLC
func TestChunkedTransfer_RealPLC(t *testing.T) {
	// Load config from file
	configMgr := NewConfigManager(getConfigPath())
	cfg := configMgr.Get()

	t.Logf("Connecting to PLC at %s", cfg.Endpoint)
	t.Logf("PointArrayNode: %s", cfg.PointArrayNode)
	t.Logf("TriggerWriteNode: %s", cfg.TriggerWriteNode)
	t.Logf("ReadDoneNode: %s", cfg.ReadDoneNode)
	t.Logf("EndOfFileNode: %s", cfg.EndOfFileNode)
	t.Logf("ChunkSize: %d", cfg.ChunkSize)

	// Create client and connect
	client := NewClient(configMgr)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Failed to connect: %v", err)
	}
	defer client.Disconnect(context.Background())

	t.Log("Connected to PLC successfully")

	// Generate test data: 50 lines (will create 3 chunks of 20)
	testData := make([]string, 50)
	for i := 0; i < 50; i++ {
		testData[i] = fmt.Sprintf("L,%d,%d", i*10, i*20)
	}
	t.Logf("Test data: %d lines, expecting %d chunks", len(testData), (len(testData)+cfg.ChunkSize-1)/cfg.ChunkSize)

	// Create transfer
	transfer := NewChunkedTransfer(client, cfg)

	// Track progress
	var progressUpdates []TransferProgress
	var mu sync.Mutex
	var wg sync.WaitGroup
	wg.Add(1)

	progressFunc := func(p TransferProgress) {
		mu.Lock()
		progressUpdates = append(progressUpdates, p)
		mu.Unlock()

		if p.Error != "" {
			t.Logf("ERROR at chunk %d/%d: %s", p.Chunk, p.Total, p.Error)
		} else if p.Done {
			t.Logf("COMPLETE: %d chunks, %d lines, %.2fs", p.Total, p.TotalLines, p.Duration)
			wg.Done()
		} else {
			t.Logf("PROGRESS: chunk %d/%d (%d%%)", p.Chunk, p.Total, p.Percent)
		}
	}

	// Start async transfer
	transferCtx, transferCancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer transferCancel()

	t.Log("Starting chunked transfer...")
	if err := transfer.SendAsync(transferCtx, testData, progressFunc); err != nil {
		t.Fatalf("SendAsync failed: %v", err)
	}

	// Wait for completion or timeout
	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()

	select {
	case <-done:
		t.Log("Transfer completed successfully")
	case <-time.After(60 * time.Second):
		t.Fatal("Transfer timeout after 60 seconds")
	}

	// Verify progress updates
	mu.Lock()
	defer mu.Unlock()

	if len(progressUpdates) == 0 {
		t.Error("No progress updates received")
	}

	lastProgress := progressUpdates[len(progressUpdates)-1]
	if !lastProgress.Done {
		t.Errorf("Last progress should be done, got: %+v", lastProgress)
	}
	if lastProgress.Error != "" {
		t.Errorf("Transfer had error: %s", lastProgress.Error)
	}

	t.Logf("Total progress updates: %d", len(progressUpdates))
	t.Logf("Transfer duration: %.2f seconds", lastProgress.Duration)
}

// TestChunkedTransfer_SmallBatch tests with a single chunk
func TestChunkedTransfer_SmallBatch_RealPLC(t *testing.T) {
	configMgr := NewConfigManager(getConfigPath())
	cfg := configMgr.Get()

	client := NewClient(configMgr)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Failed to connect: %v", err)
	}
	defer client.Disconnect(context.Background())

	// 10 lines = 1 chunk (less than chunk size of 20)
	testData := make([]string, 10)
	for i := 0; i < 10; i++ {
		testData[i] = fmt.Sprintf("L,%d,%d", i*5, i*10)
	}

	transfer := NewChunkedTransfer(client, cfg)
	var wg sync.WaitGroup
	wg.Add(1)

	var finalProgress TransferProgress
	err := transfer.SendAsync(ctx, testData, func(p TransferProgress) {
		t.Logf("Progress: chunk %d/%d, done=%v, error=%s", p.Chunk, p.Total, p.Done, p.Error)
		if p.Done || p.Error != "" {
			finalProgress = p
			wg.Done()
		}
	})

	if err != nil {
		t.Fatalf("SendAsync failed: %v", err)
	}

	wg.Wait()

	if finalProgress.Error != "" {
		t.Errorf("Transfer error: %s", finalProgress.Error)
	}
	if !finalProgress.Done {
		t.Error("Transfer should be done")
	}
	if finalProgress.Total != 1 {
		t.Errorf("Expected 1 chunk, got %d", finalProgress.Total)
	}
}

// TestChunkedTransfer_Cancel tests cancellation
func TestChunkedTransfer_Cancel_RealPLC(t *testing.T) {
	configMgr := NewConfigManager(getConfigPath())
	cfg := configMgr.Get()

	client := NewClient(configMgr)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Failed to connect: %v", err)
	}
	defer client.Disconnect(context.Background())

	// 100 lines = 5 chunks - gives time to cancel
	testData := make([]string, 100)
	for i := 0; i < 100; i++ {
		testData[i] = fmt.Sprintf("L,%d,%d", i*2, i*4)
	}

	transfer := NewChunkedTransfer(client, cfg)

	progressCh := make(chan TransferProgress, 10)
	err := transfer.SendAsync(ctx, testData, func(p TransferProgress) {
		select {
		case progressCh <- p:
		default:
		}
	})

	if err != nil {
		t.Fatalf("SendAsync failed: %v", err)
	}

	// Wait for first progress, then cancel
	select {
	case p := <-progressCh:
		t.Logf("Got progress chunk %d, cancelling...", p.Chunk)
		transfer.Cancel()
	case <-time.After(10 * time.Second):
		t.Fatal("No progress within 10 seconds")
	}

	// Wait for cancellation to take effect
	time.Sleep(500 * time.Millisecond)

	if transfer.IsRunning() {
		t.Error("Transfer should not be running after cancel")
	}
}

// TestReadWriteBool_RealPLC tests direct bool node read/write
func TestReadWriteBool_RealPLC(t *testing.T) {
	configMgr := NewConfigManager(getConfigPath())
	cfg := configMgr.Get()

	client := NewClient(configMgr)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Failed to connect: %v", err)
	}
	defer client.Disconnect(context.Background())

	// First read to check types
	t.Log("Reading TriggerWriteNode to check type...")
	val, err := client.ReadNode(ctx, cfg.TriggerWriteNode)
	if err != nil {
		t.Logf("Read TriggerWriteNode failed: %v", err)
	} else {
		t.Logf("TriggerWriteNode type: %T, value: %v", val, val)
	}

	// Check DataType attribute
	t.Log("Reading TriggerWriteNode DataType...")
	dataType, err := client.ReadNodeDataType(ctx, cfg.TriggerWriteNode)
	if err != nil {
		t.Logf("Read DataType failed: %v", err)
	} else {
		t.Logf("TriggerWriteNode DataType: %v", dataType)
	}

	// Check AccessLevel (bit 0=read, bit 1=write)
	t.Log("Reading TriggerWriteNode AccessLevel...")
	accessLevel, err := client.ReadNodeAccessLevel(ctx, cfg.TriggerWriteNode)
	if err != nil {
		t.Logf("Read AccessLevel failed: %v", err)
	} else {
		readable := accessLevel&0x01 != 0
		writable := accessLevel&0x02 != 0
		t.Logf("TriggerWriteNode AccessLevel: %d (readable=%v, writable=%v)", accessLevel, readable, writable)
	}

	// Check UserAccessLevel (actual permissions for current user)
	t.Log("Reading TriggerWriteNode UserAccessLevel...")
	userAccessLevel, err := client.ReadNodeUserAccessLevel(ctx, cfg.TriggerWriteNode)
	if err != nil {
		t.Logf("Read UserAccessLevel failed: %v", err)
	} else {
		readable := userAccessLevel&0x01 != 0
		writable := userAccessLevel&0x02 != 0
		t.Logf("TriggerWriteNode UserAccessLevel: %d (readable=%v, writable=%v)", userAccessLevel, readable, writable)
	}

	t.Log("Reading ReadDoneNode to check type...")
	val, err = client.ReadNode(ctx, cfg.ReadDoneNode)
	if err != nil {
		t.Logf("Read ReadDoneNode failed: %v", err)
	} else {
		t.Logf("ReadDoneNode type: %T, value: %v", val, val)
	}

	t.Log("Reading EndOfFileNode to check type...")
	val, err = client.ReadNode(ctx, cfg.EndOfFileNode)
	if err != nil {
		t.Logf("Read EndOfFileNode failed: %v", err)
	} else {
		t.Logf("EndOfFileNode type: %T, value: %v", val, val)
	}

	t.Log("Reading PointArrayNode to check type...")
	val, err = client.ReadNode(ctx, cfg.PointArrayNode)
	if err != nil {
		t.Logf("Read PointArrayNode failed: %v", err)
	} else {
		t.Logf("PointArrayNode type: %T, value: %v", val, val)
	}

	// Check PointArrayNode DataType
	t.Log("Reading PointArrayNode DataType...")
	dataType, err = client.ReadNodeDataType(ctx, cfg.PointArrayNode)
	if err != nil {
		t.Logf("Read PointArrayNode DataType failed: %v", err)
	} else {
		t.Logf("PointArrayNode DataType: %v", dataType)
	}

	// Check PointArrayNode AccessLevel
	t.Log("Reading PointArrayNode AccessLevel...")
	accessLevel, err = client.ReadNodeAccessLevel(ctx, cfg.PointArrayNode)
	if err != nil {
		t.Logf("Read PointArrayNode AccessLevel failed: %v", err)
	} else {
		readable := accessLevel&0x01 != 0
		writable := accessLevel&0x02 != 0
		t.Logf("PointArrayNode AccessLevel: %d (readable=%v, writable=%v)", accessLevel, readable, writable)
	}

	t.Log("Reading Position X...")
	val, err = client.ReadNode(ctx, cfg.PositionXNode)
	if err != nil {
		t.Logf("Read PositionXNode failed: %v", err)
	} else {
		t.Logf("PositionXNode type: %T, value: %v", val, val)
	}

	// Now test writes
	t.Log("\n=== Testing Writes ===")

	// Debug: Check what variant type gopcua creates
	testVariant := ua.MustVariant(true)
	t.Logf("DEBUG: Boolean variant TypeID=%v, Type=%T", testVariant.Type(), testVariant.Value())

	testVariant2, _ := ua.NewVariant(byte(1))
	t.Logf("DEBUG: Byte variant TypeID=%v, Type=%T", testVariant2.Type(), testVariant2.Value())

	t.Log("Writing TRUE to TriggerWriteNode...")
	if err := client.WriteBoolNode(ctx, cfg.TriggerWriteNode, true); err != nil {
		t.Logf("WriteBoolNode (trigger=true) failed: %v", err)
	} else {
		t.Log("WriteBoolNode (trigger=true) SUCCESS")
	}

	// Read back
	val, _ = client.ReadNode(ctx, cfg.TriggerWriteNode)
	t.Logf("TriggerWriteNode after write: %v", val)

	// Reset trigger
	t.Log("Writing FALSE to TriggerWriteNode...")
	if err := client.WriteBoolNode(ctx, cfg.TriggerWriteNode, false); err != nil {
		t.Logf("WriteBoolNode (trigger=false) failed: %v", err)
	} else {
		t.Log("WriteBoolNode (trigger=false) SUCCESS")
	}

	// Try string array write
	t.Log("\n=== Testing String Array Write ===")
	testStrings := make([]string, 20)
	for i := 0; i < 20; i++ {
		testStrings[i] = fmt.Sprintf("TEST%02d", i)
	}
	if err := client.WriteStringArray(ctx, cfg.PointArrayNode, testStrings); err != nil {
		t.Logf("WriteStringArray to whole array failed: %v", err)
	} else {
		t.Log("WriteStringArray SUCCESS")
		val, _ = client.ReadNode(ctx, cfg.PointArrayNode)
		t.Logf("PointArrayNode after write: %v", val)
	}

	// Try writing to individual array elements (ns=4;i=94 to ns=4;i=113)
	t.Log("\n=== Testing Individual Element Write ===")
	elementID := "ns=4;i=94" // First element [0]
	t.Logf("Writing to element %s...", elementID)
	if err := client.WriteString(ctx, elementID, "ELEMENT_0"); err != nil {
		t.Logf("WriteString to element failed: %v", err)
	} else {
		t.Log("WriteString to element SUCCESS")
		val, _ = client.ReadNode(ctx, elementID)
		t.Logf("Element after write: %v", val)
	}

	// Read full array to see if element write worked
	val, _ = client.ReadNode(ctx, cfg.PointArrayNode)
	t.Logf("Full array after element write: %v", val)
}

// TestBrowseNodes_RealPLC browses PLC nodes to find correct IDs
func TestBrowseNodes_RealPLC(t *testing.T) {
	configMgr := NewConfigManager(getConfigPath())
	cfg := configMgr.Get()

	client := NewClient(configMgr)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Failed to connect: %v", err)
	}
	defer client.Disconnect(context.Background())

	// Try to read PointArrayNode
	t.Logf("Testing PointArrayNode: %s", cfg.PointArrayNode)
	val, err := client.ReadNode(ctx, cfg.PointArrayNode)
	if err != nil {
		t.Logf("PointArrayNode read failed: %v", err)
	} else {
		t.Logf("PointArrayNode value type: %T, value: %v", val, val)
	}

	// Try to read TriggerWriteNode
	t.Logf("Testing TriggerWriteNode: %s", cfg.TriggerWriteNode)
	val, err = client.ReadNode(ctx, cfg.TriggerWriteNode)
	if err != nil {
		t.Logf("TriggerWriteNode read failed: %v", err)
	} else {
		t.Logf("TriggerWriteNode value type: %T, value: %v", val, val)
	}

	// Try to read ReadDoneNode
	t.Logf("Testing ReadDoneNode: %s", cfg.ReadDoneNode)
	val, err = client.ReadNode(ctx, cfg.ReadDoneNode)
	if err != nil {
		t.Logf("ReadDoneNode read failed: %v", err)
	} else {
		t.Logf("ReadDoneNode value type: %T, value: %v", val, val)
	}

	// Try to read EndOfFileNode
	t.Logf("Testing EndOfFileNode: %s", cfg.EndOfFileNode)
	val, err = client.ReadNode(ctx, cfg.EndOfFileNode)
	if err != nil {
		t.Logf("EndOfFileNode read failed: %v", err)
	} else {
		t.Logf("EndOfFileNode value type: %T, value: %v", val, val)
	}

	// Try position nodes
	t.Logf("Testing PositionXNode: %s", cfg.PositionXNode)
	val, err = client.ReadNode(ctx, cfg.PositionXNode)
	if err != nil {
		t.Logf("PositionXNode read failed: %v", err)
	} else {
		t.Logf("PositionXNode value type: %T, value: %v", val, val)
	}
}

// TestDiscoverNodes_RealPLC discovers available nodes in PLC
func TestDiscoverNodes_RealPLC(t *testing.T) {
	configMgr := NewConfigManager(getConfigPath())

	client := NewClient(configMgr)
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Failed to connect: %v", err)
	}
	defer client.Disconnect(context.Background())

	t.Log("Browsing OPC UA server nodes...")

	// Browse from Objects folder (i=85) which contains application-specific nodes
	browseNodes := []string{
		"i=85",        // Objects folder
		"ns=4;i=1",    // Namespace 4 root (Db_Punti)
		"ns=4;i=79",   // Pos node
		"ns=4;i=93",   // PointArr node
	}

	for _, nodeID := range browseNodes {
		t.Logf("\n=== Browsing from %s ===", nodeID)
		children, err := client.BrowseNode(ctx, nodeID)
		if err != nil {
			t.Logf("Browse %s failed: %v", nodeID, err)
			continue
		}
		for _, child := range children {
			t.Logf("  Node: %s (ID: %s)", child.DisplayName, child.NodeID)
		}
	}
}

// TestWriteStringArray_RealPLC tests string array write
func TestWriteStringArray_RealPLC(t *testing.T) {
	configMgr := NewConfigManager(getConfigPath())
	cfg := configMgr.Get()

	client := NewClient(configMgr)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Failed to connect: %v", err)
	}
	defer client.Disconnect(context.Background())

	// Create test array of 20 strings
	testArray := make([]string, cfg.ChunkSize)
	for i := 0; i < cfg.ChunkSize; i++ {
		testArray[i] = fmt.Sprintf("TEST_%02d", i)
	}

	t.Logf("Writing %d strings to PointArrayNode (%s)...", len(testArray), cfg.PointArrayNode)
	if err := client.WriteStringArray(ctx, cfg.PointArrayNode, testArray); err != nil {
		t.Fatalf("WriteStringArray failed: %v", err)
	}

	t.Log("String array write test passed")
}
