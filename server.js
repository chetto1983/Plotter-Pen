import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import { dxfParseHandler } from "./routes/dxf-parser.js";
import { smartImportRouter } from "./routes/import-dxf.js";
import { persistenceRouter } from "./routes/persistence.js";
import { exportDxfRouter } from "./routes/export-dxf.js";
import { camRouter } from "./routes/cam.js";

import { findAvailablePort, openBrowser, coalesce, toInt } from "./server/utils/system.js";
import {
  loadFileConfig,
  normalizeOpcuaConfigPayload,
  sendProgramViaOpcua,
  OpcUaConfigurationError,
  OpcUaConfigValidationError,
  isOpcuaTimeoutError
} from "./server/services/opcua.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = __dirname;
const CONFIG_PATH = path.join(ROOT_DIR, "opcua_config.json");
const TARGET_PAGE = "plotter_pen.html";
const HOST = coalesce(process.env.HOST, process.env.BIND_HOST) ?? "127.0.0.1";
const API_TOKEN = coalesce(process.env.API_TOKEN, process.env.API_KEY);
const DEFAULT_PORT = (() => {
  const envPort = toInt(process.env.PORT);
  return envPort && envPort > 0 && envPort < 65536 ? envPort : 8000;
})();
const MAX_JSON_SIZE = 50_000_000;
const BROWSER_OPEN_DELAY_MS = 400;

async function start() {
  const app = express();

  app.use(express.json({ limit: MAX_JSON_SIZE }));
  app.use(express.static(ROOT_DIR, { index: TARGET_PAGE }));

  if (API_TOKEN) {
    app.use("/api", (req, res, next) => {
      const authHeader = req.get("authorization");
      const apiKeyHeader = req.get("x-api-key");
      const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
      const token = apiKeyHeader || bearer;

      if (token !== API_TOKEN) {
        return res.status(401).json({ status: "error", message: "Unauthorized" });
      }

      next();
    });
  }

  // === OPC UA CONFIGURATION ===
  app.get("/api/opcua/config", async (req, res) => {
    try {
      const stored = await loadFileConfig(CONFIG_PATH);
      res.json({ status: "ok", data: stored }); // Helper returns parsed config
    } catch (error) {
      console.error("Errore lettura config:", error);
      res.status(500).json({ status: "error", message: "Impossibile leggere la configurazione." });
    }
  });

  app.put("/api/opcua/config", async (req, res) => {
    try {
      const stored = await loadFileConfig(CONFIG_PATH);
      const updated = normalizeOpcuaConfigPayload(req.body ?? {}, stored);
      const serialized = `${JSON.stringify(updated, null, 4)}\n`;
      await fs.writeFile(CONFIG_PATH, serialized, "utf8");
      res.json({ status: "ok", data: updated });
    } catch (error) {
      if (error instanceof OpcUaConfigValidationError) {
        return res.status(400).json({ status: "error", message: error.message });
      }
      console.error("Errore salvataggio config:", error);
      res.status(500).json({ status: "error", message: "Impossibile salvare la configurazione." });
    }
  });

  // === OPC UA SEND ===
  app.post("/api/opcua/send", async (req, res) => {
    try {
      const body = req.body ?? {};
      const commands = Array.isArray(body.commands) ? body.commands.map(String) : undefined;
      let text = typeof body.text === "string" ? body.text : undefined;

      if (!text) {
        if (commands && commands.length > 0) text = commands.join("\n");
        else return res.status(400).json({ status: "error", message: "Payload must include 'text' or 'commands'." });
      }

      const result = await sendProgramViaOpcua(CONFIG_PATH, {
        text,
        commands,
        overrides: body.overrides
      });

      res.json({ status: "ok", details: result });
    } catch (error) {
      if (error instanceof OpcUaConfigurationError) {
        return res.status(400).json({ status: "error", message: error.message });
      }
      if (isOpcuaTimeoutError(error)) {
        console.error("OPC UA timeout:", error);
        return res.status(504).json({ status: "error", message: "Timeout while communicating with OPC UA server." });
      }

      const msg = error?.message ?? "Unexpected error";
      if (msg.includes("BadNodeId")) return res.status(400).json({ status: "error", message: `${msg} (check nodeId).` });
      if (msg.includes("BadOutOfRange")) return res.status(400).json({ status: "error", message: `${msg} (verify array length).` });

      console.error("Unexpected OPC UA error:", error);
      res.status(500).json({ status: "error", message: msg });
    }
  });

  // ========== ROUTES ==========
  app.post("/api/parse-dxf", express.text({ limit: '10mb', type: '*/*' }), dxfParseHandler);
  app.use("/api", smartImportRouter);
  app.use("/api", persistenceRouter);
  app.use("/api", exportDxfRouter);
  app.use("/api", camRouter);

  // ========== SERVER START ==========
  const port = await findAvailablePort(DEFAULT_PORT);
  const server = app.listen(port, HOST, () => {
    const urlHost = HOST === "0.0.0.0" ? "127.0.0.1" : HOST;
    const url = `http://${urlHost}:${port}/${TARGET_PAGE}`;
    console.log(`Serving ${ROOT_DIR} on ${HOST}:${port}`);
    console.log(`Opening ${url} ...`);
    setTimeout(() => {
      if (!openBrowser(url)) console.log("Please open the URL manually.");
    }, BROWSER_OPEN_DELAY_MS);
  });

  const handleShutdown = () => {
    console.log("\nStopping server...");
    server.close(() => process.exit(0));
  };

  process.on("SIGINT", handleShutdown);
  process.on("SIGTERM", handleShutdown);
}

start().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});

