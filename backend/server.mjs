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
const MAX_HISTORY = 50; // max messages per conversation (keeps context window manageable)
const CONVERSATION_TTL_MS = 24 * 60 * 60 * 1000; // 24h TTL

if (!OPENROUTER_KEY) {
  console.error("OPENROUTER_API_KEY is required");
  process.exit(1);
}

// ── MCP Hub (connects to all MCP servers) ──────────────────────────
const mcpHub = new McpHub();

// ── Shared Conversation Memory ─────────────────────────────────────
// In-memory store keyed by conversationId. Both widget and Telegram
// share the same conversationId to see each other's messages.
const conversations = new Map();

function getConversation(id) {
  if (!conversations.has(id)) {
    conversations.set(id, { messages: [], updatedAt: Date.now() });
  }
  const conv = conversations.get(id);
  conv.updatedAt = Date.now();
  return conv;
}

function appendMessage(convId, role, content) {
  const conv = getConversation(convId);
  conv.messages.push({ role, content });
  // Trim to keep context window manageable
  if (conv.messages.length > MAX_HISTORY) {
    conv.messages = conv.messages.slice(-MAX_HISTORY);
  }
  conv.updatedAt = Date.now();
}

// Cleanup expired conversations every 30 min
setInterval(() => {
  const now = Date.now();
  for (const [id, conv] of conversations) {
    if (now - conv.updatedAt > CONVERSATION_TTL_MS) {
      conversations.delete(id);
    }
  }
}, 30 * 60 * 1000);

// ── Health ─────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  const servers = mcpHub.getStatus();
  res.json({
    status: "ok",
    model: MODEL,
    mcpServers: servers,
    tools: mcpHub.getAllToolsOpenAI().length,
    conversations: conversations.size,
  });
});

// ── Tool catalog (for debugging) ───────────────────────────────────
app.get("/tools", (req, res) => {
  if (!checkAuth(req, res)) return;
  const tools = mcpHub.getAllToolsOpenAI();
  res.json({ count: tools.length, tools: tools.map((t) => ({ name: t.function.name, description: t.function.description?.slice(0, 120) })) });
});

// ── Conversation history endpoint ──────────────────────────────────
app.get("/api/conversations/:id", (req, res) => {
  if (!checkAuth(req, res)) return;
  const conv = conversations.get(req.params.id);
  if (!conv) return res.json({ messages: [] });
  res.json({ messages: conv.messages, updatedAt: conv.updatedAt });
});

// ── List conversations ─────────────────────────────────────────────
app.get("/api/conversations", (req, res) => {
  if (!checkAuth(req, res)) return;
  const list = [];
  for (const [id, conv] of conversations) {
    list.push({
      id,
      messageCount: conv.messages.length,
      updatedAt: conv.updatedAt,
      lastMessage: conv.messages[conv.messages.length - 1]?.content?.slice(0, 100) || "",
    });
  }
  res.json({ conversations: list });
});

// ── Chat endpoint (Persona-compatible SSE with agent loop) ─────────
app.post("/api/chat", async (req, res) => {
  if (!checkAuth(req, res)) return;

  const { messages = [], model: reqModel, conversation_id } = req.body;
  if (!messages.length) return res.status(400).json({ error: "messages required" });

  // Determine conversation ID: explicit param > header > "default"
  const convId = conversation_id
    || req.headers["x-conversation-id"]
    || "default";

  // Get the latest user message from the request
  const latestUserMsg = messages[messages.length - 1];
  if (latestUserMsg?.role === "user") {
    appendMessage(convId, "user", latestUserMsg.content);
  }

  // SSE headers (Persona format)
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  let fullText = "";

  try {
    const useModel = reqModel || MODEL;
    const tools = mcpHub.getAllToolsOpenAI();

    // Build conversation from shared memory (not from request body)
    const conv = getConversation(convId);
    const conversation = [
      { role: "system", content: SYSTEM_PROMPT(tools) },
      ...conv.messages,
    ];

    await agentLoop({
      conversation,
      tools,
      model: useModel,
      apiKey: OPENROUTER_KEY,
      mcpHub,
      onToken: (token) => {
        fullText += token;
        res.write(`event: step_delta\ndata: ${JSON.stringify({ text: token })}\n\n`);
      },
      onReasoning: (text) => {
        res.write(`event: reason_delta\ndata: ${JSON.stringify({ text })}\n\n`);
      },
      onToolCall: (name, args) => {
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

    // Store assistant response in shared memory
    appendMessage(convId, "assistant", fullText);

    // Persona step_complete event
    res.write(`event: step_complete\ndata: ${JSON.stringify({ text: fullText, conversation_id: convId })}\n\n`);
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
    console.log(`Shared memory: enabled (${MAX_HISTORY} msg/conv, ${CONVERSATION_TTL_MS / 3600000}h TTL)`);
  });
}

start().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
