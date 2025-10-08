import initNavigation from "./navigation.js";

const form = document.getElementById("plcConfigForm");
const statusBox = document.getElementById("configStatus");
const reloadButton = document.getElementById("reloadConfigBtn");
let cachedConfig = null;

function showStatus(message, tone = "info") {
  if (!statusBox) {
    return;
  }
  statusBox.textContent = message;
  statusBox.dataset.tone = tone;
  statusBox.hidden = false;
}

function clearStatus() {
  if (!statusBox) {
    return;
  }
  statusBox.hidden = true;
  statusBox.textContent = "";
  delete statusBox.dataset.tone;
}

function setFormDisabled(disabled) {
  if (!form) {
    return;
  }
  Array.from(form.elements).forEach((element) => {
    element.disabled = disabled;
  });
  if (reloadButton) {
    reloadButton.disabled = disabled;
  }
}

function populateForm(data) {
  if (!form || !data || typeof data !== "object") {
    return;
  }
  cachedConfig = { ...data };
  form.endpoint.value = data.endpoint ?? "";
  form.nodeId.value = data.nodeId ?? "";
  form.username.value = data.username ?? "";
  form.password.value = data.password ?? "";
  form.triggerNodeId.value = data.triggerNodeId ?? "";
  form.triggerResetDelayMs.value =
    typeof data.triggerResetDelayMs === "number" ? data.triggerResetDelayMs : "";
  form.valueType.value = data.valueType ?? "";
  form.arrayLength.value =
    typeof data.arrayLength === "number" ? data.arrayLength : "";
}

function readForm() {
  if (!form) {
    return null;
  }
  const {
    endpoint,
    nodeId,
    username,
    password,
    triggerNodeId,
    triggerResetDelayMs,
    valueType,
    arrayLength,
  } = form;

  const base = cachedConfig ? { ...cachedConfig } : {};

  const result = {
    ...base,
    endpoint: endpoint.value.trim(),
    nodeId: nodeId.value.trim(),
    username: username.value.trim(),
    password: password.value,
    triggerNodeId: triggerNodeId.value.trim(),
    valueType: valueType.value.trim(),
  };

  const delay = Number.parseInt(triggerResetDelayMs.value, 10);
  if (!Number.isNaN(delay) && delay >= 0) {
    result.triggerResetDelayMs = delay;
  } else if (base && typeof base.triggerResetDelayMs === "number") {
    result.triggerResetDelayMs = base.triggerResetDelayMs;
  } else {
    result.triggerResetDelayMs = 0;
  }

  const length = Number.parseInt(arrayLength.value, 10);
  if (!Number.isNaN(length) && length >= 0) {
    result.arrayLength = length;
  } else if (base && typeof base.arrayLength === "number") {
    result.arrayLength = base.arrayLength;
  } else {
    result.arrayLength = 0;
  }

  return result;
}

async function loadConfig() {
  setFormDisabled(true);
  clearStatus();
  try {
    const response = await fetch("/api/opcua/config", {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    });
    if (!response.ok) {
      throw new Error(`Richiesta fallita con stato ${response.status}`);
    }
    const payload = await response.json();
    if (payload && payload.data) {
      populateForm(payload.data);
      showStatus("Configurazione caricata correttamente.", "success");
    } else {
      throw new Error("Risposta inattesa dal server.");
    }
  } catch (error) {
    console.error("Impossibile caricare la configurazione OPC UA:", error);
    showStatus(
      "Impossibile caricare la configurazione. Verifica che il server sia in esecuzione.",
      "error"
    );
  } finally {
    setFormDisabled(false);
  }
}

async function saveConfig(event) {
  event.preventDefault();
  if (!form) {
    return;
  }
  const payload = readForm();
  if (!payload) {
    showStatus("Compilare tutti i campi obbligatori prima del salvataggio.", "error");
    return;
  }
  if (!payload.endpoint) {
    showStatus("L'endpoint OPC UA e' obbligatorio.", "error");
    form.endpoint.focus();
    return;
  }
  if (!payload.nodeId) {
    showStatus("Il Node ID e' obbligatorio.", "error");
    form.nodeId.focus();
    return;
  }

  setFormDisabled(true);
  showStatus("Salvataggio in corso...", "info");

  try {
    const response = await fetch("/api/opcua/config", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message =
        (result && result.message) ||
        "Errore sconosciuto durante il salvataggio.";
      throw new Error(message);
    }

    populateForm(result.data);
    showStatus("Configurazione salvata con successo.", "success");
  } catch (error) {
    console.error("Errore durante il salvataggio della configurazione OPC UA:", error);
    showStatus(error.message || "Impossibile salvare la configurazione.", "error");
  } finally {
    setFormDisabled(false);
  }
}

if (form) {
  form.addEventListener("submit", saveConfig);
}
if (reloadButton) {
  reloadButton.addEventListener("click", () => {
    loadConfig();
  });
}

initNavigation();
loadConfig();
