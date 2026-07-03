import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MAP_DIR = path.join(ROOT, "map");
const CUSTOM_FOOTHOLD = "MOD.Core.CustomFootholdComponent";
const TRANSFORM = "MOD.Core.TransformComponent";

export function listMaps() {
  return fs
    .readdirSync(MAP_DIR)
    .filter((name) => name.endsWith(".map"))
    .sort((a, b) => a.localeCompare(b))
    .map((fileName) => {
      const mapName = path.basename(fileName, ".map");
      return {
        name: mapName,
        fileName,
        path: `World/maps/${mapName}`,
      };
    });
}

export function getMapFile(mapName) {
  const safe = listMaps().find((map) => map.name === mapName);
  if (!safe) throw new Error(`Selected map not found: ${mapName}`);
  return path.join(MAP_DIR, safe.fileName);
}

export function loadMap(mapName) {
  const file = getMapFile(mapName);
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const entities = flattenEntities(data);
  return { file, data, entities };
}

export function getRooms(mapName) {
  const { entities } = loadMap(mapName);
  const root = `/maps/${mapName}`;
  const gridPath = `${root}/EditorGeneratedGrid`;
  const grid = entities.find((entity) => entity.path === gridPath);

  let rooms = [];
  if (grid) {
    rooms = directChildren(entities, gridPath).filter((entity) => /^Room_\d+$/.test(entity.name));
  }

  if (rooms.length === 0) {
    rooms = entities.filter((entity) => entity.path.startsWith(`${root}/`) && /^Room_\d+/.test(entity.name));
  }

  rooms.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  return {
    hasEditorGeneratedGrid: Boolean(grid),
    rooms: rooms.map(toOption),
  };
}

export function getLineParents(mapName, roomPath) {
  if (!roomPath) throw new Error("Room is not selected");
  const { entities } = loadMap(mapName);
  const room = entities.find((entity) => entity.path === roomPath);
  if (!room) throw new Error(`Selected Room not found: ${roomPath}`);

  const lines = directChildren(entities, roomPath)
    .filter((entity) => isLineParentName(entity.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return lines.map(toOption);
}

export function getFootholdSummary(mapName, linePath) {
  const context = collectFootholds(mapName, linePath);
  return {
    footholds: context.footholds.map((foothold) => summarizeFoothold(foothold)),
    count: context.footholds.length,
  };
}

export function dryRunConnect(mapName, linePath) {
  const context = collectFootholds(mapName, linePath);
  return buildConnectionPlan(context);
}

export function dryRunMoveLineToOrigin(mapName, linePath) {
  const context = collectFootholds(mapName, linePath);
  return buildLineOriginPlan(context);
}

export function dryRunConnectRoom(mapName, roomPath) {
  const loaded = loadMap(mapName);
  return buildRoomBatchPlan(loaded, mapName, roomPath, "connect");
}

export function dryRunMoveRoomLinesToOrigin(mapName, roomPath) {
  const loaded = loadMap(mapName);
  return buildRoomBatchPlan(loaded, mapName, roomPath, "move-line-origin");
}

export function dryRunMoveLineBoundsToPivot(mapName, linePath) {
  const context = collectFootholds(mapName, linePath);
  return buildLineBoundsPivotPlan(context);
}

export function dryRunSymmetry(mapName, roomPath) {
  const loaded = loadMap(mapName);
  return buildSymmetryPlan(loaded, mapName, roomPath);
}

export function applyConnect(mapName, linePath) {
  const context = collectFootholds(mapName, linePath);
  const plan = buildConnectionPlan(context);
  if (plan.errors.length > 0) {
    return { ...plan, applied: false };
  }

  applyConnectionOffsets(plan);

  fs.writeFileSync(context.file, `${JSON.stringify(context.data, null, 2)}\n`, "utf8");

  return {
    ...plan,
    applied: true,
    message: "Moved following foothold Transform positions so each first edge point matches the previous rear edge point.",
  };
}

export function applyConnectRoom(mapName, roomPath) {
  const loaded = loadMap(mapName);
  const plan = buildRoomBatchPlan(loaded, mapName, roomPath, "connect");
  if (plan.errors.length > 0) {
    return { ...plan, applied: false };
  }

  for (const item of plan.rawLinePlans) {
    applyConnectionOffsets(item.plan);
  }

  fs.writeFileSync(loaded.file, `${JSON.stringify(loaded.data, null, 2)}\n`, "utf8");

  return {
    ...plan,
    applied: true,
    message: `Applied edge auto-connect to ${plan.validLineCount} line(s) in the selected Room.`,
  };
}

export function applyMoveLineToOrigin(mapName, linePath) {
  const context = collectFootholds(mapName, linePath);
  const plan = buildLineOriginPlan(context);
  if (plan.errors.length > 0) {
    return { ...plan, applied: false };
  }

  shiftFootholdChildren(context, plan.delta);

  fs.writeFileSync(context.file, `${JSON.stringify(context.data, null, 2)}\n`, "utf8");

  return {
    ...plan,
    applied: true,
    message: "Moved child footholds so the selected line's first start edge point matches the line parent pivot.",
  };
}

export function applyMoveRoomLinesToOrigin(mapName, roomPath) {
  const loaded = loadMap(mapName);
  const plan = buildRoomBatchPlan(loaded, mapName, roomPath, "move-line-origin");
  if (plan.errors.length > 0) {
    return { ...plan, applied: false };
  }

  for (const item of plan.rawLinePlans) {
    shiftFootholdChildren(item.context, item.plan.delta);
  }

  fs.writeFileSync(loaded.file, `${JSON.stringify(loaded.data, null, 2)}\n`, "utf8");

  return {
    ...plan,
    applied: true,
    message: `Moved footholds for ${plan.validLineCount} line(s) so each line start edge matches its parent pivot.`,
  };
}

export function applyMoveLineBoundsToPivot(mapName, linePath) {
  const context = collectFootholds(mapName, linePath);
  const plan = buildLineBoundsPivotPlan(context);
  if (plan.errors.length > 0) {
    return { ...plan, applied: false };
  }

  shiftFootholdChildren(context, plan.delta);

  fs.writeFileSync(context.file, `${JSON.stringify(context.data, null, 2)}\n`, "utf8");

  return {
    ...plan,
    applied: true,
    message: "Moved child footholds so edge bounds center X and max Y match the line parent pivot.",
  };
}

export function applySymmetry(mapName, roomPath) {
  const loaded = loadMap(mapName);
  const plan = buildSymmetryPlan(loaded, mapName, roomPath);
  if (plan.errors.length > 0) {
    return { ...plan, applied: false };
  }

  for (const operation of plan.rawOperations) {
    if (nearZero(operation.delta.x) && nearZero(operation.delta.y)) continue;
    shiftLineParent(operation.context, operation.delta);
  }

  fs.writeFileSync(loaded.file, `${JSON.stringify(loaded.data, null, 2)}\n`, "utf8");

  return {
    ...plan,
    applied: true,
    message: "Moved matching line parent objects to satisfy Room-local symmetry.",
  };
}

function collectFootholds(mapName, linePath) {
  if (!linePath) throw new Error("Line parent is not selected");

  const loaded = loadMap(mapName);
  return collectFootholdsFromLoaded(loaded, mapName, linePath);
}

function collectFootholdsFromLoaded(loaded, mapName, linePath) {
  const { entities } = loaded;
  const line = entities.find((entity) => entity.path === linePath);
  if (!line) throw new Error(`Selected line parent not found: ${linePath}`);
  if (!isLineParentName(line.name)) throw new Error(`Selected entity is not a line parent: ${line.name}`);

  const rootFootholdComponent = findRootFootholdComponent(loaded.data);
  if (!rootFootholdComponent?.FootholdsByLayer) {
    throw new Error("Foothold edge information not found: FootholdsByLayer is missing");
  }

  const allSerializedFootholds = Object.values(rootFootholdComponent.FootholdsByLayer)
    .flat()
    .filter(Boolean);
  const serializedByOwner = new Map();
  for (const foothold of allSerializedFootholds) {
    if (!serializedByOwner.has(foothold.OwnerId)) serializedByOwner.set(foothold.OwnerId, []);
    serializedByOwner.get(foothold.OwnerId).push(foothold);
  }
  for (const group of serializedByOwner.values()) group.sort((a, b) => a.Id - b.Id);

  const childEntities = entities.filter((entity) => isDescendant(entity.path, linePath));
  const footholds = childEntities
    .map((entity) => buildFootholdEntity(entity, entities, serializedByOwner.get(entity.id) ?? []))
    .filter(Boolean);

  if (footholds.length < 2) {
    throw new Error(`Line parent has fewer than 2 footholds: ${footholds.length}`);
  }

  return {
    ...loaded,
    line,
    lineTransform: componentOf(line, TRANSFORM),
    lineWorldPosition: getWorldPosition(line, entities),
    footholds,
  };
}

function buildRoomBatchPlan(loaded, mapName, roomPath, action) {
  if (!roomPath) throw new Error("Room is not selected");

  const { entities } = loaded;
  const room = entities.find((entity) => entity.path === roomPath);
  if (!room) throw new Error(`Selected Room not found: ${roomPath}`);

  const lines = directChildren(entities, roomPath)
    .filter((entity) => isLineParentName(entity.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  if (lines.length === 0) {
    return {
      action: roomBatchActionName(action),
      applied: false,
      errors: ["Selected Room has no line parents"],
      warnings: [],
      roomName: room.name,
      roomPath,
      lineCount: 0,
      validLineCount: 0,
      skippedLineCount: 0,
      linePlans: [],
    };
  }

  const warnings = [];
  const rawLinePlans = [];
  const linePlans = [];

  for (const line of lines) {
    try {
      const context = collectFootholdsFromLoaded(loaded, mapName, line.path);
      const linePlan = action === "connect" ? buildConnectionPlan(context) : buildLineOriginPlan(context);
      const lineOutput = summarizeRoomLinePlan(line, linePlan, action);

      if (linePlan.errors.length > 0) {
        warnings.push(`${line.name}: ${linePlan.errors.join("; ")}`);
      } else {
        rawLinePlans.push({ context, plan: linePlan });
      }

      linePlans.push(lineOutput);
    } catch (error) {
      warnings.push(`${line.name}: ${error.message}`);
      linePlans.push({
        lineName: line.name,
        linePath: line.path,
        status: "skipped",
        errors: [error.message],
        footholdCount: 0,
        changeCount: 0,
      });
    }
  }

  const errors = rawLinePlans.length === 0 ? ["No valid line parents to process"] : [];
  const output = {
    action: roomBatchActionName(action),
    applied: false,
    errors,
    warnings,
    roomName: room.name,
    roomPath,
    lineCount: lines.length,
    validLineCount: rawLinePlans.length,
    skippedLineCount: lines.length - rawLinePlans.length,
    linePlans,
  };
  Object.defineProperty(output, "rawLinePlans", {
    value: rawLinePlans,
    enumerable: false,
  });
  return output;
}

function buildSymmetryPlan(loaded, mapName, roomPath) {
  const errors = [];
  const warnings = [];
  if (!roomPath) throw new Error("Room is not selected");

  const { entities } = loaded;
  const room = entities.find((entity) => entity.path === roomPath);
  if (!room) throw new Error(`Selected Room not found: ${roomPath}`);

  const roomWorldPosition = getWorldPosition(room, entities);
  const lineEntities = directChildren(entities, roomPath)
    .map((entity) => ({ entity, symmetry: parseLineSymmetryName(entity.name) }))
    .filter((item) => item.symmetry);

  const pairGroups = new Map();
  const centerLines = [];
  for (const item of lineEntities) {
    if (item.symmetry.type === "center") {
      centerLines.push(item.entity);
      continue;
    }

    const key = `${item.symmetry.base}#${item.symmetry.index}`;
    if (!pairGroups.has(key)) pairGroups.set(key, { base: item.symmetry.base, index: item.symmetry.index, left: null, right: null });
    pairGroups.get(key)[item.symmetry.side === "l" ? "left" : "right"] = item.entity;
  }

  const rawOperations = [];
  const operations = [];

  for (const group of [...pairGroups.values()].sort((a, b) => a.base.localeCompare(b.base) || a.index - b.index)) {
    if (!group.left || !group.right) {
      warnings.push(`Pair skipped: ${group.base}_${group.left ? "r" : "l"}${group.index} is missing`);
      continue;
    }

    let leftContext;
    let rightContext;
    try {
      leftContext = collectFootholdsFromLoaded(loaded, mapName, group.left.path);
      rightContext = collectFootholdsFromLoaded(loaded, mapName, group.right.path);
    } catch (error) {
      errors.push(`Pair ${group.base}_${group.index}: ${error.message}`);
      continue;
    }

    const pairOperation = buildPairSymmetryOperation(leftContext, rightContext, roomWorldPosition, group);
    if (pairOperation.errors.length > 0) {
      errors.push(...pairOperation.errors);
      continue;
    }
    rawOperations.push(pairOperation.raw);
    operations.push(pairOperation.output);
  }

  for (const line of centerLines.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))) {
    let context;
    try {
      context = collectFootholdsFromLoaded(loaded, mapName, line.path);
    } catch (error) {
      errors.push(`Center ${line.name}: ${error.message}`);
      continue;
    }

    const centerOperation = buildCenterSymmetryOperation(context, roomWorldPosition);
    if (centerOperation.errors.length > 0) {
      errors.push(...centerOperation.errors);
      continue;
    }
    rawOperations.push(centerOperation.raw);
    operations.push(centerOperation.output);
  }

  if (rawOperations.length === 0 && errors.length === 0) {
    warnings.push("No symmetry targets found. Expected names like floor_line_l1, floor_line_r1, or floor_line_c.");
  }

  const output = {
    action: "symmetry",
    applied: false,
    errors,
    warnings,
    roomName: room.name,
    roomPath,
    roomWorldPosition: {
      x: roundCoord(roomWorldPosition.x),
      y: roundCoord(roomWorldPosition.y),
    },
    operations,
  };
  Object.defineProperty(output, "rawOperations", {
    value: rawOperations,
    enumerable: false,
  });
  return output;
}

function summarizeRoomLinePlan(line, plan, action) {
  const output = {
    lineName: line.name,
    linePath: line.path,
    status: plan.errors.length > 0 ? "skipped" : "ready",
    errors: plan.errors,
    footholdCount: plan.sorted?.length ?? 0,
    changeCount: plan.changes?.length ?? 0,
  };

  if (action === "connect") {
    output.sorted = plan.sorted;
    output.changes = plan.changes;
    return output;
  }

  output.startFoothold = plan.startFoothold;
  output.startEdgeWorldBefore = plan.startEdgeWorldBefore;
  output.startEdgeWorldAfter = plan.startEdgeWorldAfter;
  output.targetPivotWorld = plan.targetPivotWorld;
  output.delta = plan.delta;
  output.affectedFootholds = plan.affectedFootholds;
  return output;
}

function roomBatchActionName(action) {
  return action === "connect" ? "room-connect" : "room-move-line-origin";
}

function buildConnectionPlan(context) {
  const errors = [];
  const sorted = sortFootholds(context.footholds);

  for (const foothold of sorted) {
    if (!Number.isFinite(foothold.center.x) || !Number.isFinite(foothold.center.y)) {
      errors.push(`Cannot read foothold position: ${foothold.name}`);
    }
    if (!foothold.transform?.Position) {
      errors.push(`Cannot edit foothold TransformComponent.Position: ${foothold.name}`);
    }
    if (foothold.edgePoints.length === 0) {
      errors.push(`Cannot read foothold edge points: ${foothold.name}`);
    }
    if (!foothold.firstPoint || !foothold.rearPoint) {
      errors.push(`Cannot select first/rear edge point: ${foothold.name}`);
    }
  }

  if (errors.length > 0) {
    return { applied: false, errors, sorted: sorted.map(summarizeFoothold), changes: [] };
  }

  const offsets = new Map(sorted.map((foothold) => [foothold.id, { x: 0, y: 0 }]));
  const rawChanges = [];

  for (let i = 0; i < sorted.length - 1; i += 1) {
    const from = sorted[i];
    const to = sorted[i + 1];
    const fromOffset = offsets.get(from.id);
    const toOffset = offsets.get(to.id);

    const fromRearWorld = pointWorld(from.rearPoint, from.worldPosition, fromOffset);
    const toFirstWorldBefore = pointWorld(to.firstPoint, to.worldPosition, toOffset);
    const delta = {
      x: roundCoord(fromRearWorld.x - toFirstWorldBefore.x),
      y: roundCoord(fromRearWorld.y - toFirstWorldBefore.y),
    };

    toOffset.x = roundCoord(toOffset.x + delta.x);
    toOffset.y = roundCoord(toOffset.y + delta.y);

    rawChanges.push({
      from,
      to,
      fromName: from.name,
      toName: to.name,
      fromId: lastSerializedId(from),
      toId: firstSerializedId(to),
      fromRearWorld,
      toFirstWorldBefore,
      toFirstWorldAfter: {
        x: roundCoord(toFirstWorldBefore.x + delta.x),
        y: roundCoord(toFirstWorldBefore.y + delta.y),
      },
      delta,
      toPositionBefore: clonePoint3(to.transform.Position),
      toPositionAfter: {
        x: roundCoord((to.transform.Position.x ?? 0) + toOffset.x),
        y: roundCoord((to.transform.Position.y ?? 0) + toOffset.y),
        z: to.transform.Position.z ?? 0,
      },
      toAccumulatedOffset: { ...toOffset },
    });
  }

  const rawFinalOffsets = sorted.map((foothold) => ({
    foothold,
    offset: offsets.get(foothold.id) ?? { x: 0, y: 0 },
  }));

  const output = {
    applied: false,
    errors,
    sorted: sorted.map(summarizeFoothold),
    changes: rawChanges.map((change) => ({
      fromName: change.fromName,
      toName: change.toName,
      fromId: change.fromId,
      toId: change.toId,
      fromRearWorld: change.fromRearWorld,
      toFirstWorldBefore: change.toFirstWorldBefore,
      toFirstWorldAfter: change.toFirstWorldAfter,
      delta: change.delta,
      toPositionBefore: change.toPositionBefore,
      toPositionAfter: change.toPositionAfter,
      toAccumulatedOffset: change.toAccumulatedOffset,
    })),
  };
  Object.defineProperty(output, "rawChanges", {
    value: rawChanges,
    enumerable: false,
  });
  Object.defineProperty(output, "rawFinalOffsets", {
    value: rawFinalOffsets,
    enumerable: false,
  });
  return output;
}

function applyConnectionOffsets(plan) {
  for (const item of plan.rawFinalOffsets) {
    if (nearZero(item.offset.x) && nearZero(item.offset.y)) continue;

    const position = item.foothold.transform.Position;
    position.x = roundCoord((position.x ?? 0) + item.offset.x);
    position.y = roundCoord((position.y ?? 0) + item.offset.y);

    // FootholdsByLayer is a generated/runtime cache, but keeping it in sync
    // prevents stale serialized StartPoint/EndPoint data after a file refresh.
    for (const serialized of item.foothold.serialized) {
      shiftPoint(serialized.StartPoint, item.offset);
      shiftPoint(serialized.EndPoint, item.offset);
    }
  }
}

function buildLineOriginPlan(context) {
  const errors = [];
  const sorted = sortFootholds(context.footholds);
  const first = sorted[0];

  if (!first?.firstPoint) {
    errors.push("Cannot select the line start edge point");
  }

  for (const foothold of sorted) {
    if (!foothold.transform?.Position) {
      errors.push(`Cannot edit foothold TransformComponent.Position: ${foothold.name}`);
    }
    if (foothold.edgePoints.length === 0) {
      errors.push(`Cannot read foothold edge points: ${foothold.name}`);
    }
  }

  if (errors.length > 0) {
    return {
      action: "move-line-origin",
      applied: false,
      errors,
      sorted: sorted.map(summarizeFoothold),
      changes: [],
    };
  }

  const startWorld = pointWorld(first.firstPoint, first.worldPosition);
  const targetWorld = {
    x: roundCoord(context.lineWorldPosition.x),
    y: roundCoord(context.lineWorldPosition.y),
  };
  const delta = {
    x: roundCoord(targetWorld.x - startWorld.x),
    y: roundCoord(targetWorld.y - startWorld.y),
  };

  const rawMoveTarget = {
    type: "foothold-children",
    name: context.line.name,
    path: context.line.path,
    linePivotWorld: targetWorld,
    positionBefore: null,
    positionAfter: null,
  };

  const affectedFootholds = sorted.map((foothold) => ({
    name: foothold.name,
    path: foothold.path,
    positionBefore: clonePoint3(foothold.transform.Position),
    positionAfter: {
      x: roundCoord((foothold.transform.Position.x ?? 0) + delta.x),
      y: roundCoord((foothold.transform.Position.y ?? 0) + delta.y),
      z: foothold.transform.Position.z ?? 0,
    },
    firstEdgeWorldBefore: foothold.firstPoint ? pointWorld(foothold.firstPoint, foothold.worldPosition) : null,
    firstEdgeWorldAfter: foothold.firstPoint
      ? {
          x: roundCoord(pointWorld(foothold.firstPoint, foothold.worldPosition).x + delta.x),
          y: roundCoord(pointWorld(foothold.firstPoint, foothold.worldPosition).y + delta.y),
        }
      : null,
  }));

  const output = {
    action: "move-line-origin",
    applied: false,
    errors,
    lineName: context.line.name,
    linePath: context.line.path,
    sorted: sorted.map(summarizeFoothold),
    startFoothold: first.name,
    startEdgeWorldBefore: startWorld,
    startEdgeWorldAfter: {
      x: roundCoord(startWorld.x + delta.x),
      y: roundCoord(startWorld.y + delta.y),
    },
    targetPivotWorld: targetWorld,
    delta,
    moveTarget: {
      type: rawMoveTarget.type,
      name: rawMoveTarget.name,
      path: rawMoveTarget.path,
      linePivotWorld: rawMoveTarget.linePivotWorld,
      positionBefore: rawMoveTarget.positionBefore,
      positionAfter: rawMoveTarget.positionAfter,
    },
    affectedFootholds,
    changes: [
      {
        lineName: context.line.name,
        delta,
        startFoothold: first.name,
        startEdgeWorldBefore: startWorld,
        startEdgeWorldAfter: {
          x: roundCoord(startWorld.x + delta.x),
          y: roundCoord(startWorld.y + delta.y),
        },
        targetPivotWorld: targetWorld,
      },
    ],
  };
  Object.defineProperty(output, "rawMoveTarget", {
    value: rawMoveTarget,
    enumerable: false,
  });
  return output;
}

function buildLineBoundsPivotPlan(context) {
  const errors = [];
  const sorted = sortFootholds(context.footholds);

  for (const foothold of sorted) {
    if (!foothold.transform?.Position) {
      errors.push(`Cannot edit foothold TransformComponent.Position: ${foothold.name}`);
    }
    if (foothold.edgePoints.length === 0) {
      errors.push(`Cannot read foothold edge points: ${foothold.name}`);
    }
  }

  const bounds = getLineWorldBounds(sorted);
  if (!bounds) {
    errors.push("Cannot read line edge bounds");
  }

  if (errors.length > 0) {
    return {
      action: "move-line-bounds-pivot",
      applied: false,
      errors,
      sorted: sorted.map(summarizeFoothold),
      changes: [],
    };
  }

  const targetWorld = {
    x: roundCoord(context.lineWorldPosition.x),
    y: roundCoord(context.lineWorldPosition.y),
  };
  const delta = {
    x: roundCoord(targetWorld.x - bounds.centerX),
    y: roundCoord(targetWorld.y - bounds.maxY),
  };

  const affectedFootholds = sorted.map((foothold) => {
    const firstBefore = foothold.firstPoint ? pointWorld(foothold.firstPoint, foothold.worldPosition) : null;
    const rearBefore = foothold.rearPoint ? pointWorld(foothold.rearPoint, foothold.worldPosition) : null;
    return {
      name: foothold.name,
      path: foothold.path,
      positionBefore: clonePoint3(foothold.transform.Position),
      positionAfter: {
        x: roundCoord((foothold.transform.Position.x ?? 0) + delta.x),
        y: roundCoord((foothold.transform.Position.y ?? 0) + delta.y),
        z: foothold.transform.Position.z ?? 0,
      },
      firstEdgeWorldBefore: firstBefore,
      firstEdgeWorldAfter: firstBefore ? addPoint(firstBefore, delta) : null,
      rearEdgeWorldBefore: rearBefore,
      rearEdgeWorldAfter: rearBefore ? addPoint(rearBefore, delta) : null,
    };
  });

  const output = {
    action: "move-line-bounds-pivot",
    applied: false,
    errors,
    lineName: context.line.name,
    linePath: context.line.path,
    sorted: sorted.map(summarizeFoothold),
    boundsBefore: bounds,
    boundsAfter: {
      minX: roundCoord(bounds.minX + delta.x),
      maxX: roundCoord(bounds.maxX + delta.x),
      centerX: roundCoord(bounds.centerX + delta.x),
      minY: roundCoord(bounds.minY + delta.y),
      maxY: roundCoord(bounds.maxY + delta.y),
    },
    targetPivotWorld: targetWorld,
    delta,
    moveTarget: {
      type: "foothold-children",
      name: context.line.name,
      path: context.line.path,
      linePivotWorld: targetWorld,
    },
    affectedFootholds,
    changes: [
      {
        lineName: context.line.name,
        delta,
        boundsBefore: bounds,
        boundsAfter: {
          minX: roundCoord(bounds.minX + delta.x),
          maxX: roundCoord(bounds.maxX + delta.x),
          centerX: roundCoord(bounds.centerX + delta.x),
          minY: roundCoord(bounds.minY + delta.y),
          maxY: roundCoord(bounds.maxY + delta.y),
        },
        targetPivotWorld: targetWorld,
      },
    ],
  };
  return output;
}

function buildPairSymmetryOperation(leftContext, rightContext, roomWorldPosition, group) {
  const errors = [];
  const leftBounds = getLineEndpointsInRoom(leftContext, roomWorldPosition);
  const rightBounds = getLineEndpointsInRoom(rightContext, roomWorldPosition);

  if (!leftBounds.left || !leftBounds.right) errors.push(`Cannot read endpoints for ${leftContext.line.name}`);
  if (!rightBounds.left || !rightBounds.right) errors.push(`Cannot read endpoints for ${rightContext.line.name}`);
  if (!rightContext.lineTransform?.Position) {
    errors.push(`Cannot edit line parent TransformComponent.Position: ${rightContext.line.name}`);
  }
  if (errors.length > 0) return { errors };

  const targetRightLeftRoom = mirrorX(leftBounds.right.room);
  const targetRightRightRoom = mirrorX(leftBounds.left.room);
  const deltaFromLeft = {
    x: roundCoord(targetRightLeftRoom.x - rightBounds.left.room.x),
    y: roundCoord(targetRightLeftRoom.y - rightBounds.left.room.y),
  };
  const deltaFromRight = {
    x: roundCoord(targetRightRightRoom.x - rightBounds.right.room.x),
    y: roundCoord(targetRightRightRoom.y - rightBounds.right.room.y),
  };
  const delta = {
    x: roundCoord((deltaFromLeft.x + deltaFromRight.x) / 2),
    y: roundCoord((deltaFromLeft.y + deltaFromRight.y) / 2),
  };

  const rightLeftAfter = addPoint(rightBounds.left.room, delta);
  const rightRightAfter = addPoint(rightBounds.right.room, delta);
  const residual = {
    leftEndpoint: {
      x: roundCoord(rightLeftAfter.x - targetRightLeftRoom.x),
      y: roundCoord(rightLeftAfter.y - targetRightLeftRoom.y),
    },
    rightEndpoint: {
      x: roundCoord(rightRightAfter.x - targetRightRightRoom.x),
      y: roundCoord(rightRightAfter.y - targetRightRightRoom.y),
    },
  };

  const raw = {
    type: "pair",
    context: rightContext,
    delta,
  };

  const output = {
    type: "pair",
    base: group.base,
    index: group.index,
    leftLineName: leftContext.line.name,
    rightLineName: rightContext.line.name,
    movedLineName: rightContext.line.name,
    delta,
    leftEndpointsBefore: summarizeEndpoints(leftBounds),
    rightEndpointsBefore: summarizeEndpoints(rightBounds),
    targetRightEndpoints: {
      left: targetRightLeftRoom,
      right: targetRightRightRoom,
    },
    rightEndpointsAfter: {
      left: rightLeftAfter,
      right: rightRightAfter,
    },
    residual,
    moveTarget: summarizeMoveLineParent(rightContext, delta),
  };

  return { errors, raw, output };
}

function buildCenterSymmetryOperation(context, roomWorldPosition) {
  const errors = [];
  const bounds = getLineEndpointsInRoom(context, roomWorldPosition);
  if (!bounds.left || !bounds.right) errors.push(`Cannot read endpoints for ${context.line.name}`);
  if (!context.lineTransform?.Position) {
    errors.push(`Cannot edit line parent TransformComponent.Position: ${context.line.name}`);
  }
  if (errors.length > 0) return { errors };

  const midpoint = {
    x: roundCoord((bounds.left.room.x + bounds.right.room.x) / 2),
    y: roundCoord((bounds.left.room.y + bounds.right.room.y) / 2),
  };
  const delta = {
    x: roundCoord(-midpoint.x),
    y: 0,
  };
  const leftAfter = addPoint(bounds.left.room, delta);
  const rightAfter = addPoint(bounds.right.room, delta);
  const residual = {
    midpoint: {
      x: roundCoord((leftAfter.x + rightAfter.x) / 2),
      y: roundCoord((leftAfter.y + rightAfter.y) / 2),
    },
    xMidpoint: roundCoord((leftAfter.x + rightAfter.x) / 2),
    yMidpointUnchanged: midpoint.y,
    yDifference: roundCoord(leftAfter.y - rightAfter.y),
  };

  const raw = {
    type: "center",
    context,
    delta,
  };

  const output = {
    type: "center",
    lineName: context.line.name,
    movedLineName: context.line.name,
    delta,
    endpointsBefore: summarizeEndpoints(bounds),
    endpointsAfter: {
      left: leftAfter,
      right: rightAfter,
    },
    midpointBefore: midpoint,
    residual,
    moveTarget: summarizeMoveLineParent(context, delta),
  };

  return { errors, raw, output };
}

function getLineEndpointsInRoom(context, roomWorldPosition) {
  const sorted = sortFootholds(context.footholds);
  const endpoints = [];

  for (const foothold of sorted) {
    for (const point of foothold.edgePoints) {
      const world = pointWorld(point, foothold.worldPosition);
      endpoints.push({
        footholdName: foothold.name,
        edgeIndex: point.edgeIndex,
        pointIndex: point.pointIndex,
        globalIndex: point.globalIndex,
        world,
        room: {
          x: roundCoord(world.x - roomWorldPosition.x),
          y: roundCoord(world.y - roomWorldPosition.y),
        },
      });
    }
  }

  endpoints.sort((a, b) => a.room.x - b.room.x || a.globalIndex - b.globalIndex || a.footholdName.localeCompare(b.footholdName));

  return {
    sorted,
    endpoints,
    left: endpoints[0] ?? null,
    right: endpoints[endpoints.length - 1] ?? null,
  };
}

function getLineWorldBounds(footholds) {
  const points = [];
  for (const foothold of footholds) {
    for (const point of foothold.edgePoints) {
      points.push(pointWorld(point, foothold.worldPosition));
    }
  }
  if (points.length === 0) return null;

  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  return {
    minX: roundCoord(minX),
    maxX: roundCoord(maxX),
    centerX: roundCoord((minX + maxX) / 2),
    minY: roundCoord(minY),
    maxY: roundCoord(maxY),
  };
}

function shiftFootholdChildren(context, delta) {
  for (const foothold of context.footholds) {
    const position = foothold.transform.Position;
    position.x = roundCoord((position.x ?? 0) + delta.x);
    position.y = roundCoord((position.y ?? 0) + delta.y);

    for (const serialized of foothold.serialized) {
      shiftPoint(serialized.StartPoint, delta);
      shiftPoint(serialized.EndPoint, delta);
    }
  }
}

function shiftLineParent(context, delta) {
  const position = context.lineTransform.Position;
  position.x = roundCoord((position.x ?? 0) + delta.x);
  position.y = roundCoord((position.y ?? 0) + delta.y);
}

function sortFootholds(footholds) {
  const centers = footholds.map((foothold) => foothold.center);
  const mean = centers.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
  mean.x /= centers.length;
  mean.y /= centers.length;

  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const point of centers) {
    const dx = point.x - mean.x;
    const dy = point.y - mean.y;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }

  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const direction = {
    x: Math.cos(theta),
    y: Math.sin(theta),
  };

  return [...footholds]
    .map((foothold) => ({
      ...foothold,
      projection: foothold.center.x * direction.x + foothold.center.y * direction.y,
    }))
    .sort((a, b) => a.projection - b.projection || a.name.localeCompare(b.name));
}

function buildFootholdEntity(entity, entities, serialized) {
  const component = componentOf(entity, CUSTOM_FOOTHOLD);
  const isFoothold =
    Boolean(component?.edgeLists) ||
    entity.modelId?.toLowerCase() === "foothold" ||
    entity.name.toLowerCase().startsWith("foothold");

  if (!isFoothold || !component?.edgeLists) return null;

  const transform = componentOf(entity, TRANSFORM);
  const worldPosition = getWorldPosition(entity, entities);
  const edgePoints = getEdgePoints(component);
  if (edgePoints.length === 0) return null;

  const localCenter = edgePoints.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
  localCenter.x /= edgePoints.length;
  localCenter.y /= edgePoints.length;

  return {
    id: entity.id,
    name: entity.name,
    path: entity.path,
    entity,
    transform,
    component,
    worldPosition,
    edgePoints,
    firstPoint: selectFirstPoint(edgePoints),
    rearPoint: selectRearPoint(edgePoints),
    center: {
      x: roundCoord(worldPosition.x + localCenter.x),
      y: roundCoord(worldPosition.y + localCenter.y),
    },
    serialized,
  };
}

function getEdgePoints(component) {
  const points = [];
  for (let edgeIndex = 0; edgeIndex < component.edgeLists.length; edgeIndex += 1) {
    const edge = component.edgeLists[edgeIndex];
    const edgePoints = Array.isArray(edge) ? edge : Array.isArray(edge?.points) ? edge.points : [];
    for (let pointIndex = 0; pointIndex < edgePoints.length; pointIndex += 1) {
      const point = edgePoints[pointIndex];
      if (!isPoint(point)) continue;
      points.push({
        x: point.x,
        y: point.y,
        edgeIndex,
        pointIndex,
        globalIndex: points.length,
      });
    }
  }
  return points;
}

function selectFirstPoint(points) {
  return [...points].sort((a, b) => a.x - b.x || a.globalIndex - b.globalIndex)[0] ?? null;
}

function selectRearPoint(points) {
  return [...points].sort((a, b) => b.x - a.x || b.globalIndex - a.globalIndex)[0] ?? null;
}

function pointWorld(point, worldPosition, offset = { x: 0, y: 0 }) {
  return {
    x: roundCoord(worldPosition.x + offset.x + point.x),
    y: roundCoord(worldPosition.y + offset.y + point.y),
  };
}

function findRootFootholdComponent(data) {
  for (const entity of data.ContentProto?.Entities ?? []) {
    const json = entity.jsonString;
    const component = (json?.["@components"] ?? []).find((item) => item?.FootholdsByLayer);
    if (component) return component;
  }
  return null;
}

function flattenEntities(data) {
  return (data.ContentProto?.Entities ?? []).map((outer) => {
    const json = outer.jsonString ?? {};
    return {
      id: outer.id,
      path: outer.path ?? json.path,
      name: json.name ?? path.basename(outer.path ?? ""),
      modelId: json.modelId ?? outer.modelId ?? "",
      componentNames: outer.componentNames ?? "",
      json,
      outer,
    };
  });
}

function componentOf(entity, type) {
  return (entity.json?.["@components"] ?? []).find((component) => component?.["@type"] === type) ?? null;
}

function getWorldPosition(entity, entities) {
  const byPath = new Map(entities.map((item) => [item.path, item]));
  let current = entity;
  const total = { x: 0, y: 0, z: 0 };

  while (current) {
    const position = componentOf(current, TRANSFORM)?.Position;
    if (position) {
      total.x += position.x ?? 0;
      total.y += position.y ?? 0;
      total.z += position.z ?? 0;
    }
    current = byPath.get(parentPath(current.path));
  }

  return total;
}

function directChildren(entities, parent) {
  return entities.filter((entity) => parentPath(entity.path) === parent);
}

function parentPath(entityPath) {
  const index = entityPath.lastIndexOf("/");
  return index <= 0 ? "" : entityPath.slice(0, index);
}

function isDescendant(entityPath, parent) {
  return entityPath.startsWith(`${parent}/`);
}

function isLineParentName(name) {
  return /.*_line$/.test(name) || Boolean(parseLineSymmetryName(name));
}

function parseLineSymmetryName(name) {
  const pair = name.match(/^(.*_line)_([lr])(\d+)$/);
  if (pair) {
    return {
      type: "pair",
      base: pair[1],
      side: pair[2],
      index: Number(pair[3]),
    };
  }

  const center = name.match(/^(.*_line)_c$/);
  if (center) {
    return {
      type: "center",
      base: center[1],
    };
  }

  return null;
}

function isPoint(value) {
  return value && Number.isFinite(value.x) && Number.isFinite(value.y);
}

function toOption(entity) {
  return {
    id: entity.id,
    name: entity.name,
    path: entity.path,
  };
}

function summarizeFoothold(foothold) {
  return {
    id: foothold.id,
    name: foothold.name,
    path: foothold.path,
    center: foothold.center,
    edgeIds: foothold.serialized.map((item) => item.Id),
    firstEdgeWorld: foothold.firstPoint ? pointWorld(foothold.firstPoint, foothold.worldPosition) : null,
    rearEdgeWorld: foothold.rearPoint ? pointWorld(foothold.rearPoint, foothold.worldPosition) : null,
  };
}

function summarizeEndpoints(bounds) {
  return {
    left: summarizeEndpoint(bounds.left),
    right: summarizeEndpoint(bounds.right),
  };
}

function summarizeEndpoint(endpoint) {
  if (!endpoint) return null;
  return {
    footholdName: endpoint.footholdName,
    edgeIndex: endpoint.edgeIndex,
    pointIndex: endpoint.pointIndex,
    world: endpoint.world,
    room: endpoint.room,
  };
}

function summarizeMoveLineParent(context, delta) {
  const position = context.lineTransform.Position;
  return {
    type: "line-parent",
    name: context.line.name,
    path: context.line.path,
    positionBefore: clonePoint3(position),
    positionAfter: {
      x: roundCoord((position.x ?? 0) + delta.x),
      y: roundCoord((position.y ?? 0) + delta.y),
      z: position.z ?? 0,
    },
  };
}

function firstSerializedId(foothold) {
  return foothold.serialized[0]?.Id ?? null;
}

function lastSerializedId(foothold) {
  return foothold.serialized[foothold.serialized.length - 1]?.Id ?? null;
}

function shiftPoint(point, offset) {
  if (!isPoint(point)) return;
  point.x = roundCoord(point.x + offset.x);
  point.y = roundCoord(point.y + offset.y);
}

function mirrorX(point) {
  return {
    x: roundCoord(-point.x),
    y: roundCoord(point.y),
  };
}

function addPoint(point, offset) {
  return {
    x: roundCoord(point.x + offset.x),
    y: roundCoord(point.y + offset.y),
  };
}

function clonePoint3(point) {
  return {
    x: point.x ?? 0,
    y: point.y ?? 0,
    z: point.z ?? 0,
  };
}

function nearZero(value) {
  return Math.abs(value) < 0.000001;
}

function roundCoord(value) {
  return Math.round(value * 1000000) / 1000000;
}
