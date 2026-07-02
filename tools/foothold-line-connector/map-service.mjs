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
    .filter((entity) => /.+_line$/.test(entity.name))
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

export function applyConnect(mapName, linePath) {
  const context = collectFootholds(mapName, linePath);
  const plan = buildConnectionPlan(context);
  if (plan.errors.length > 0) {
    return { ...plan, applied: false };
  }

  const backupPath = `${context.file}.${timestamp()}.bak`;
  fs.copyFileSync(context.file, backupPath);

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

  fs.writeFileSync(context.file, `${JSON.stringify(context.data, null, 2)}\n`, "utf8");

  return {
    ...plan,
    applied: true,
    backupPath,
    message: "Moved following foothold Transform positions so each first edge point matches the previous rear edge point.",
  };
}

function collectFootholds(mapName, linePath) {
  if (!linePath) throw new Error("Line parent is not selected");

  const loaded = loadMap(mapName);
  const { entities } = loaded;
  const line = entities.find((entity) => entity.path === linePath);
  if (!line) throw new Error(`Selected line parent not found: ${linePath}`);
  if (!/.+_line$/.test(line.name)) throw new Error(`Selected entity is not a *_line parent: ${line.name}`);

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
    footholds,
  };
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

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
