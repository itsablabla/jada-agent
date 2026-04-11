import express from "express";
import cors from "cors";
import { McpHub } from "./mcp-hub.mjs";
import { agentLoop } from "./agent-loop.mjs";
import { SYSTEM_PROMPT } from "./system-prompt.mjs";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.MODEL || "qwen/qwen3.5-plus-02-15";
const BEARER_TOKEN = process.env.BEARER_TOKEN || "jada-chat-2026";

if (!OPENROUTER_KEY) {
  console.error("OPENROUTER_API_KEY is required");
  process.exit(1);
}

// ── MCP Hub (connects to all MCP servers) ──────────────────────────
const mcpHub = new McpHub();

// ── Health ─────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  const servers = mcpHub.getStatus();
  res.json({ status: "ok", model: MODEL, mcpServers: servers });
});

// ── Tool catalog (for debugging) ───────────────────────────────────
app.get("/tools", (req, res) => {
  if (!checkAuth(req, res)) return;
  const tools = mcpHub.getAllToolsOpenAI();
  res.json({ count: tools.length, tools: tools.map((t) => ({ name: t.function.name, description: t.function.description?.slice(0, 120) })) });
});

// ── Chat endpoint (SSE streaming with agent loop) ──────────────────
app.post("/api/chat", async (req, res) => {
  if (!checkAuth(req, res)) return;

  const { messages = [], model: reqModel } = req.body;
  if (!messages.length) return res.status(400).json({ error: "messages required" });

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  try {
    const useModel = reqModel || MODEL;
    const tools = mcpHub.getAllToolsOpenAI();

    // Build conversation with system prompt
    const conversation = [{ role: "system", content: SYSTEM_PROMPT(tools) }, ...messages.filter((m) => m.role !== "system")];

    await agentLoop({
      conversation,
      tools,
      model: useModel,
      apiKey: OPENROUTER_KEY,
      mcpHub,
      onToken: (token) => {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: token } }] })}\n\n`);
      },
      onToolCall: (name, args) => {
        // Send tool-use indicator to the widget
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { tool_use: { name, arguments: args } } }] })}\n\n`);
      },
      onToolResult: (name, result) => {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { tool_result: { name, success: !result.isError, preview: typeof result.content === "string" ? result.content.slice(0, 200) : JSON.stringify(result.content).slice(0, 200) } } }] })}\n\n`);
      },
    });

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    console.error("Agent loop error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    }
  }
});

function checkAuth(req, res) {
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${BEARER_TOKEN}`) {
    res.status(401).json({ error: "unauthorized" });
    return false;
  }
  return true;
}

// ── Start ──────────────────────────────────────────────────────────
async function start() {
  console.log("Connecting to MCP servers...");
  await mcpHub.connectAll();
  console.log(`MCP Hub ready — ${mcpHub.getAllToolsOpenAI().length} tools available`);

  app.listen(PORT, () => {
    console.log(`Jada Agent Backend listening on :${PORT}`);
    console.log(`Model: ${MODEL}`);
  });
}

start().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
