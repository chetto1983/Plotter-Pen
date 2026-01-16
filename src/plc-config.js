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
  // Connection
  form.endpoint.value = data.endpoint ?? "";
  if (form.securityMode) form.securityMode.value = data.securityMode ?? "None";
  if (form.securityPolicy) form.securityPolicy.value = data.securityPolicy ?? "None";
  form.username.value = data.username ?? "";
  form.password.value = data.password ?? "";
  // Data nodes (correct backend field names)
  if (form.dataNode) form.dataNode.value = data.dataNode ?? "";
  if (form.dataType) form.dataType.value = data.dataType ?? "string_array";
  if (form.triggerNode) form.triggerNode.value = data.triggerNode ?? "";
  if (form.resetNode) form.resetNode.value = data.resetNode ?? "";
  // Position nodes
  if (form.positionXNode) form.positionXNode.value = data.positionXNode ?? "";
  if (form.positionYNode) form.positionYNode.value = data.positionYNode ?? "";
  if (form.positionZNode) form.positionZNode.value = data.positionZNode ?? "";
}

function readForm() {
  if (!form) {
    return null;
  }
  const base = cachedConfig ? { ...cachedConfig } : {};

  return {
    ...base,
    // Connection
    endpoint: form.endpoint?.value?.trim() || "",
    securityMode: form.securityMode?.value || "None",
    securityPolicy: form.securityPolicy?.value || "None",
    username: form.username?.value?.trim() || "",
    password: form.password?.value || "",
    // Data nodes (correct backend field names)
    dataNode: form.dataNode?.value?.trim() || "",
    dataType: form.dataType?.value || "string_array",
    triggerNode: form.triggerNode?.value?.trim() || "",
    resetNode: form.resetNode?.value?.trim() || "",
    // Position nodes
    positionXNode: form.positionXNode?.value?.trim() || "",
    positionYNode: form.positionYNode?.value?.trim() || "",
    positionZNode: form.positionZNode?.value?.trim() || "",
  };
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
  if (!payload.dataNode) {
    showStatus("Il Data Node e' obbligatorio.", "error");
    form.dataNode?.focus();
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
