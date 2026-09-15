package opcua

import (
	"context"
	"errors"
)

// MockClient is a mock implementation of OPCUAClient for testing
type MockClient struct {
	connected       bool
	connectError    error
	disconnectError error
	sendError       error
	position        Position
	positionError   error
	machineStatus   MachineStatus
}

// NewMockClient creates a new mock client
func NewMockClient() *MockClient {
	return &MockClient{
		connected: false,
		machineStatus: MachineStatus{
			Connected: false,
		},
	}
}

// SetConnectError configures the mock to return an error on Connect
func (m *MockClient) SetConnectError(err error) {
	m.connectError = err
}

// SetDisconnectError configures the mock to return an error on Disconnect
func (m *MockClient) SetDisconnectError(err error) {
	m.disconnectError = err
}

// SetSendError configures the mock to return an error on SendWithTrigger
func (m *MockClient) SetSendError(err error) {
	m.sendError = err
}

// SetPosition configures the mock position
func (m *MockClient) SetPosition(pos Position, err error) {
	m.position = pos
	m.positionError = err
}

// SetConnected configures the mock connection status
func (m *MockClient) SetConnected(connected bool) {
	m.connected = connected
	m.machineStatus.Connected = connected
}

// SetMachineStatus configures the mock machine status
func (m *MockClient) SetMachineStatus(status MachineStatus) {
	m.machineStatus = status
}

// Connect implements OPCUAClient
func (m *MockClient) Connect(ctx context.Context) error {
	if m.connectError != nil {
		return m.connectError
	}
	m.connected = true
	m.machineStatus.Connected = true
	return nil
}

// Disconnect implements OPCUAClient
func (m *MockClient) Disconnect(ctx context.Context) error {
	if m.disconnectError != nil {
		return m.disconnectError
	}
	m.connected = false
	m.machineStatus.Connected = false
	return nil
}

// IsConnected implements OPCUAClient
func (m *MockClient) IsConnected() bool {
	return m.connected
}

// SendWithTrigger implements OPCUAClient
func (m *MockClient) SendWithTrigger(ctx context.Context, data any, cfg Config) error {
	if !m.connected {
		return errors.New("not connected")
	}
	return m.sendError
}

// ReadPosition implements OPCUAClient
func (m *MockClient) ReadPosition(ctx context.Context) (Position, error) {
	if !m.connected {
		return Position{}, errors.New("not connected")
	}
	return m.position, m.positionError
}

// GetMachineStatus implements OPCUAClient
func (m *MockClient) GetMachineStatus(ctx context.Context) MachineStatus {
	m.machineStatus.Connected = m.connected
	return m.machineStatus
}

// StopPositionPolling implements OPCUAClient
func (m *MockClient) StopPositionPolling() {
	// No-op for mock
}

// StartPositionPolling implements OPCUAClient
func (m *MockClient) StartPositionPolling(ctx context.Context) {
	// No-op for mock
}

// Ensure MockClient implements OPCUAClient
var _ OPCUAClient = (*MockClient)(nil)
