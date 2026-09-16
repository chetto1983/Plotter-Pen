package opcua

import "context"

// OPCUAClient defines the interface for OPC UA client operations
// Used by handlers and enables mock implementations for testing
type OPCUAClient interface {
	// Connection management
	Connect(ctx context.Context) error
	Disconnect(ctx context.Context) error
	IsConnected() bool

	// Data operations
	SendWithTrigger(ctx context.Context, data any, cfg Config) error

	// Variables the server interfaces expose, for the settings window
	Variables(ctx context.Context) ([]NodeVariable, error)

	// Position and status
	ReadPosition(ctx context.Context) (Position, error)
	GetMachineStatus(ctx context.Context) MachineStatus
	StopPositionPolling()
	StartPositionPolling(ctx context.Context)
}

// Ensure Client implements OPCUAClient interface
var _ OPCUAClient = (*Client)(nil)
