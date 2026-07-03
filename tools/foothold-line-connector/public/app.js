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
  roomDryRun: document.querySelector("#roomDryRunButton"),
  roomConnect: document.querySelector("#roomConnectButton"),
  originDryRun: document.querySelector("#originDryRunButton"),
  originMove: document.querySelector("#originMoveButton"),
  roomOriginDryRun: document.querySelector("#roomOriginDryRunButton"),
  roomOriginMove: document.querySelector("#roomOriginMoveButton"),
  boundsDryRun: document.querySelector("#boundsDryRunButton"),
  boundsMove: document.querySelector("#boundsMoveButton"),
  symmetryDryRun: document.querySelector("#symmetryDryRunButton"),
  symmetryMove: document.querySelector("#symmetryMoveButton"),
};

els.refresh.addEventListener("click", () => refreshAll());
els.save.addEventListener("click", () => saveCurrentMap());
els.dryRun.addEventListener("click", () => runPlan(false));
els.connect.addEventListener("click", () => runPlan(true));
els.roomDryRun.addEventListener("click", () => runRoomConnect(false));
els.roomConnect.addEventListener("click", () => runRoomConnect(true));
els.originDryRun.addEventListener("click", () => runOriginMove(false));
els.originMove.addEventListener("click", () => runOriginMove(true));
els.roomOriginDryRun.addEventListener("click", () => runRoomOriginMove(false));
els.roomOriginMove.addEventListener("click", () => runRoomOriginMove(true));
els.boundsDryRun.addEventListener("click", () => runBoundsMove(false));
els.boundsMove.addEventListener("click", () => runBoundsMove(true));
els.symmetryDryRun.addEventListener("click", () => runSymmetryMove(false));
els.symmetryMove.addEventListener("click", () => runSymmetryMove(true));
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

async function runOriginMove(apply) {
  if (!state.map) return appendLog("Map is not selected");
  if (!state.roomPath) return appendLog("Room is not selected");
  if (!state.linePath) return appendLog("Line parent is not selected");

  const endpoint = apply ? "/api/move-line-origin" : "/api/move-line-origin/dry-run";
  try {
    const data = await api(endpoint, {
      method: "POST",
      body: JSON.stringify({ map: state.map, linePath: state.linePath }),
    });
    const plan = data.plan ?? data.result;
    appendLog(apply ? "Origin move result" : "Origin Dry Run result");
    renderPlan(plan);
    if (plan.message) appendLog(plan.message);
    if (data.refresh) appendLog(`Maker refresh: ${JSON.stringify(data.refresh)}`);
    if (plan.backupPath) appendLog(`Backup: ${plan.backupPath}`);
  } catch (error) {
    appendLog(`Failed: ${error.message}`);
  }
}

async function runRoomConnect(apply) {
  if (!state.map) return appendLog("Map is not selected");
  if (!state.roomPath) return appendLog("Room is not selected");

  const endpoint = apply ? "/api/room-connect" : "/api/room-connect/dry-run";
  try {
    const data = await api(endpoint, {
      method: "POST",
      body: JSON.stringify({ map: state.map, roomPath: state.roomPath }),
    });
    const plan = data.plan ?? data.result;
    appendLog(apply ? "Room edge connect result" : "Room Edge Dry Run result");
    renderPlan(plan);
    if (plan.message) appendLog(plan.message);
    if (data.refresh) appendLog(`Maker refresh: ${JSON.stringify(data.refresh)}`);
  } catch (error) {
    appendLog(`Failed: ${error.message}`);
  }
}

async function runRoomOriginMove(apply) {
  if (!state.map) return appendLog("Map is not selected");
  if (!state.roomPath) return appendLog("Room is not selected");

  const endpoint = apply ? "/api/room-move-line-origin" : "/api/room-move-line-origin/dry-run";
  try {
    const data = await api(endpoint, {
      method: "POST",
      body: JSON.stringify({ map: state.map, roomPath: state.roomPath }),
    });
    const plan = data.plan ?? data.result;
    appendLog(apply ? "Room origin move result" : "Room Origin Dry Run result");
    renderPlan(plan);
    if (plan.message) appendLog(plan.message);
    if (data.refresh) appendLog(`Maker refresh: ${JSON.stringify(data.refresh)}`);
  } catch (error) {
    appendLog(`Failed: ${error.message}`);
  }
}

async function runBoundsMove(apply) {
  if (!state.map) return appendLog("Map is not selected");
  if (!state.roomPath) return appendLog("Room is not selected");
  if (!state.linePath) return appendLog("Line parent is not selected");

  const endpoint = apply ? "/api/move-line-bounds-pivot" : "/api/move-line-bounds-pivot/dry-run";
  try {
    const data = await api(endpoint, {
      method: "POST",
      body: JSON.stringify({ map: state.map, linePath: state.linePath }),
    });
    const plan = data.plan ?? data.result;
    appendLog(apply ? "Bounds pivot move result" : "Bounds Pivot Dry Run result");
    renderPlan(plan);
    if (plan.message) appendLog(plan.message);
    if (data.refresh) appendLog(`Maker refresh: ${JSON.stringify(data.refresh)}`);
  } catch (error) {
    appendLog(`Failed: ${error.message}`);
  }
}

async function runSymmetryMove(apply) {
  if (!state.map) return appendLog("Map is not selected");
  if (!state.roomPath) return appendLog("Room is not selected");

  const endpoint = apply ? "/api/symmetry" : "/api/symmetry/dry-run";
  try {
    const data = await api(endpoint, {
      method: "POST",
      body: JSON.stringify({ map: state.map, roomPath: state.roomPath }),
    });
    const plan = data.plan ?? data.result;
    appendLog(apply ? "Symmetry move result" : "Symmetry Dry Run result");
    renderPlan(plan);
    if (plan.message) appendLog(plan.message);
    if (data.refresh) appendLog(`Maker refresh: ${JSON.stringify(data.refresh)}`);
  } catch (error) {
    appendLog(`Failed: ${error.message}`);
  }
}

function renderPlan(plan) {
  if (plan.warnings?.length) {
    for (const warning of plan.warnings) appendLog(`Warning: ${warning}`);
  }
  if (plan.errors?.length) {
    for (const error of plan.errors) appendLog(`Error: ${error}`);
    return;
  }
  if (plan.action === "move-line-origin") {
    renderOriginPlan(plan);
    return;
  }
  if (plan.action === "room-connect" || plan.action === "room-move-line-origin") {
    renderRoomBatchPlan(plan);
    return;
  }
  if (plan.action === "move-line-bounds-pivot") {
    renderBoundsPivotPlan(plan);
    return;
  }
  if (plan.action === "symmetry") {
    renderSymmetryPlan(plan);
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

function renderRoomBatchPlan(plan) {
  appendLog(`Room: ${plan.roomName}`);
  appendLog(`Lines: total=${plan.lineCount}, ready=${plan.validLineCount}, skipped=${plan.skippedLineCount}`);

  for (const line of plan.linePlans) {
    appendLog(`- ${line.lineName}: ${line.status}, footholds=${line.footholdCount}, changes=${line.changeCount}`);

    if (line.errors?.length) {
      for (const error of line.errors) appendLog(`  Error: ${error}`);
      continue;
    }

    if (plan.action === "room-connect") {
      for (const change of line.changes) {
        appendLog(`  ${change.toName}: move (${fmt(change.delta.x)}, ${fmt(change.delta.y)})`);
      }
      continue;
    }

    appendLog(`  start: ${line.startFoothold}`);
    appendLog(`  target pivot: (${fmt(line.targetPivotWorld.x)}, ${fmt(line.targetPivotWorld.y)})`);
    appendLog(`  delta: (${fmt(line.delta.x)}, ${fmt(line.delta.y)})`);
    appendLog(`  start edge: (${fmt(line.startEdgeWorldBefore.x)}, ${fmt(line.startEdgeWorldBefore.y)}) -> (${fmt(line.startEdgeWorldAfter.x)}, ${fmt(line.startEdgeWorldAfter.y)})`);
  }
}

function renderOriginPlan(plan) {
  appendLog(`Line: ${plan.lineName}`);
  appendLog(`Start foothold: ${plan.startFoothold}`);
  appendLog(`Parent pivot target: (${fmt(plan.targetPivotWorld.x)}, ${fmt(plan.targetPivotWorld.y)})`);
  appendLog(`Start edge: (${fmt(plan.startEdgeWorldBefore.x)}, ${fmt(plan.startEdgeWorldBefore.y)}) -> (${fmt(plan.startEdgeWorldAfter.x)}, ${fmt(plan.startEdgeWorldAfter.y)})`);
  appendLog(`Move delta: (${fmt(plan.delta.x)}, ${fmt(plan.delta.y)})`);
  appendLog(`Move target: ${plan.moveTarget.type}`);
  appendLog(`Affected footholds: ${plan.affectedFootholds.length}`);
  for (const foothold of plan.affectedFootholds) {
    appendLog(`- ${foothold.name}: first edge (${fmt(foothold.firstEdgeWorldBefore.x)}, ${fmt(foothold.firstEdgeWorldBefore.y)}) -> (${fmt(foothold.firstEdgeWorldAfter.x)}, ${fmt(foothold.firstEdgeWorldAfter.y)})`);
  }
}

function renderBoundsPivotPlan(plan) {
  appendLog(`Line: ${plan.lineName}`);
  appendLog(`Parent pivot target: (${fmt(plan.targetPivotWorld.x)}, ${fmt(plan.targetPivotWorld.y)})`);
  appendLog(`Bounds before: minX=${fmt(plan.boundsBefore.minX)}, maxX=${fmt(plan.boundsBefore.maxX)}, centerX=${fmt(plan.boundsBefore.centerX)}, maxY=${fmt(plan.boundsBefore.maxY)}`);
  appendLog(`Bounds after: minX=${fmt(plan.boundsAfter.minX)}, maxX=${fmt(plan.boundsAfter.maxX)}, centerX=${fmt(plan.boundsAfter.centerX)}, maxY=${fmt(plan.boundsAfter.maxY)}`);
  appendLog(`Move delta: (${fmt(plan.delta.x)}, ${fmt(plan.delta.y)})`);
  appendLog(`Move target: ${plan.moveTarget.type}`);
  appendLog(`Affected footholds: ${plan.affectedFootholds.length}`);
  for (const foothold of plan.affectedFootholds) {
    appendLog(`- ${foothold.name}: pos (${fmt(foothold.positionBefore.x)}, ${fmt(foothold.positionBefore.y)}, ${fmt(foothold.positionBefore.z)}) -> (${fmt(foothold.positionAfter.x)}, ${fmt(foothold.positionAfter.y)}, ${fmt(foothold.positionAfter.z)})`);
  }
}

function renderSymmetryPlan(plan) {
  appendLog(`Room: ${plan.roomName}`);
  appendLog(`Room world origin: (${fmt(plan.roomWorldPosition.x)}, ${fmt(plan.roomWorldPosition.y)})`);
  appendLog(`Operations: ${plan.operations.length}`);
  for (const operation of plan.operations) {
    if (operation.type === "pair") {
      appendLog(`- Pair ${operation.base}_${operation.index}: move ${operation.movedLineName} by (${fmt(operation.delta.x)}, ${fmt(operation.delta.y)})`);
      appendEndpointLog("  left line endpoints", operation.leftEndpointsBefore);
      appendEndpointLog("  right before", operation.rightEndpointsBefore);
      appendLog(`  target right room: left=(${fmt(operation.targetRightEndpoints.left.x)}, ${fmt(operation.targetRightEndpoints.left.y)}), right=(${fmt(operation.targetRightEndpoints.right.x)}, ${fmt(operation.targetRightEndpoints.right.y)})`);
      appendLog(`  right after room: left=(${fmt(operation.rightEndpointsAfter.left.x)}, ${fmt(operation.rightEndpointsAfter.left.y)}), right=(${fmt(operation.rightEndpointsAfter.right.x)}, ${fmt(operation.rightEndpointsAfter.right.y)})`);
      appendLog(`  residual: left=(${fmt(operation.residual.leftEndpoint.x)}, ${fmt(operation.residual.leftEndpoint.y)}), right=(${fmt(operation.residual.rightEndpoint.x)}, ${fmt(operation.residual.rightEndpoint.y)})`);
    } else if (operation.type === "center") {
      appendLog(`- Center ${operation.lineName}: move by (${fmt(operation.delta.x)}, ${fmt(operation.delta.y)})`);
      appendEndpointLog("  before", operation.endpointsBefore);
      appendLog(`  after room: left=(${fmt(operation.endpointsAfter.left.x)}, ${fmt(operation.endpointsAfter.left.y)}), right=(${fmt(operation.endpointsAfter.right.x)}, ${fmt(operation.endpointsAfter.right.y)})`);
      appendLog(`  midpoint before: (${fmt(operation.midpointBefore.x)}, ${fmt(operation.midpointBefore.y)})`);
      appendLog(`  residual xMidpoint=${fmt(operation.residual.xMidpoint ?? operation.residual.midpoint.x)}, kept yMidpoint=${fmt(operation.residual.yMidpointUnchanged ?? operation.residual.midpoint.y)}, yDiff=${fmt(operation.residual.yDifference)}`);
    }

    if (operation.moveTarget) {
      appendLog(`  move target: ${operation.moveTarget.name} (${operation.moveTarget.type})`);
      appendLog(`  line pos: (${fmt(operation.moveTarget.positionBefore.x)}, ${fmt(operation.moveTarget.positionBefore.y)}, ${fmt(operation.moveTarget.positionBefore.z)}) -> (${fmt(operation.moveTarget.positionAfter.x)}, ${fmt(operation.moveTarget.positionAfter.y)}, ${fmt(operation.moveTarget.positionAfter.z)})`);
    } else if (operation.affectedFootholds) {
      for (const foothold of operation.affectedFootholds) {
        appendLog(`  ${foothold.name}: pos (${fmt(foothold.positionBefore.x)}, ${fmt(foothold.positionBefore.y)}, ${fmt(foothold.positionBefore.z)}) -> (${fmt(foothold.positionAfter.x)}, ${fmt(foothold.positionAfter.y)}, ${fmt(foothold.positionAfter.z)})`);
      }
    }
  }
}

function appendEndpointLog(label, endpoints) {
  appendLog(`${label}: left=${formatEndpoint(endpoints.left)}, right=${formatEndpoint(endpoints.right)}`);
}

function formatEndpoint(endpoint) {
  if (!endpoint) return "none";
  return `${endpoint.footholdName}[${endpoint.edgeIndex}:${endpoint.pointIndex}] room=(${fmt(endpoint.room.x)}, ${fmt(endpoint.room.y)})`;
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
