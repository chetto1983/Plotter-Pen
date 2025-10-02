import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import express from "express";
import opcua from "node-opcua-client";

const {
  OPCUAClient,
  DataType,
  VariantArrayType,
  StatusCodes,
  Variant,
  AttributeIds,
  coerceNodeId,
} = opcua;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = __dirname;
const CONFIG_PATH = path.join(ROOT_DIR, "opcua_config.json");
const TARGET_PAGE = "plotter_pen.html";
const HOST = coalesce(process.env.HOST, process.env.BIND_HOST) ?? "127.0.0.1";
const DEFAULT_PORT = (() => {
  const envPort = toInt(process.env.PORT);
  return envPort && envPort > 0 && envPort < 65536 ? envPort : 8000;
})();
const MAX_JSON_SIZE = 1_000_000;
const BROWSER_OPEN_DELAY_MS = 400;
const STRING_ARRAY_TYPES = new Set(["lines", "string_array", "string[]", "list"]);

class OpcUaConfigurationError extends Error {}

async function loadFileConfig() {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf8");
    const sanitized = raw.trimStart();
    const parsed = JSON.parse(sanitized);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch (error) {
    if (!(error && error.code === "ENOENT")) {
      console.warn("Unable to read opcua_config.json:", error.message);
    }
  }
  return {};
}

function coalesce(...values) {
  for (const value of values) {
    if (value === undefined || value === null) {
      continue;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
      continue;
    }
    return value;
  }
  return undefined;
}

function toInt(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const number = Number.parseInt(value, 10);
  return Number.isNaN(number) ? undefined : number;
}

function toBool(value) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") {
      return true;
    }
    if (normalized === "false" || normalized === "0") {
      return false;
    }
  }
  return undefined;
}

async function buildSettings(overrides = {}) {
  const config = await loadFileConfig();
  const env = process.env;

  const endpoint = coalesce(
    overrides.endpoint,
    env.OPCUA_ENDPOINT,
    config.endpoint
  );
  const nodeId = coalesce(
    overrides.nodeId,
    overrides.node_id,
    env.OPCUA_NODE_ID,
    config.nodeId,
    config.node_id
  );

  if (!endpoint) {
    throw new OpcUaConfigurationError(
      "Missing OPC UA endpoint. Configure it in opcua_config.json, environment variables, or request overrides."
    );
  }
  if (!nodeId) {
    throw new OpcUaConfigurationError(
      "Missing OPC UA nodeId. Configure it in opcua_config.json, environment variables, or request overrides."
    );
  }

  const username = coalesce(
    overrides.username,
    env.OPCUA_USERNAME,
    config.username
  );
  const password = coalesce(
    overrides.password,
    env.OPCUA_PASSWORD,
    config.password
  );
  const triggerNodeId = coalesce(
    overrides.triggerNodeId,
    overrides.trigger_node_id,
    env.OPCUA_TRIGGER_NODE_ID,
    config.triggerNodeId,
    config.trigger_node_id
  );
  const triggerValue = coalesce(
    overrides.triggerValue,
    overrides.trigger_value,
    env.OPCUA_TRIGGER_VALUE !== undefined
      ? toBool(env.OPCUA_TRIGGER_VALUE)
      : undefined,
    config.triggerValue,
    config.trigger_value,
    true
  );
  const triggerResetValue = coalesce(
    overrides.triggerResetValue,
    overrides.trigger_reset_value,
    env.OPCUA_TRIGGER_RESET_VALUE !== undefined
      ? toBool(env.OPCUA_TRIGGER_RESET_VALUE)
      : undefined,
    config.triggerResetValue,
    config.trigger_reset_value,
    false
  );
  const triggerResetDelayMs =
    toInt(
      coalesce(
        overrides.triggerResetDelayMs,
        overrides.trigger_reset_delay_ms,
        env.OPCUA_TRIGGER_RESET_DELAY_MS,
        config.triggerResetDelayMs,
        config.trigger_reset_delay_ms,
        250
      )
    ) ?? 0;

  const valueTypeRaw = coalesce(
    overrides.valueType,
    overrides.value_type,
    env.OPCUA_VALUE_TYPE,
    config.valueType,
    config.value_type,
    "string"
  );
  const valueType = String(valueTypeRaw).toLowerCase();

  const arrayLength =
    toInt(
      coalesce(
        overrides.arrayLength,
        overrides.array_length,
        env.OPCUA_ARRAY_LENGTH,
        config.arrayLength,
        config.array_length
      )
    ) ?? undefined;

  return {
    endpoint,
    nodeId,
    username: username !== undefined ? String(username) : undefined,
    password: password !== undefined ? String(password) : undefined,
    triggerNodeId,
    triggerValue: triggerValue !== undefined ? triggerValue : true,
    triggerResetValue: triggerResetValue !== undefined ? triggerResetValue : false,
    triggerResetDelayMs,
    valueType,
    arrayLength,
  };
}

function normalizeCommandList(commands) {
  if (!Array.isArray(commands)) {
    return undefined;
  }
  return commands.map((item) =>
    item === undefined || item === null ? "" : String(item)
  );
}

function preparePayload(settings, text, commands) {
  const normalizedType = settings.valueType;
  let effectiveCommands = normalizeCommandList(commands);
  let truncated = false;
  let padded = false;
  const desiredLength =
    typeof settings.arrayLength === "number" && settings.arrayLength > 0
      ? settings.arrayLength
      : undefined;

  if (STRING_ARRAY_TYPES.has(normalizedType)) {
    if (!effectiveCommands || effectiveCommands.length === 0) {
      if (typeof text === "string" && text.length > 0) {
        effectiveCommands = text.split(/\r?\n/);
      } else if (text != null) {
        effectiveCommands = [String(text)];
      } else {
        effectiveCommands = [""];
      }
    }

    if (
      typeof desiredLength === "number" &&
      effectiveCommands.length > desiredLength
    ) {
      effectiveCommands = effectiveCommands.slice(0, desiredLength);
      truncated = true;
    }

    return {
      payload: effectiveCommands,
      effectiveCommands,
      truncated,
      padded,
      desiredLength,
    };
  }

  return {
    payload: text,
    effectiveCommands,
    truncated,
    padded,
    desiredLength: undefined,
  };
}

function buildVariant(value, valueType) {
  const type = (valueType || "auto").toLowerCase();

  switch (type) {
    case "string":
    case "str":
      return new Variant({
        dataType: DataType.String,
        value: value == null ? "" : String(value),
      });
    case "lines":
    case "string_array":
    case "string[]":
    case "list": {
      const source = Array.isArray(value) ? value : [value];
      const normalized = source.map((entry) =>
        entry == null ? "" : String(entry)
      );
      return new Variant({
        dataType: DataType.String,
        arrayType: VariantArrayType.Array,
        value: normalized,
      });
    }
    case "int":
    case "int32":
    case "i32": {
      const intValue = Number.parseInt(value, 10);
      if (Number.isNaN(intValue)) {
        throw new Error("Cannot convert value to Int32.");
      }
      return new Variant({
        dataType: DataType.Int32,
        value: intValue,
      });
    }
    case "double":
    case "float":
    case "number": {
      const numValue = Number(value);
      if (Number.isNaN(numValue)) {
        throw new Error("Cannot convert value to Double.");
      }
      return new Variant({
        dataType: DataType.Double,
        value: numValue,
      });
    }
    case "bool":
    case "boolean": {
      const boolValue = toBool(value);
      if (boolValue === undefined) {
        throw new Error("Cannot convert value to Boolean.");
      }
      return new Variant({
        dataType: DataType.Boolean,
        value: boolValue,
      });
    }
    default: {
      if (Array.isArray(value)) {
        const normalized = value.map((entry) =>
          entry == null ? "" : String(entry)
        );
        return new Variant({
          dataType: DataType.String,
          arrayType: VariantArrayType.Array,
          value: normalized,
        });
      }
      if (typeof value === "boolean") {
        return new Variant({
          dataType: DataType.Boolean,
          value,
        });
      }
      if (typeof value === "number") {
        if (Number.isInteger(value)) {
          return new Variant({
            dataType: DataType.Int32,
            value,
          });
        }
        return new Variant({
          dataType: DataType.Double,
          value,
        });
      }
      if (typeof value === "string") {
        return new Variant({
          dataType: DataType.String,
          value,
        });
      }
      return new Variant({
        dataType: DataType.String,
        value: value == null ? "" : String(value),
      });
    }
  }
}

function statusIsGood(statusCode) {
  return (
    statusCode &&
    statusCode.value !== undefined &&
    statusCode.value === StatusCodes.Good.value
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendProgramViaOpcua({ text, commands, overrides }) {
  const settings = await buildSettings(overrides);
  const { payload, effectiveCommands, truncated, padded, desiredLength } =
    preparePayload(settings, text, commands);

  let truncatedResult = truncated;
  let paddedResult = padded;
  let commandCount = Array.isArray(effectiveCommands)
    ? effectiveCommands.length
    : null;
  let reportedArrayLength =
    typeof desiredLength === "number" ? desiredLength : null;

  let mainNodeId;
  try {
    mainNodeId = coerceNodeId(settings.nodeId);
  } catch (error) {
    throw new OpcUaConfigurationError(
      `Invalid nodeId "${settings.nodeId}": ${error?.message ?? error}`
    );
  }

  let triggerNodeId;
  if (settings.triggerNodeId) {
    try {
      triggerNodeId = coerceNodeId(settings.triggerNodeId);
    } catch (error) {
      throw new OpcUaConfigurationError(
        `Invalid triggerNodeId "${settings.triggerNodeId}": ${error?.message ?? error}`
      );
    }
  }

  const client = OPCUAClient.create({});
  let session;

  try {
    await client.connect(settings.endpoint);

    if (settings.username) {
      session = await client.createSession({
        type: "userName",
        userName: settings.username,
        password: settings.password ?? "",
      });
    } else {
      session = await client.createSession();
    }

    let targetLines;

    if (STRING_ARRAY_TYPES.has(settings.valueType)) {
      targetLines = Array.isArray(payload)
        ? [...payload]
        : [payload == null ? "" : String(payload)];

      let capacity = desiredLength;
      let currentArrayLength;

      try {
        const dataValue = await session.read({
          nodeId: mainNodeId,
          attributeId: AttributeIds.Value,
        });
        if (statusIsGood(dataValue.statusCode)) {
          const value = dataValue.value?.value;
          if (Array.isArray(value)) {
            currentArrayLength = value.length;
          }
        }
      } catch (readError) {
        console.warn("Unable to read existing array length:", readError);
      }

      if (typeof currentArrayLength === "number") {
        capacity =
          typeof capacity === "number"
            ? Math.min(capacity, currentArrayLength)
            : currentArrayLength;
      }

      if (typeof capacity === "number") {
        if (targetLines.length > capacity) {
          targetLines = targetLines.slice(0, capacity);
          truncatedResult = true;
        } else if (targetLines.length < capacity) {
          targetLines = targetLines.concat(
            Array(capacity - targetLines.length).fill("")
          );
          paddedResult = true;
        }
        reportedArrayLength = capacity;
      }

      if (targetLines.length === 0) {
        targetLines = [""];
      }

      commandCount = targetLines.length;

      const arrayVariant = new Variant({
        dataType: DataType.String,
        arrayType: VariantArrayType.Array,
        value: targetLines,
      });

      const mainStatus = await session.writeSingleNode(
        mainNodeId,
        arrayVariant
      );

      if (!statusIsGood(mainStatus)) {
        throw new Error(
          `OPC UA write failed: ${
            mainStatus ? mainStatus.toString() : "unknown status"
          }`
        );
      }
    } else {
      const mainStatus = await session.writeSingleNode(
        mainNodeId,
        buildVariant(payload, settings.valueType)
      );

      if (!statusIsGood(mainStatus)) {
        throw new Error(
          `OPC UA write failed: ${
            mainStatus ? mainStatus.toString() : "unknown status"
          }`
        );
      }
    }

    let triggered = false;
    if (triggerNodeId) {
      const triggerStatus = await session.writeSingleNode(
        triggerNodeId,
        buildVariant(settings.triggerValue, "auto")
      );
      if (!statusIsGood(triggerStatus)) {
        throw new Error(
          `Failed to write trigger node: ${
            triggerStatus ? triggerStatus.toString() : "unknown status"
          }`
        );
      }
      triggered = true;
      if (settings.triggerResetDelayMs > 0) {
        await sleep(settings.triggerResetDelayMs);
        const resetStatus = await session.writeSingleNode(
          triggerNodeId,
          buildVariant(settings.triggerResetValue, "auto")
        );
        if (!statusIsGood(resetStatus)) {
          console.warn(
            "Failed to reset trigger node:",
            resetStatus ? resetStatus.toString() : "unknown status"
          );
        }
      }
    }

    return {
      endpoint: settings.endpoint,
      node_id: settings.nodeId,
      value_type: settings.valueType,
      commands: commandCount,
      array_length: reportedArrayLength,
      padded: paddedResult,
      truncated: truncatedResult,
      triggered,
    };
  } finally {
    if (session) {
      await session.close().catch(() => {});
    }
    await client.disconnect().catch(() => {});
  }
}

function normalizeOverrides(overrides) {
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    return undefined;
  }
  return overrides;
}

async function findAvailablePort(start = DEFAULT_PORT) {
  let port = start;
  const limit = start + 50;
  while (port <= limit) {
    try {
      await checkPort(port);
      return port;
    } catch (error) {
      port += 1;
      if (port > limit) {
        throw new Error("Unable to find a free port for the web server.");
      }
    }
  }
  throw new Error("Unable to find a free port for the web server.");
}

function checkPort(port) {
  return new Promise((resolve, reject) => {
    const tester = net.createServer()
      .once("error", (error) => {
        tester.close();
        reject(error);
      })
      .once("listening", () => {
        tester
          .once("close", resolve)
          .close();
      })
      .listen(port, HOST);
  });
}

function openBrowser(url) {
  const platform = process.platform;

  if (
    toBool(process.env.DISABLE_AUTO_BROWSER) === true ||
    toBool(process.env.NO_AUTO_BROWSER) === true
  ) {
    return false;
  }

  if (platform === "linux" && !process.env.DISPLAY) {
    return false;
  }

  let command;
  let args;

  if (platform === "win32") {
    command = "cmd";
    args = ["/c", "start", "", url];
  } else if (platform === "darwin") {
    command = "open";
    args = [url];
  } else {
    command = "xdg-open";
    args = [url];
  }

  try {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
    });
    child.once("error", (error) => {
      console.warn("Could not open browser automatically:", error.message);
      console.log("Please open the URL manually if it did not open automatically.");
    });
    child.unref();
    return true;
  } catch (error) {
    console.warn("Could not open browser automatically:", error.message);
    return false;
  }
}

async function start() {
  const app = express();

  app.use(
    express.json({
      limit: MAX_JSON_SIZE,
    })
  );
  app.use(express.static(ROOT_DIR));

  app.post("/api/opcua/send", async (req, res) => {
    try {
      const body = req.body ?? {};
      const commands = Array.isArray(body.commands)
        ? body.commands.map((item) => String(item))
        : undefined;
      let text = typeof body.text === "string" ? body.text : undefined;

      if (!text) {
        if (commands && commands.length > 0) {
          text = commands.join("\n");
        } else {
          res.status(400).json({
            status: "error",
            message: "Payload must include 'text' or 'commands'.",
          });
          return;
        }
      }

      const result = await sendProgramViaOpcua({
        text,
        commands,
        overrides: normalizeOverrides(body.overrides),
      });

      res.json({
        status: "ok",
        details: result,
      });
    } catch (error) {
      if (error instanceof OpcUaConfigurationError) {
        res.status(400).json({
          status: "error",
          message: error.message,
        });
        return;
      }
      const message = error?.message ?? "Unexpected OPC UA error.";
      if (typeof message === "string") {
        if (message.includes("BadNodeId")) {
          console.error("OPC UA node lookup failed:", message);
          res.status(400).json({
            status: "error",
            message: `${message} (check nodeId / namespace configuration).`,
          });
          return;
        }
        if (message.includes("BadOutOfRange")) {
          console.error("OPC UA array write failed:", message);
          res.status(400).json({
            status: "error",
            message: `${message} (verify target array length and command count).`,
          });
          return;
        }
        if (message.includes("BadIndexRange")) {
          console.error("OPC UA index range error:", message);
          res.status(400).json({
            status: "error",
            message: `${message} (server may not support per-element writes; array written as whole value).`,
          });
          return;
        }
      }
      console.error("Unexpected OPC UA error:", error);
      res.status(500).json({
        status: "error",
        message,
      });
    }
  });

  const port = await findAvailablePort(DEFAULT_PORT);
  const server = app.listen(port, HOST, () => {
    const urlHost = HOST === "0.0.0.0" ? "127.0.0.1" : HOST;
    const url = `http://${urlHost}:${port}/${TARGET_PAGE}`;
    console.log(`Serving ${ROOT_DIR} on ${HOST}:${port}`);
    console.log(`Opening ${url} ...`);
    setTimeout(() => {
      if (!openBrowser(url)) {
        console.log("Please open the URL manually if it did not open automatically.");
      }
    }, BROWSER_OPEN_DELAY_MS);
  });

  const handleShutdown = () => {
    console.log("\nStopping server...");
    server.close(() => {
      process.exit(0);
    });
  };

  process.on("SIGINT", handleShutdown);
  process.on("SIGTERM", handleShutdown);
}

start().catch((error) => {
  console.error("Failed to start OPC UA web server:", error);
  process.exit(1);
});

