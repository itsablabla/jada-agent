import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

const HEALTH_CHECK_INTERVAL_MS = 5 * 60_000; // check every 5 min
const CONNECT_TIMEOUT_MS = 15_000; // 15s to connect to MCP server

/**
 * McpHub — connects to multiple MCP servers, discovers tools,
 * and provides a unified interface for tool execution.
 */
export class McpHub {
  /** @type {Map<string, {client: Client, transport: StreamableHTTPClientTransport, tools: any[], status: string}>} */
  #servers = new Map();
  /** Per-server reconnect lock — prevents concurrent reconnects */
  #reconnecting = new Map();

  /** MCP server configs — add new servers here */
  #configs = [
    {
      name: "composio",
      url: "https://connect.composio.dev/mcp",
      headers: {
        "x-consumer-api-key": process.env.COMPOSIO_MCP_API_KEY || "",
      },
      enabled: !!process.env.COMPOSIO_MCP_API_KEY,
    },
    {
      name: "proton-unified",
      url: process.env.PROTON_UNIFIED_MCP_URL || "https://mcp.garzaos.cloud/mcp",
      headers: {
        Authorization: `Bearer ${process.env.PROTON_UNIFIED_MCP_TOKEN || "garza-proton-unified-mcp-2026-Qm8kR4xN7vL2pW9tJ3yB"}`,
      },
      enabled: true,
    },
    {
      name: "nextcloud",
      url: process.env.NEXTCLOUD_MCP_URL || "https://mcp-next.garzaos.online/mcp",
      headers: process.env.NEXTCLOUD_MCP_TOKEN
        ? { Authorization: `Bearer ${process.env.NEXTCLOUD_MCP_TOKEN}` }
        : {},
      enabled: true,
    },
  ];

  async connectAll() {
    const results = await Promise.allSettled(
      this.#configs
        .filter((c) => c.enabled)
        .map((c) => this.#connect(c))
    );

    for (const r of results) {
      if (r.status === "rejected") {
        console.warn("MCP connect failed:", r.reason?.message || r.reason);
      }
    }
  }

  /** Start periodic health checks — reconnects dead servers automatically */
  startHealthWatchdog() {
    this.#watchdogTimer = setInterval(async () => {
      for (const [name, entry] of this.#servers) {
        if (entry.status !== "connected" && !this.#reconnecting.has(name)) {
          console.log(`[watchdog] ${name} is ${entry.status}, attempting reconnect...`);
          try {
            await this.reconnect(name);
            console.log(`[watchdog] ✓ ${name} reconnected`);
          } catch (err) {
            console.warn(`[watchdog] ✗ ${name} reconnect failed: ${err.message}`);
          }
        }
      }
    }, HEALTH_CHECK_INTERVAL_MS);
    console.log(`[watchdog] Health check every ${HEALTH_CHECK_INTERVAL_MS / 1000}s`);
  }

  stopHealthWatchdog() {
    if (this.#watchdogTimer) clearInterval(this.#watchdogTimer);
  }

  #watchdogTimer = null;

  async #connect(config) {
    // Reuse existing entry if present (avoids replacing with client=null during reconnect)
    let entry = this.#servers.get(config.name);
    const oldClient = entry?.client;

    if (!entry) {
      entry = { client: null, transport: null, tools: [], status: "connecting" };
      this.#servers.set(config.name, entry);
    } else {
      entry.status = "connecting";
    }

    try {
      const transport = new StreamableHTTPClientTransport(
        new URL(config.url),
        {
          requestInit: {
            headers: { ...config.headers },
          },
        }
      );

      const client = new Client({
        name: "jada-agent",
        version: "1.0.0",
      });

      // Connect with timeout
      await Promise.race([
        client.connect(transport),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Connect timeout (${CONNECT_TIMEOUT_MS}ms)`)), CONNECT_TIMEOUT_MS)
        ),
      ]);

      // Discover tools with timeout
      const toolsResult = await Promise.race([
        client.listTools(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`listTools timeout (${CONNECT_TIMEOUT_MS}ms)`)), CONNECT_TIMEOUT_MS)
        ),
      ]);
      const tools = toolsResult.tools || [];

      // Only update entry AFTER everything succeeds (atomic swap)
      entry.client = client;
      entry.transport = transport;
      entry.tools = tools;
      entry.status = "connected";

      // Close old client if we were reconnecting
      if (oldClient) {
        try { oldClient.close?.(); } catch { /* ignore */ }
      }

      console.log(`✓ ${config.name}: ${tools.length} tools discovered`);
      return entry;
    } catch (err) {
      // On failure during reconnect, keep old client if it existed
      if (oldClient && entry.client === null) {
        entry.client = oldClient;
      }
      entry.status = `error: ${err.message}`;
      console.warn(`✗ ${config.name}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Returns all tools in OpenAI function-calling format.
   * Prefixes each tool name with the server name to avoid collisions.
   */
  getAllToolsOpenAI() {
    const allTools = [];

    for (const [serverName, entry] of this.#servers) {
      if (entry.status !== "connected") continue;

      for (const tool of entry.tools) {
        const qualifiedName = `${serverName}__${tool.name}`;
        allTools.push({
          type: "function",
          function: {
            name: qualifiedName,
            description: tool.description || `Tool from ${serverName}`,
            parameters: tool.inputSchema || { type: "object", properties: {} },
          },
        });
      }
    }

    return allTools;
  }

  /**
   * Execute a tool call. The qualified name is "serverName__toolName".
   * No timeout — tool calls run until they complete naturally.
   */
  async callTool(qualifiedName, args) {
    const sepIdx = qualifiedName.indexOf("__");
    if (sepIdx === -1) {
      return { content: [{ type: "text", text: `Invalid tool name: ${qualifiedName}` }], isError: true };
    }

    const serverName = qualifiedName.slice(0, sepIdx);
    const toolName = qualifiedName.slice(sepIdx + 2);

    const entry = this.#servers.get(serverName);
    if (!entry) {
      return { content: [{ type: "text", text: `Server ${serverName} not configured` }], isError: true };
    }

    // Snapshot the client reference — if reconnect replaces it, we retry with the new one
    let client = entry.client;
    if (!client) {
      return { content: [{ type: "text", text: `Server ${serverName} not connected` }], isError: true };
    }

    try {
      // No timeout — let tool calls run until they complete naturally
      const result = await client.callTool({ name: toolName, arguments: args });
      return result;
    } catch (err) {
      const msg = err.message || "";
      // Auto-reconnect on session errors (e.g. after MCP server restart)
      if (msg.includes("Session not found") || msg.includes("session") || err.code === -32600) {
        console.warn(`Session error on ${serverName}, reconnecting: ${msg}`);
        try {
          await this.reconnect(serverName);
          // Re-read client from entry AFTER reconnect completes (atomic swap guarantees new client)
          const freshClient = entry.client;
          if (!freshClient) {
            return { content: [{ type: "text", text: `Tool error: reconnect succeeded but client unavailable` }], isError: true };
          }
          console.log(`✓ Reconnected ${serverName}, retrying tool call`);
          const result = await freshClient.callTool({ name: toolName, arguments: args });
          return result;
        } catch (reconnectErr) {
          console.error(`Reconnect+retry failed for ${qualifiedName}:`, reconnectErr.message);
          return { content: [{ type: "text", text: `Tool error: reconnect failed — ${reconnectErr.message}` }], isError: true };
        }
      }
      console.error(`Tool call ${qualifiedName} failed:`, msg);
      return { content: [{ type: "text", text: `Tool error: ${msg}` }], isError: true };
    }
  }

  getStatus() {
    const status = {};
    for (const [name, entry] of this.#servers) {
      status[name] = { status: entry.status, tools: entry.tools.length };
    }
    return status;
  }

  /** Reconnect a specific server — with lock to prevent concurrent reconnects */
  async reconnect(serverName) {
    // If already reconnecting, wait for that to finish instead of starting another
    if (this.#reconnecting.has(serverName)) {
      return this.#reconnecting.get(serverName);
    }

    const config = this.#configs.find((c) => c.name === serverName);
    if (!config) throw new Error(`Unknown server: ${serverName}`);

    const promise = this.#connect(config).finally(() => {
      this.#reconnecting.delete(serverName);
    });
    this.#reconnecting.set(serverName, promise);
    return promise;
  }
}
