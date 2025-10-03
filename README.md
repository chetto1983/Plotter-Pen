# Plotter Pen OPC UA

Lightweight Express application and web UI for pushing pen plotter programs to an OPC UA server. The server accepts plain text or per-line commands and can optionally toggle a trigger node once the payload is written.

## Prerequisites
- Node.js 18 or newer (ESM support is required).
- Access to the target OPC UA endpoint and credentials if security is enabled.

## Installation
1. Install dependencies:
   ```bash
   npm install
   ```
2. Adjust the OPC UA connection settings as described below.

## Configuration
Edit `opcua_config.json` to match your environment. All fields are optional except `endpoint` and `nodeId`.

- `endpoint`: OPC UA endpoint URL, for example `opc.tcp://192.168.0.1:4840`.
- `nodeId`: Node that receives the payload (string or array value depending on `valueType`).
- `username` / `password`: Credentials when the server requires user authentication.
- `triggerNodeId`: Optional node toggled after the payload write completes.
- `triggerValue`: Value written to `triggerNodeId` immediately after the payload is sent (default `true`).
- `triggerResetValue`: Value written back to `triggerNodeId` after the delay (default `false`).
- `triggerResetDelayMs`: Delay in milliseconds before writing `triggerResetValue` (default `250`).
- `valueType`: Primary payload type. Use `string_array` to send one command per array element or `string` to send a single block (defaults to `string`).
- `arrayLength`: Optional maximum number of array entries to send when `valueType` is an array type.

You can override any of these at runtime with environment variables (for example `OPCUA_ENDPOINT`, `OPCUA_NODE_ID`, `OPCUA_TRIGGER_NODE_ID`, `OPCUA_VALUE_TYPE`, `OPCUA_ARRAY_LENGTH`, etc.) or per-request overrides when calling the REST endpoint.

## Running the server
```bash
npm start
```
The server scans for a free port starting at `8000`, serves static files from the project directory, and attempts to open `plotter_pen.html` in your default browser. If the browser does not open automatically, visit `http://127.0.0.1:<port>/plotter_pen.html` manually.

## Run with Docker
1. Build the image:
   ```bash
   docker build -t plotter-pen .
   ```
2. Start the container, overriding any settings you need:
   ```bash
   docker run --rm -it \
     -p 8000:8000 \
     -e OPCUA_ENDPOINT=opc.tcp://192.168.0.1:4840 \
     -e OPCUA_NODE_ID=ns=4;i=12 \
     -v "${PWD}/opcua_config.json:/app/opcua_config.json:ro" \
     plotter-pen
   ```

The container exposes port `8000` and honours the same environment variables used by `opcua_config.json`. Mounting the config file is optional; environment variables take precedence.

## Docker Compose
1. Create or update a `.env` file with any overrides (for example `OPCUA_ENDPOINT`, `OPCUA_NODE_ID`, `PLOTTER_PORT`).
2. Launch the stack:
   ```bash
   docker compose up --build
   ```
3. Open the web UI at `http://127.0.0.1:8000/plotter_pen.html`.

The compose service builds this repository, publishes port `8000`, and mounts `opcua_config.json` inside the container so you can edit it locally.

## Using the web UI
1. Load `plotter_pen.html` in your browser.
2. Enter the G-code or pen plotter commands in the editor.
3. Click the send button to push the program to the configured OPC UA node. The UI displays confirmation and any truncation or padding applied to match the OPC UA array length.

## REST API
The server exposes a JSON endpoint for automation: `POST /api/opcua/send`.

Example request:
```bash
curl -X POST http://127.0.0.1:8000/api/opcua/send \
  -H "Content-Type: application/json" \
  -d '{
        "commands": ["G0 X0 Y0", "G1 X10 Y10"],
        "overrides": {
          "endpoint": "opc.tcp://192.168.0.1:4840",
          "nodeId": "ns=4;i=12"
        }
      }'
```
- Provide either a single `text` string or a `commands` array.
- Use the optional `overrides` object to supply connection details without modifying the config file.
- The response reports any truncation or padding, the resolved node IDs, and trigger results.

## Troubleshooting
- `BadNodeId` or `BadOutOfRange` errors indicate incorrect node IDs or mismatched array sizes. Confirm the target variable type and length in your OPC UA server.
- If the server cannot find a free port starting at `8000`, stop any conflicting processes or set the `PORT` environment variable before running `npm start`.

## Development
- Static assets (`plotter_pen.html`, `style.css`) live alongside `server.js`; updates are served without rebuilding.
- The project uses ES modules. When adding new files, prefer `import`/`export` syntax.
- Restart `npm start` after changing server-side code to pick up the latest changes.

