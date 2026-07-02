import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const DEFAULT_TIMEOUT_MS = 5000;
const execFileAsync = promisify(execFile);

function getMakerMcpBatPath() {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return null;
  return path.join(localAppData, "Nexon", "MapleStory Worlds", "MakerMCP", "msw-maker-mcp.bat");
}

export class MakerMcpClient {
  constructor(options = {}) {
    this.command = options.command ?? "cmd.exe";
    this.args = options.args ?? ["/c", "call", getMakerMcpBatPath()].filter(Boolean);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async callTool(name, args = {}, timeoutMs = this.timeoutMs) {
    return this.#withProcess(async (session) => {
      await session.initialize();
      return session.request("tools/call", { name, arguments: args }, timeoutMs);
    }, timeoutMs);
  }

  async listTools(timeoutMs = this.timeoutMs) {
    return this.#withProcess(async (session) => {
      await session.initialize();
      return session.request("tools/list", {}, timeoutMs);
    }, timeoutMs);
  }

  async #withProcess(fn, timeoutMs) {
    const bat = getMakerMcpBatPath();
    if (!bat) {
      throw new Error("LOCALAPPDATA is not set; MakerMCP path cannot be resolved.");
    }

    const child = spawn(this.command, this.args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    const session = new JsonLineMcpSession(child);
    const timeout = setTimeout(() => {
      child.kill();
    }, timeoutMs + 1000);

    try {
      return await fn(session);
    } finally {
      clearTimeout(timeout);
      child.stdin.end();
      setTimeout(() => child.kill(), 100);
    }
  }
}

class JsonLineMcpSession {
  constructor(child) {
    this.child = child;
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = "";
    this.stderr = "";

    child.stdout.on("data", (chunk) => this.#onStdout(chunk));
    child.stderr.on("data", (chunk) => {
      this.stderr += chunk.toString("utf8");
    });
    child.on("exit", () => {
      for (const { reject } of this.pending.values()) {
        reject(new Error(this.stderr || "MakerMCP process exited before responding."));
      }
      this.pending.clear();
    });
  }

  async initialize() {
    await this.request("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "foothold-line-connector", version: "0.1.0" },
    });
    this.notify("notifications/initialized", {});
  }

  notify(method, params = {}) {
    this.#send({ jsonrpc: "2.0", method, params });
  }

  request(method, params = {}, timeoutMs = 5000) {
    const id = this.nextId++;
    this.#send({ jsonrpc: "2.0", id, method, params });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MakerMCP request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
    });
  }

  #send(message) {
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  #onStdout(chunk) {
    this.buffer += chunk.toString("utf8");
    let index;
    while ((index = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (!line) continue;

      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }

      if (message.id == null) continue;
      const pending = this.pending.get(message.id);
      if (!pending) continue;

      clearTimeout(pending.timeout);
      this.pending.delete(message.id);

      if (message.error) {
        pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
      } else {
        pending.resolve(message.result);
      }
    }
  }
}

export async function getMakerStatus() {
  const client = new MakerMcpClient();
  const mswProcess = await detectMswProcess();
  try {
    const tools = await client.listTools(4000);
    let currentMap = null;
    let makerRunning = true;
    try {
      currentMap = await client.callTool("maker_get_current_map", {}, 4000);
    } catch (error) {
      makerRunning = false;
      currentMap = { error: error.message };
    }

    return {
      connected: true,
      makerRunning,
      mswProcess,
      tools: tools.tools?.map((tool) => tool.name) ?? [],
      currentMap,
    };
  } catch (error) {
    return {
      connected: false,
      makerRunning: false,
      mswProcess,
      error: error.message,
      tools: [],
      currentMap: null,
    };
  }
}

async function detectMswProcess() {
  try {
    const { stdout } = await execFileAsync("tasklist", ["/FI", "IMAGENAME eq msw.exe", "/FO", "CSV", "/NH"], {
      windowsHide: true,
      timeout: 2000,
    });
    const rows = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !line.includes("INFO:"));
    return {
      detected: rows.length > 0,
      rows,
    };
  } catch (error) {
    return {
      detected: false,
      error: error.message,
      rows: [],
    };
  }
}
