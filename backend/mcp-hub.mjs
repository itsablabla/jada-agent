import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

const TOOL_CALL_TIMEOUT_MS = 30_000; // 30s per tool call
const HEALTH_CHECK_INTERVAL_MS = 5 * 60_000; // check every 5 min
const CONNECT_TIMEOUT_MS = 15_000; // 15s to connect to MCP server

/**
 * McpHub — connects to multiple MCP servers, discovers tools,
 * and provides a unified interface for tool execution.
 */
export class McpHub {
  /** @type {Map<string, {client: Client, transport: StreamableHTTPClientTransport, tools: any[], status: string}>} */
  #servers = new Map();

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
      name: "kuse",
      url: "https://kuse-mcp-server.fly.dev/mcp",
      headers: {},
      enabled: true,
    },
    {
      name: "vault",
      url: process.env.VAULT_MCP_URL || "http://72.62.86.63:8333/mcp",
      headers: {
        Authorization: `Bearer ${process.env.VAULT_MCP_BEARER_TOKEN || ""}`,
      },
      enabled: !!process.env.VAULT_MCP_BEARER_TOKEN,
    },
    {
      name: "protonmail",
      url: process.env.PROTONMAIL_MCP_URL || "https://protonmail.garzaos.online/mcp",
      headers: {
        Authorization: `Bearer ${process.env.PROTONMAIL_MCP_TOKEN || ""}`,
      },
      enabled: !!process.env.PROTONMAIL_MCP_TOKEN,
    },
    {
      name: "nextcloud",
      url: process.env.NEXTCLOUD_MCP_URL || "https://mcp-next.garzaos.online/mcp",
      headers: process.env.NEXTCLOUD_MCP_TOKEN
        ? { Authorization: `Bearer ${process.env.NEXTCLOUD_MCP_TOKEN}` }
        : {},
      enabled: true,
    },
    {
      name: "rube",
      url: "https://rube.app/mcp",
      headers: {
        Authorization: `Bearer ${process.env.RUBE_MCP_TOKEN || ""}`,
      },
      enabled: !!process.env.RUBE_MCP_TOKEN,
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
        if (entry.status !== "connected") {
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
    const entry = { client: null, transport: null, tools: [], status: "connecting" };
    this.#servers.set(config.name, entry);

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

      entry.client = client;
      entry.transport = transport;
      entry.tools = tools;
      entry.status = "connected";

      console.log(`✓ ${config.name}: ${tools.length} tools discovered`);
      return entry;
    } catch (err) {
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
   */
  async callTool(qualifiedName, args) {
    const sepIdx = qualifiedName.indexOf("__");
    if (sepIdx === -1) {
      return { content: [{ type: "text", text: `Invalid tool name: ${qualifiedName}` }], isError: true };
    }

    const serverName = qualifiedName.slice(0, sepIdx);
    const toolName = qualifiedName.slice(sepIdx + 2);

    const entry = this.#servers.get(serverName);
    if (!entry || entry.status !== "connected") {
      return { content: [{ type: "text", text: `Server ${serverName} not connected` }], isError: true };
    }

    try {
      // Timeout wrapper — prevent hanging on unresponsive MCP servers
      const result = await Promise.race([
        entry.client.callTool({ name: toolName, arguments: args }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Tool call timeout (${TOOL_CALL_TIMEOUT_MS / 1000}s)`)), TOOL_CALL_TIMEOUT_MS)
        ),
      ]);
      return result;
    } catch (err) {
      const msg = err.message || "";
      // Auto-reconnect on session errors (e.g. after MCP server restart)
      if (msg.includes("Session not found") || msg.includes("session") || err.code === -32600) {
        console.warn(`Session error on ${serverName}, reconnecting: ${msg}`);
        try {
          await this.reconnect(serverName);
          console.log(`✓ Reconnected ${serverName}, retrying tool call`);
          const retryEntry = this.#servers.get(serverName);
          const result = await retryEntry.client.callTool({ name: toolName, arguments: args });
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

  /** Reconnect a specific server */
  async reconnect(serverName) {
    const config = this.#configs.find((c) => c.name === serverName);
    if (!config) throw new Error(`Unknown server: ${serverName}`);
    return this.#connect(config);
  }
}
