const state = {
  map: "",
  roomPath: "",
  linePath: "",
};

const els = {
  status: document.querySelector("#statusBadge"),
  map: document.querySelector("#mapSelect"),
  room: document.querySelector("#roomSelect"),
  line: document.querySelector("#lineSelect"),
  count: document.querySelector("#footholdCount"),
  log: document.querySelector("#log"),
  refresh: document.querySelector("#refreshButton"),
  save: document.querySelector("#saveButton"),
  dryRun: document.querySelector("#dryRunButton"),
  connect: document.querySelector("#connectButton"),
};

els.refresh.addEventListener("click", () => refreshAll());
els.save.addEventListener("click", () => saveCurrentMap());
els.dryRun.addEventListener("click", () => runPlan(false));
els.connect.addEventListener("click", () => runPlan(true));
els.map.addEventListener("change", () => {
  state.map = els.map.value;
  loadRooms();
});
els.room.addEventListener("change", () => {
  state.roomPath = els.room.value;
  loadLines();
});
els.line.addEventListener("change", () => {
  state.linePath = els.line.value;
  loadFootholds();
});

refreshAll();

async function refreshAll() {
  clearLog();
  await loadStatus();
  await loadMaps();
}

async function loadStatus() {
  const data = await api("/api/status");
  const status = data.status;
  if (status.connected && status.makerRunning) {
    setStatus("MCP connected / Editor running", "good");
    appendLog(`MCP tools: ${status.tools.join(", ")}`);
    appendLog(`Current map: ${JSON.stringify(status.currentMap)}`);
  } else if (status.connected && status.mswProcess?.detected) {
    setStatus("MSW running / MakerMCP not attached", "warn");
    appendLog("MSW process was detected, but MakerMCP could not read the current map.");
    appendLog(`MakerMCP response: ${status.currentMap?.error ?? "unknown"}`);
    appendLog("Dry Run can still read saved .map files. Apply requires Maker refresh to reflect in the editor.");
  } else if (status.connected) {
    setStatus("MCP connected / Editor not running", "warn");
    appendLog(`Maker status: ${status.currentMap?.error ?? "Editor is not open"}`);
  } else {
    setStatus("MCP connection failed", "bad");
    appendLog(status.error);
  }
}

async function loadMaps() {
  const data = await api("/api/maps");
  fillSelect(els.map, data.maps, "No maps found", (item) => item.name, (item) => item.name);
  state.map = els.map.value;
  await loadRooms();
}

async function loadRooms() {
  resetSelect(els.room, "No rooms found");
  resetSelect(els.line, "No line parents found");
  els.count.textContent = "0";
  if (!state.map) return;

  const data = await api(`/api/rooms?map=${encodeURIComponent(state.map)}`);
  if (!data.hasEditorGeneratedGrid) appendLog("Warning: EditorGeneratedGrid was not found. Fallback Room_ search was used.");
  fillSelect(els.room, data.rooms, "No rooms found", (item) => item.path, (item) => item.name);
  state.roomPath = els.room.value;
  await loadLines();
}

async function loadLines() {
  resetSelect(els.line, "No line parents found");
  els.count.textContent = "0";
  if (!state.map || !state.roomPath) return;

  const data = await api(`/api/lines?map=${encodeURIComponent(state.map)}&roomPath=${encodeURIComponent(state.roomPath)}`);
  fillSelect(els.line, data.lines, "No line parents found", (item) => item.path, (item) => item.name);
  state.linePath = els.line.value;
  await loadFootholds();
}

async function loadFootholds() {
  els.count.textContent = "0";
  if (!state.map || !state.linePath) return;

  try {
    const data = await api(`/api/footholds?map=${encodeURIComponent(state.map)}&linePath=${encodeURIComponent(state.linePath)}`);
    els.count.textContent = String(data.count);
    appendLog(`Selected line footholds: ${data.count}`);
    for (const foothold of data.footholds) {
      appendLog(`- ${foothold.name} center=(${fmt(foothold.center.x)}, ${fmt(foothold.center.y)}) edgeIds=${foothold.edgeIds.join(",")}`);
    }
  } catch (error) {
    appendLog(`Warning: ${error.message}`);
  }
}

async function saveCurrentMap() {
  try {
    const data = await api("/api/save-current-map", { method: "POST", body: "{}" });
    appendLog(`Current map save requested: ${JSON.stringify(data.result)}`);
  } catch (error) {
    appendLog(`Save failed: ${error.message}`);
  }
}

async function runPlan(apply) {
  if (!state.map) return appendLog("Map is not selected");
  if (!state.roomPath) return appendLog("Room is not selected");
  if (!state.linePath) return appendLog("Line parent is not selected");

  const endpoint = apply ? "/api/connect" : "/api/dry-run";
  try {
    const data = await api(endpoint, {
      method: "POST",
      body: JSON.stringify({ map: state.map, linePath: state.linePath }),
    });
    const plan = data.plan ?? data.result;
    appendLog(apply ? "Apply result" : "Dry Run result");
    renderPlan(plan);
    if (plan.message) appendLog(plan.message);
    if (data.refresh) appendLog(`Maker refresh: ${JSON.stringify(data.refresh)}`);
    if (plan.backupPath) appendLog(`Backup: ${plan.backupPath}`);
  } catch (error) {
    appendLog(`Failed: ${error.message}`);
  }
}

function renderPlan(plan) {
  if (plan.errors?.length) {
    for (const error of plan.errors) appendLog(`Error: ${error}`);
    return;
  }
  appendLog("Sorted order:");
  plan.sorted.forEach((item, index) => {
    const first = item.firstEdgeWorld ? ` first=(${fmt(item.firstEdgeWorld.x)}, ${fmt(item.firstEdgeWorld.y)})` : "";
    const rear = item.rearEdgeWorld ? ` rear=(${fmt(item.rearEdgeWorld.x)}, ${fmt(item.rearEdgeWorld.y)})` : "";
    appendLog(`${index + 1}. ${item.name} edgeIds=${item.edgeIds.join(",")} center=(${fmt(item.center.x)}, ${fmt(item.center.y)})${first}${rear}`);
  });
  appendLog("Move plan:");
  for (const change of plan.changes) {
    appendLog(`- ${change.toName}: move (${fmt(change.delta.x)}, ${fmt(change.delta.y)}) so first edge (${fmt(change.toFirstWorldBefore.x)}, ${fmt(change.toFirstWorldBefore.y)}) matches ${change.fromName} rear (${fmt(change.fromRearWorld.x)}, ${fmt(change.fromRearWorld.y)})`);
    appendLog(`  position: (${fmt(change.toPositionBefore.x)}, ${fmt(change.toPositionBefore.y)}, ${fmt(change.toPositionBefore.z)}) -> (${fmt(change.toPositionAfter.x)}, ${fmt(change.toPositionAfter.y)}, ${fmt(change.toPositionAfter.z)})`);
  }
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(data.error || response.statusText);
  return data;
}

function fillSelect(select, items, emptyLabel, valueOf, textOf) {
  select.innerHTML = "";
  if (!items.length) {
    resetSelect(select, emptyLabel);
    return;
  }
  for (const item of items) {
    const option = document.createElement("option");
    option.value = valueOf(item);
    option.textContent = textOf(item);
    select.appendChild(option);
  }
}

function resetSelect(select, label) {
  select.innerHTML = "";
  const option = document.createElement("option");
  option.value = "";
  option.textContent = label;
  select.appendChild(option);
}

function setStatus(text, kind) {
  els.status.textContent = text;
  els.status.className = `status status-${kind}`;
}

function appendLog(message) {
  const time = new Date().toLocaleTimeString();
  els.log.textContent += `[${time}] ${message}\n`;
  els.log.scrollTop = els.log.scrollHeight;
}

function clearLog() {
  els.log.textContent = "";
}

function fmt(value) {
  return Number(value).toFixed(3);
}
