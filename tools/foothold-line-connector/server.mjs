import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MakerMcpClient, getMakerStatus } from "./maker-mcp-client.mjs";
import {
  applyConnect,
  applyConnectRoom,
  applyMoveLineBoundsToPivot,
  applyMoveLineToOrigin,
  applyMoveRoomLinesToOrigin,
  applySymmetry,
  dryRunConnect,
  dryRunConnectRoom,
  dryRunMoveLineBoundsToPivot,
  dryRunMoveLineToOrigin,
  dryRunMoveRoomLinesToOrigin,
  dryRunSymmetry,
  getFootholdSummary,
  getLineParents,
  getRooms,
  listMaps,
} from "./map-service.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 3147);

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }
    serveStatic(response, url.pathname);
  } catch (error) {
    sendJson(response, 500, { ok: false, error: error.message });
  }
});

server.listen(port, () => {
  console.log(`Foothold line connector: http://localhost:${port}`);
});

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/status") {
    sendJson(response, 200, { ok: true, status: await getMakerStatus() });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/maps") {
    sendJson(response, 200, { ok: true, maps: listMaps() });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/rooms") {
    sendJson(response, 200, { ok: true, ...getRooms(requireParam(url, "map")) });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/lines") {
    sendJson(response, 200, {
      ok: true,
      lines: getLineParents(requireParam(url, "map"), requireParam(url, "roomPath")),
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/footholds") {
    sendJson(response, 200, {
      ok: true,
      ...getFootholdSummary(requireParam(url, "map"), requireParam(url, "linePath")),
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/save-current-map") {
    const result = await new MakerMcpClient().callTool("maker_save", {});
    sendJson(response, 200, { ok: true, result });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/dry-run") {
    const body = await readJson(request);
    sendJson(response, 200, { ok: true, plan: dryRunConnect(body.map, body.linePath) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/move-line-origin/dry-run") {
    const body = await readJson(request);
    sendJson(response, 200, { ok: true, plan: dryRunMoveLineToOrigin(body.map, body.linePath) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/room-connect/dry-run") {
    const body = await readJson(request);
    sendJson(response, 200, { ok: true, plan: dryRunConnectRoom(body.map, body.roomPath) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/room-move-line-origin/dry-run") {
    const body = await readJson(request);
    sendJson(response, 200, { ok: true, plan: dryRunMoveRoomLinesToOrigin(body.map, body.roomPath) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/move-line-bounds-pivot/dry-run") {
    const body = await readJson(request);
    sendJson(response, 200, { ok: true, plan: dryRunMoveLineBoundsToPivot(body.map, body.linePath) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/symmetry/dry-run") {
    const body = await readJson(request);
    sendJson(response, 200, { ok: true, plan: dryRunSymmetry(body.map, body.roomPath) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/connect") {
    const body = await readJson(request);
    const result = applyConnect(body.map, body.linePath);
    let refresh = null;
    if (result.applied) {
      try {
        refresh = await new MakerMcpClient().callTool("maker_refresh_workspace", {}, 6000);
      } catch (error) {
        refresh = { warning: error.message };
      }
    }
    sendJson(response, 200, { ok: true, result, refresh });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/move-line-origin") {
    const body = await readJson(request);
    const result = applyMoveLineToOrigin(body.map, body.linePath);
    let refresh = null;
    if (result.applied) {
      try {
        refresh = await new MakerMcpClient().callTool("maker_refresh_workspace", {}, 6000);
      } catch (error) {
        refresh = { warning: error.message };
      }
    }
    sendJson(response, 200, { ok: true, result, refresh });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/room-connect") {
    const body = await readJson(request);
    const result = applyConnectRoom(body.map, body.roomPath);
    let refresh = null;
    if (result.applied) {
      try {
        refresh = await new MakerMcpClient().callTool("maker_refresh_workspace", {}, 6000);
      } catch (error) {
        refresh = { warning: error.message };
      }
    }
    sendJson(response, 200, { ok: true, result, refresh });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/room-move-line-origin") {
    const body = await readJson(request);
    const result = applyMoveRoomLinesToOrigin(body.map, body.roomPath);
    let refresh = null;
    if (result.applied) {
      try {
        refresh = await new MakerMcpClient().callTool("maker_refresh_workspace", {}, 6000);
      } catch (error) {
        refresh = { warning: error.message };
      }
    }
    sendJson(response, 200, { ok: true, result, refresh });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/move-line-bounds-pivot") {
    const body = await readJson(request);
    const result = applyMoveLineBoundsToPivot(body.map, body.linePath);
    let refresh = null;
    if (result.applied) {
      try {
        refresh = await new MakerMcpClient().callTool("maker_refresh_workspace", {}, 6000);
      } catch (error) {
        refresh = { warning: error.message };
      }
    }
    sendJson(response, 200, { ok: true, result, refresh });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/symmetry") {
    const body = await readJson(request);
    const result = applySymmetry(body.map, body.roomPath);
    let refresh = null;
    if (result.applied) {
      try {
        refresh = await new MakerMcpClient().callTool("maker_refresh_workspace", {}, 6000);
      } catch (error) {
        refresh = { warning: error.message };
      }
    }
    sendJson(response, 200, { ok: true, result, refresh });
    return;
  }

  sendJson(response, 404, { ok: false, error: "Unknown API route" });
}

function serveStatic(response, requestPath) {
  const normalized = requestPath === "/" ? "/index.html" : requestPath;
  const file = path.normalize(path.join(publicDir, normalized));
  if (!file.startsWith(publicDir)) {
    sendJson(response, 403, { ok: false, error: "Forbidden" });
    return;
  }

  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    sendJson(response, 404, { ok: false, error: "Not found" });
    return;
  }

  const ext = path.extname(file);
  const type = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
  }[ext] ?? "application/octet-stream";

  response.writeHead(200, { "Content-Type": type });
  fs.createReadStream(file).pipe(response);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload, null, 2));
}

function requireParam(url, name) {
  const value = url.searchParams.get(name);
  if (!value) throw new Error(`Missing query parameter: ${name}`);
  return value;
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}
