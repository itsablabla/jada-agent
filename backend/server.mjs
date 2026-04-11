import express from "express";
import cors from "cors";
import { McpHub } from "./mcp-hub.mjs";
import { agentLoop } from "./agent-loop.mjs";
import { SYSTEM_PROMPT } from "./system-prompt.mjs";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3100;
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
  res.json({ status: "ok", model: MODEL, mcpServers: servers, tools: mcpHub.getAllToolsOpenAI().length });
});

// ── Tool catalog (for debugging) ───────────────────────────────────
app.get("/tools", (req, res) => {
  if (!checkAuth(req, res)) return;
  const tools = mcpHub.getAllToolsOpenAI();
  res.json({ count: tools.length, tools: tools.map((t) => ({ name: t.function.name, description: t.function.description?.slice(0, 120) })) });
});

// ── Chat endpoint (Persona-compatible SSE with agent loop) ─────────
app.post("/api/chat", async (req, res) => {
  if (!checkAuth(req, res)) return;

  const { messages = [], model: reqModel } = req.body;
  if (!messages.length) return res.status(400).json({ error: "messages required" });

  // SSE headers (Persona format)
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  let fullText = "";

  try {
    const useModel = reqModel || MODEL;
    const tools = mcpHub.getAllToolsOpenAI();

    // Build conversation with system prompt
    const conversation = [
      { role: "system", content: SYSTEM_PROMPT(tools) },
      ...messages.filter((m) => m.role !== "system"),
    ];

    await agentLoop({
      conversation,
      tools,
      model: useModel,
      apiKey: OPENROUTER_KEY,
      mcpHub,
      onToken: (token) => {
        fullText += token;
        // Persona step_delta event
        res.write(`event: step_delta\ndata: ${JSON.stringify({ text: token })}\n\n`);
      },
      onReasoning: (text) => {
        // Persona reason_delta event
        res.write(`event: reason_delta\ndata: ${JSON.stringify({ text })}\n\n`);
      },
      onToolCall: (name, args) => {
        // Send tool-use indicator as a step_delta with markdown
        const toolMsg = `\n\n🔧 *Calling tool:* \`${name}\`\n`;
        fullText += toolMsg;
        res.write(`event: step_delta\ndata: ${JSON.stringify({ text: toolMsg })}\n\n`);
      },
      onToolResult: (name, result) => {
        const statusEmoji = result.isError ? "❌" : "✅";
        const preview = result.content?.slice(0, 150) || "done";
        const toolMsg = `${statusEmoji} *Tool result:* ${preview}\n\n`;
        fullText += toolMsg;
        res.write(`event: step_delta\ndata: ${JSON.stringify({ text: toolMsg })}\n\n`);
      },
    });

    // Persona step_complete event
    res.write(`event: step_complete\ndata: ${JSON.stringify({ text: fullText })}\n\n`);
    res.end();
  } catch (err) {
    console.error("Agent loop error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      const errMsg = `\n\nSorry, an error occurred: ${err.message}`;
      res.write(`event: step_delta\ndata: ${JSON.stringify({ text: errMsg })}\n\n`);
      res.write(`event: step_complete\ndata: ${JSON.stringify({ text: fullText + errMsg })}\n\n`);
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
  const toolCount = mcpHub.getAllToolsOpenAI().length;
  console.log(`MCP Hub ready — ${toolCount} tools available`);

  app.listen(PORT, () => {
    console.log(`Jada Agent Backend listening on :${PORT}`);
    console.log(`Model: ${MODEL}`);
  });
}

start().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
