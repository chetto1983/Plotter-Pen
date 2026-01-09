import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import express from "express";
import opcua from "node-opcua-client";
import { dxfParseHandler } from "./routes/dxf-parser.js";
import { smartImportRouter } from "./routes/import-dxf.js";
import { persistenceRouter } from "./routes/persistence.js";

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
const MAX_JSON_SIZE = 50_000_000;
const BROWSER_OPEN_DELAY_MS = 400;
const STRING_ARRAY_TYPES = new Set(["lines", "string_array", "string[]", "list"]);
const OPCUA_OPERATION_TIMEOUT_MS = 15_000;
const DEFAULT_OPCUA_CONFIG = {
  endpoint: "",
  nodeId: "",
  username: "",
  password: "",
  triggerNodeId: "",
  triggerValue: false,
  triggerResetValue: false,
  triggerResetDelayMs: 0,
  valueType: "string_array",
  arrayLength: 0,
};

class OpcUaConfigurationError extends Error { }
class OpcUaConfigValidationError extends Error { }

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

function toTrimmedString(value, { allowEmpty = false } = {}) {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!allowEmpty && trimmed.length === 0) {
    return undefined;
  }
  return trimmed;
}

function withDefaultOpcuaConfig(config = {}) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return { ...DEFAULT_OPCUA_CONFIG };
  }
  const result = { ...DEFAULT_OPCUA_CONFIG, ...config };
  result.triggerValue = typeof result.triggerValue === "boolean" ? result.triggerValue : DEFAULT_OPCUA_CONFIG.triggerValue;
  result.triggerResetValue =
    typeof result.triggerResetValue === "boolean"
      ? result.triggerResetValue
      : DEFAULT_OPCUA_CONFIG.triggerResetValue;
  const delay = toInt(result.triggerResetDelayMs);
  result.triggerResetDelayMs = delay !== undefined && delay >= 0 ? delay : DEFAULT_OPCUA_CONFIG.triggerResetDelayMs;
  const arrayLength = toInt(result.arrayLength);
  result.arrayLength = arrayLength !== undefined && arrayLength >= 0 ? arrayLength : DEFAULT_OPCUA_CONFIG.arrayLength;
  if (typeof result.valueType !== "string" || result.valueType.trim() === "") {
    result.valueType = DEFAULT_OPCUA_CONFIG.valueType;
  }
  if (typeof result.username !== "string") {
    result.username = DEFAULT_OPCUA_CONFIG.username;
  }
  if (typeof result.password !== "string") {
    result.password = DEFAULT_OPCUA_CONFIG.password;
  }
  if (typeof result.triggerNodeId !== "string") {
    result.triggerNodeId = DEFAULT_OPCUA_CONFIG.triggerNodeId;
  }
  if (typeof result.endpoint !== "string") {
    result.endpoint = DEFAULT_OPCUA_CONFIG.endpoint;
  }
  if (typeof result.nodeId !== "string") {
    result.nodeId = DEFAULT_OPCUA_CONFIG.nodeId;
  }
  return result;
}

function normalizeOpcuaConfigPayload(payload, current = DEFAULT_OPCUA_CONFIG) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new OpcUaConfigValidationError("Configurazione non valida: payload mancante o di tipo errato.");
  }
  const base = withDefaultOpcuaConfig(current);

  const endpoint = coalesce(payload.endpoint);
  if (!endpoint) {
    throw new OpcUaConfigValidationError("Il campo 'endpoint' e' obbligatorio.");
  }
  base.endpoint = endpoint;

  const nodeId = coalesce(payload.nodeId, payload.node_id);
  if (!nodeId) {
    throw new OpcUaConfigValidationError("Il campo 'nodeId' e' obbligatorio.");
  }
  base.nodeId = nodeId;

  const username = toTrimmedString(
    payload.username ?? base.username,
    { allowEmpty: true }
  );
  base.username = username ?? "";

  const password = toTrimmedString(
    payload.password ?? base.password,
    { allowEmpty: true }
  );
  base.password = password ?? "";

  const triggerNodeId = toTrimmedString(
    payload.triggerNodeId ?? payload.trigger_node_id ?? base.triggerNodeId,
    { allowEmpty: true }
  );
  base.triggerNodeId = triggerNodeId ?? "";

  const triggerValueRaw = payload.triggerValue ?? payload.trigger_value;
  if (triggerValueRaw !== undefined) {
    const triggerValue = toBool(triggerValueRaw);
    if (triggerValue === undefined) {
      throw new OpcUaConfigValidationError("Il campo 'triggerValue' deve essere booleano.");
    }
    base.triggerValue = triggerValue;
  }

  const triggerResetValueRaw = payload.triggerResetValue ?? payload.trigger_reset_value;
  if (triggerResetValueRaw !== undefined) {
    const triggerResetValue = toBool(triggerResetValueRaw);
    if (triggerResetValue === undefined) {
      throw new OpcUaConfigValidationError("Il campo 'triggerResetValue' deve essere booleano.");
    }
    base.triggerResetValue = triggerResetValue;
  }

  const delayRaw = payload.triggerResetDelayMs ?? payload.trigger_reset_delay_ms;
  if (delayRaw !== undefined) {
    const delay = toInt(delayRaw);
    if (delay === undefined || delay < 0) {
      throw new OpcUaConfigValidationError("Il campo 'triggerResetDelayMs' deve essere un intero maggiore o uguale a 0.");
    }
    base.triggerResetDelayMs = delay;
  }

  const valueType = coalesce(payload.valueType, payload.value_type);
  if (valueType) {
    base.valueType = valueType;
  } else if (!base.valueType) {
    base.valueType = DEFAULT_OPCUA_CONFIG.valueType;
  }

  const arrayLengthRaw = payload.arrayLength ?? payload.array_length;
  if (arrayLengthRaw !== undefined) {
    const arrayLength = toInt(arrayLengthRaw);
    if (arrayLength === undefined || arrayLength < 0) {
      throw new OpcUaConfigValidationError("Il campo 'arrayLength' deve essere un intero maggiore o uguale a 0.");
    }
    base.arrayLength = arrayLength;
  }

  return base;
}

async function buildSettings(overrides = {}) {
  const config = await loadFileConfig();
  const env = process.env;

  const resolve = (keys, envKeys, defaultVal, transform = (v) => v) => {
    let val;

    // Helper to check validity
    const isValid = (v) => v !== undefined && v !== null && v !== "" && (typeof v !== "string" || v.trim().length > 0);

    // Scan Overrides
    for (const k of keys) {
      if (isValid(overrides[k])) {
        val = overrides[k];
        break;
      }
    }

    // Scan Env
    if (val === undefined) {
      const eKeys = Array.isArray(envKeys) ? envKeys : (envKeys ? [envKeys] : []);
      for (const k of eKeys) {
        if (isValid(env[k])) {
          val = env[k];
          break;
        }
      }
    }

    // Scan Config
    if (val === undefined) {
      for (const k of keys) {
        if (isValid(config[k])) {
          val = config[k];
          break;
        }
      }
    }

    if (val === undefined) {
      val = defaultVal;
    }

    return transform(val);
  };

  const endpoint = resolve(["endpoint"], "OPCUA_ENDPOINT");
  const nodeId = resolve(["nodeId", "node_id"], "OPCUA_NODE_ID");

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

  const username = resolve(["username"], "OPCUA_USERNAME");
  const password = resolve(["password"], "OPCUA_PASSWORD");
  const triggerNodeId = resolve(["triggerNodeId", "trigger_node_id"], "OPCUA_TRIGGER_NODE_ID");

  const triggerValue = resolve(
    ["triggerValue", "trigger_value"],
    "OPCUA_TRIGGER_VALUE",
    true,
    (v) => {
      const b = toBool(v);
      return b !== undefined ? b : true;
    }
  );

  const triggerResetValue = resolve(
    ["triggerResetValue", "trigger_reset_value"],
    "OPCUA_TRIGGER_RESET_VALUE",
    false,
    (v) => {
      const b = toBool(v);
      return b !== undefined ? b : false;
    }
  );

  const triggerResetDelayMs = resolve(
    ["triggerResetDelayMs", "trigger_reset_delay_ms"],
    "OPCUA_TRIGGER_RESET_DELAY_MS",
    250,
    (v) => {
      const i = toInt(v);
      return (i !== undefined && i >= 0) ? i : 250;
    }
  );

  const valueTypeRaw = resolve(["valueType", "value_type"], "OPCUA_VALUE_TYPE", "string");
  const valueType = String(valueTypeRaw).toLowerCase();

  const arrayLength = resolve(
    ["arrayLength", "array_length"],
    "OPCUA_ARRAY_LENGTH",
    undefined,
    toInt
  );

  const operationTimeoutMs = resolve(
    ["operationTimeoutMs", "operation_timeout_ms", "timeoutMs", "timeout_ms"],
    ["OPCUA_OPERATION_TIMEOUT_MS", "OPCUA_TIMEOUT_MS"],
    OPCUA_OPERATION_TIMEOUT_MS,
    (v) => {
      const i = toInt(v);
      return (i !== undefined && i > 0) ? i : OPCUA_OPERATION_TIMEOUT_MS;
    }
  );

  return {
    endpoint,
    nodeId,
    username: username !== undefined ? String(username) : undefined,
    password: password !== undefined ? String(password) : undefined,
    triggerNodeId,
    triggerValue,
    triggerResetValue,
    triggerResetDelayMs: triggerResetDelayMs ?? 0,
    valueType,
    arrayLength,
    operationTimeoutMs,
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

function isOpcuaTimeoutError(error) {
  if (!error) {
    return false;
  }
  if (error.name) {
    const name = String(error.name).toLowerCase();
    if (name.includes("timeout") || name === "opcuatimeouterror") {
      return true;
    }
  }
  if (error.code) {
    const code = String(error.code).toUpperCase();
    if (
      code === "OPCUA_TIMEOUT" ||
      code === "ETIMEOUT" ||
      code === "ETIMEDOUT" ||
      code === "ESOCKETTIMEDOUT"
    ) {
      return true;
    }
  }
  const message = typeof error.message === "string" ? error.message.toLowerCase() : "";
  if (message.includes("timeout") || message.includes("timed out")) {
    return true;
  }
  const reason = error.reason && typeof error.reason.message === "string"
    ? error.reason.message.toLowerCase()
    : "";
  return reason.includes("timeout") || reason.includes("timed out");
}

function withOpcUaTimeout(fn, label, timeoutMs = OPCUA_OPERATION_TIMEOUT_MS) {
  if (typeof fn !== "function") {
    throw new TypeError("withOpcUaTimeout expects a function");
  }
  const effectiveTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : OPCUA_OPERATION_TIMEOUT_MS;
  const labelText = label ? String(label) : "Operazione OPC UA";

  return new Promise((resolve, reject) => {
    let settled = false;
    const timeoutError = new Error(
      `${labelText} timed out after ${Math.ceil(effectiveTimeout / 1000)}s`
    );
    timeoutError.name = "OpcUaTimeoutError";
    timeoutError.code = "OPCUA_TIMEOUT";
    timeoutError.label = labelText;

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(timeoutError);
    }, effectiveTimeout);

    let result;
    try {
      result = fn();
    } catch (error) {
      clearTimeout(timer);
      reject(error);
      return;
    }

    Promise.resolve(result)
      .then((value) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
  });
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

  const client = OPCUAClient.create({
    applicationName: "PlotterPenClient",
    connectionStrategy: {
      initialDelay: 100,
      maxRetry: 1,
      maxDelay: 500,
      maxRetryDelay: 2000
    },
    keepPendingSessionsOnDisconnect: false
  });
  let session;

  try {
    await withOpcUaTimeout(
      () => client.connect(settings.endpoint),
      "Connessione OPC UA",
      settings.operationTimeoutMs
    );

    if (settings.username) {
      session = await withOpcUaTimeout(
        () =>
          client.createSession({
            type: "userName",
            userName: settings.username,
            password: settings.password ?? "",
          }),
        "Creazione sessione OPC UA",
        settings.operationTimeoutMs
      );
    } else {
      session = await withOpcUaTimeout(
        () => client.createSession(),
        "Creazione sessione OPC UA",
        settings.operationTimeoutMs
      );
    }

    let targetLines;

    if (STRING_ARRAY_TYPES.has(settings.valueType)) {
      targetLines = Array.isArray(payload)
        ? [...payload]
        : [payload == null ? "" : String(payload)];

      let capacity = desiredLength;
      let currentArrayLength;

      try {
        const dataValue = await withOpcUaTimeout(
          () =>
            session.read({
              nodeId: mainNodeId,
              attributeId: AttributeIds.Value,
            }),
          "Lettura valore nodo principale",
          settings.operationTimeoutMs
        );
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

      const mainStatus = await withOpcUaTimeout(
        () => session.writeSingleNode(mainNodeId, arrayVariant),
        "Scrittura valore principale",
        settings.operationTimeoutMs
      );

      if (!statusIsGood(mainStatus)) {
        throw new Error(
          `OPC UA write failed: ${mainStatus ? mainStatus.toString() : "unknown status"
          }`
        );
      }
    } else {
      const mainStatus = await withOpcUaTimeout(
        () => session.writeSingleNode(mainNodeId, buildVariant(payload, settings.valueType)),
        "Scrittura valore principale",
        settings.operationTimeoutMs
      );

      if (!statusIsGood(mainStatus)) {
        throw new Error(
          `OPC UA write failed: ${mainStatus ? mainStatus.toString() : "unknown status"
          }`
        );
      }
    }

    let triggered = false;
    if (triggerNodeId) {
      const triggerStatus = await withOpcUaTimeout(
        () => session.writeSingleNode(triggerNodeId, buildVariant(settings.triggerValue, "auto")),
        "Scrittura nodo trigger",
        settings.operationTimeoutMs
      );
      if (!statusIsGood(triggerStatus)) {
        throw new Error(
          `Failed to write trigger node: ${triggerStatus ? triggerStatus.toString() : "unknown status"
          }`
        );
      }
      triggered = true;
      if (settings.triggerResetDelayMs > 0) {
        await sleep(settings.triggerResetDelayMs);
        const resetStatus = await withOpcUaTimeout(
          () => session.writeSingleNode(triggerNodeId, buildVariant(settings.triggerResetValue, "auto")),
          "Ripristino nodo trigger",
          settings.operationTimeoutMs
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
      await withOpcUaTimeout(
        () => session.close(),
        "Chiusura sessione OPC UA",
        settings.operationTimeoutMs
      ).catch(() => { });
    }
    await withOpcUaTimeout(
      () => client.disconnect(),
      "Disconnessione OPC UA",
      settings.operationTimeoutMs
    ).catch(() => { });
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
    } catch {
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
  app.use(express.static(ROOT_DIR, { index: TARGET_PAGE }));

  app.get("/api/opcua/config", async (req, res) => {
    try {
      const stored = await loadFileConfig();
      const data = withDefaultOpcuaConfig(stored);
      res.json({
        status: "ok",
        data,
      });
    } catch (error) {
      console.error("Errore durante la lettura della configurazione OPC UA:", error);
      res.status(500).json({
        status: "error",
        message: "Impossibile leggere la configurazione OPC UA.",
      });
    }
  });

  app.put("/api/opcua/config", async (req, res) => {
    try {
      const stored = await loadFileConfig();
      const updated = normalizeOpcuaConfigPayload(req.body ?? {}, stored);
      const serialized = `${JSON.stringify(updated, null, 4)}\n`;
      await fs.writeFile(CONFIG_PATH, serialized, "utf8");
      res.json({
        status: "ok",
        data: updated,
      });
    } catch (error) {
      if (error instanceof OpcUaConfigValidationError) {
        res.status(400).json({
          status: "error",
          message: error.message,
        });
        return;
      }
      console.error("Errore durante il salvataggio della configurazione OPC UA:", error);
      res.status(500).json({
        status: "error",
        message: "Impossibile salvare la configurazione OPC UA.",
      });
    }
  });

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
      if (isOpcuaTimeoutError(error)) {
        console.error("OPC UA timeout:", error);
        res.status(504).json({
          status: "error",
          message: "Timeout while communicating with the OPC UA server. Verify the endpoint is reachable and credentials are valid.",
        });
        return;
      }
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

  // ========== DXF PARSING ENDPOINT ==========
  // Process DXF files in backend to avoid browser freeze
  app.post("/api/parse-dxf", express.text({ limit: '10mb', type: '*/*' }), dxfParseHandler);

  // Smart Import (Biarc + Optimization)
  app.use("/api", smartImportRouter);

  // Persistence (SQLite)
  app.use("/api", persistenceRouter);

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



