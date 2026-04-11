import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

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
      url: "https://vault.garzaos.cloud/mcp",
      headers: {
        Authorization: `Bearer ${process.env.VAULT_MCP_BEARER_TOKEN || ""}`,
      },
      enabled: !!process.env.VAULT_MCP_BEARER_TOKEN,
    },
    {
      name: "protonmail",
      url: "https://protonmail.garzaos.online/mcp",
      headers: {
        Authorization: `Bearer ${process.env.PROTONMAIL_MCP_TOKEN || ""}`,
      },
      enabled: !!process.env.PROTONMAIL_MCP_TOKEN,
    },
    {
      name: "nextcloud",
      url: "https://mcp-next.garzaos.online/mcp",
      headers: {
        Authorization: `Bearer ${process.env.NEXTCLOUD_MCP_TOKEN || ""}`,
      },
      enabled: !!process.env.NEXTCLOUD_MCP_TOKEN,
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

      await client.connect(transport);

      // Discover tools
      const toolsResult = await client.listTools();
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
      const result = await entry.client.callTool({ name: toolName, arguments: args });
      return result;
    } catch (err) {
      console.error(`Tool call ${qualifiedName} failed:`, err.message);
      return { content: [{ type: "text", text: `Tool error: ${err.message}` }], isError: true };
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
