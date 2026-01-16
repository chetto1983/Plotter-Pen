# OPC UA Chunked Transfer Protocol Design

## Overview

Replace the current 512-string single-shot transfer with a chunked protocol using 21-string blocks and PLC handshaking.

## PLC Interface (Siemens S7-1500)

| Node | Type | NodeID | Purpose |
|------|------|--------|---------|
| `PointArr` | STRING[21] | `ns=2;i=45` | Data array (0-20) |
| `TriggerWrite` | BOOL | `ns=2;i=12` | PC → PLC: "Data ready" |
| `Trirrer_Read_Dn` | BOOL | `ns=2;i=23` | PLC → PC: "Chunk processed" |
| `End_Of_File` | BOOL | `ns=2;i=34` | PC → PLC: "Transfer complete" |

## Protocol (Rising Edge)

```
┌─────────────────────────────────────────────────────────────┐
│  PC (Go Backend)              PLC (S7-1500)                 │
├─────────────────────────────────────────────────────────────┤
│  1. Write chunk[0..20] ───────► PointArr[0..20]             │
│  2. TriggerWrite = TRUE ──────► (rising edge detected)      │
│                                      │                      │
│                                      ▼                      │
│                                 Process chunk               │
│                                      │                      │
│  3. Poll every 100ms ◄────────  Trirrer_Read_Dn = TRUE      │
│  4. TriggerWrite = FALSE ─────► (reset for next cycle)      │
│                                                             │
│  [More data?] ──► YES: goto 1                               │
│                  NO:  End_Of_File = TRUE ──► Job complete   │
└─────────────────────────────────────────────────────────────┘
```

## Parameters

| Parameter | Value | Notes |
|-----------|-------|-------|
| Chunk size | 21 strings | Fixed by PLC array size |
| Ack timeout | 5 seconds | Per-chunk timeout |
| Poll interval | 100ms | Check Trirrer_Read_Dn |

## Async Architecture

- Transfer runs in background goroutine
- Progress reported via WebSocket
- Cancellable via stop channel

## WebSocket Messages

| Type | Direction | Data |
|------|-----------|------|
| `transfer_start` | S→C | `{totalChunks, totalLines}` |
| `transfer_progress` | S→C | `{chunk, total, percent}` |
| `transfer_complete` | S→C | `{success, chunks, duration}` |
| `transfer_error` | S→C | `{error, chunk}` |

## Files to Modify

| File | Changes |
|------|---------|
| `internal/service/opcua/config.go` | Add node IDs |
| `internal/service/opcua/transfer.go` | New chunked transfer service |
| `internal/service/opcua/client.go` | Add WriteStringArray, WriteBool |
| `internal/handler/opcua_ws.go` | Handle transfer commands |

## Config Additions

```json
{
  "pointArrayNode": "ns=2;i=45",
  "triggerWriteNode": "ns=2;i=12",
  "readDoneNode": "ns=2;i=23",
  "endOfFileNode": "ns=2;i=34",
  "chunkSize": 21,
  "ackTimeout": 5000,
  "pollInterval": 100
}
```
