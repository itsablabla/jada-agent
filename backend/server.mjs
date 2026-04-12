import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
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
const SSE_KEEPALIVE_MS = 15_000; // ping every 15s to prevent proxy timeout

// ── User identity extraction ───────────────────────────────────────
// Hermes is the authoritative owner of user scoping. The Nextcloud PHP
// proxy passes identity via X-Nextcloud-User / X-Nextcloud-Name headers.
// Hermes uses this to prefix conversation IDs and filter results.
function getUserFromRequest(req) {
  const uid = req.headers["x-nextcloud-user"] || "anonymous";
  const displayName = req.headers["x-nextcloud-name"] || uid;
  return { uid, displayName };
}

// Scope a conversation ID to a user — Hermes owns this logic exclusively.
// If the ID already has the user prefix, return as-is (idempotent).
function scopeConversationId(uid, rawId) {
  const prefix = uid + ":";
  if (rawId.startsWith(prefix)) return rawId;
  return prefix + rawId;
}

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
const CONVERSATIONS_FILE = process.env.CONVERSATIONS_FILE || '/data/conversations.json';

// Load persisted conversations on startup
try {
  if (fs.existsSync(CONVERSATIONS_FILE)) {
    const raw = fs.readFileSync(CONVERSATIONS_FILE, 'utf8');
    const saved = JSON.parse(raw);
    for (const [id, conv] of Object.entries(saved)) {
      conversations.set(id, conv);
    }
    console.log(`Loaded ${conversations.size} conversations from disk`);
  }
} catch (err) {
  console.warn('Could not load conversations from disk:', err.message);
}

function persistConversations() {
  try {
    const dir = path.dirname(CONVERSATIONS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const obj = Object.fromEntries(conversations);
    fs.writeFileSync(CONVERSATIONS_FILE, JSON.stringify(obj));
  } catch (err) {
    console.warn('Could not persist conversations:', err.message);
  }
}

// Debounce persistence to avoid excessive writes
let persistTimer = null;
function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(persistConversations, 2000);
}

function getConversation(id) {
  if (!conversations.has(id)) {
    conversations.set(id, { messages: [], toolCalls: [], updatedAt: Date.now(), createdAt: Date.now() });
  }
  const conv = conversations.get(id);
  // Ensure toolCalls array exists (for legacy conversations loaded from disk)
  if (!conv.toolCalls) conv.toolCalls = [];
  conv.updatedAt = Date.now();
  return conv;
}

function addToolCall(convId, name, status, result) {
  const conv = getConversation(convId);
  conv.toolCalls.push({
    name,
    status,
    result: result || null,
    timestamp: Date.now(),
  });
  // Keep last 50 tool calls per conversation
  if (conv.toolCalls.length > 50) {
    conv.toolCalls = conv.toolCalls.slice(-50);
  }
  schedulePersist();
}

// Generate a short title from the first user message
function generateTitle(content) {
  if (!content) return 'New conversation';
  const clean = content.replace(/\n/g, ' ').trim();
  return clean.length > 60 ? clean.slice(0, 57) + '...' : clean;
}

function appendMessage(convId, role, content) {
  const conv = getConversation(convId);
  conv.messages.push({ role, content });
  // Set title from first user message
  if (role === 'user' && !conv.title) {
    conv.title = generateTitle(content);
  }
  // Trim to keep context window manageable
  if (conv.messages.length > MAX_HISTORY) {
    conv.messages = conv.messages.slice(-MAX_HISTORY);
  }
  conv.updatedAt = Date.now();
  schedulePersist();
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
  const user = getUserFromRequest(req);
  const scopedId = scopeConversationId(user.uid, req.params.id);
  const conv = conversations.get(scopedId);
  if (!conv) return res.json({ messages: [], toolCalls: [] });
  res.json({ messages: conv.messages, toolCalls: conv.toolCalls || [], updatedAt: conv.updatedAt });
});

// ── Tool calls for a conversation ─────────────────────────────────
app.get("/api/conversations/:id/toolcalls", (req, res) => {
  if (!checkAuth(req, res)) return;
  const user = getUserFromRequest(req);
  const scopedId = scopeConversationId(user.uid, req.params.id);
  const conv = conversations.get(scopedId);
  if (!conv) return res.json({ toolCalls: [] });
  res.json({ toolCalls: conv.toolCalls || [] });
});

// ── Recent tool calls across all conversations ────────────────────
app.get("/api/toolcalls/recent", (req, res) => {
  if (!checkAuth(req, res)) return;
  const user = getUserFromRequest(req);
  const prefix = user.uid + ":";
  const limit = parseInt(req.query.limit || '20', 10);
  const all = [];
  for (const [id, conv] of conversations) {
    if (!id.startsWith(prefix)) continue;
    for (const tc of (conv.toolCalls || [])) {
      all.push({ ...tc, conversationId: id });
    }
  }
  all.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  res.json({ toolCalls: all.slice(0, limit) });
});

// ── List conversations ─────────────────────────────────────────────
app.get("/api/conversations", (req, res) => {
  if (!checkAuth(req, res)) return;
  const user = getUserFromRequest(req);
  const prefix = user.uid + ":";
  const list = [];
  for (const [id, conv] of conversations) {
    // Auto-filter by user — Hermes owns this scoping
    if (!id.startsWith(prefix)) continue;
    list.push({
      id,
      title: conv.title || id,
      messageCount: conv.messages.length,
      updatedAt: conv.updatedAt,
      createdAt: conv.createdAt || conv.updatedAt,
      lastMessage: conv.messages[conv.messages.length - 1]?.content?.slice(0, 100) || "",
    });
  }
  // Sort by most recent first
  list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  res.json({ conversations: list });
});

// ── Delete conversation ──────────────────────────────────────────────
app.delete("/api/conversations/:id", (req, res) => {
  if (!checkAuth(req, res)) return;
  const user = getUserFromRequest(req);
  const scopedId = scopeConversationId(user.uid, req.params.id);
  if (conversations.has(scopedId)) {
    conversations.delete(scopedId);
    schedulePersist();
    res.json({ deleted: true });
  } else {
    res.status(404).json({ error: "Conversation not found" });
  }
});

// ── Reconnect MCP servers ────────────────────────────────────────────
app.post("/api/reconnect", async (req, res) => {
  if (!checkAuth(req, res)) return;
  const { server } = req.body || {};
  try {
    if (server) {
      await mcpHub.reconnect(server);
      res.json({ status: "ok", reconnected: server, tools: mcpHub.getStatus()[server]?.tools || 0 });
    } else {
      // Reconnect all
      await mcpHub.connectAll();
      res.json({ status: "ok", reconnected: "all", ...mcpHub.getStatus() });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Chat endpoint (Persona-compatible SSE with agent loop) ─────────
app.post("/api/chat", async (req, res) => {
  if (!checkAuth(req, res)) return;

  const { messages = [], model: reqModel, conversation_id, channel, channel_meta } = req.body;
  if (!messages.length) return res.status(400).json({ error: "messages required" });

  // User identity — Hermes owns scoping, PHP just passes the headers
  const user = getUserFromRequest(req);

  // Determine conversation ID: explicit param > header > "default"
  // Hermes handles the user prefix — PHP does NOT touch this anymore
  const rawConvId = conversation_id
    || req.headers["x-conversation-id"]
    || "default";
  const convId = scopeConversationId(user.uid, rawConvId);

  // Channel context — tells the system prompt WHERE the user is talking from
  const channelName = channel || req.headers["x-channel"] || "web";
  const channelOpts = {
    channel: channelName,
    ...(channel_meta || {}),
  };

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

  // Keepalive ping — prevents reverse proxies (Caddy, nginx, Cloudflare) from
  // killing the SSE connection during long tool calls
  const keepalive = setInterval(() => {
    if (!res.writableEnded) res.write(": keepalive\n\n");
  }, SSE_KEEPALIVE_MS);

  // AbortController — signals the agent loop to stop on client disconnect
  const abortController = new AbortController();

  // Cleanup on client disconnect
  let clientDisconnected = false;
  res.on("close", () => {
    clientDisconnected = true;
    clearInterval(keepalive);
    abortController.abort();
  });

  // Safe write — silently ignores writes after client disconnect
  function safeWrite(data) {
    if (clientDisconnected || res.writableEnded) return;
    try { res.write(data); } catch { /* client gone */ }
  }

  let fullText = "";

  try {
    const useModel = reqModel || MODEL;
    const tools = mcpHub.getAllToolsOpenAI();

    // Build conversation from shared memory (not from request body)
    const conv = getConversation(convId);
    const conversation = [
      { role: "system", content: SYSTEM_PROMPT(tools, channelOpts) },
      ...conv.messages,
    ];

    await agentLoop({
      conversation,
      tools,
      model: useModel,
      apiKey: OPENROUTER_KEY,
      mcpHub,
      signal: abortController.signal,
      onToken: (token) => {
        fullText += token;
        safeWrite(`event: step_delta\ndata: ${JSON.stringify({ text: token })}\n\n`);
      },
      onReasoning: (text) => {
        safeWrite(`event: reason_delta\ndata: ${JSON.stringify({ text })}\n\n`);
      },
      onToolCall: (name, args) => {
        const toolMsg = `\n\n🔧 *Calling tool:* \`${name}\`\n`;
        fullText += toolMsg;
        safeWrite(`event: step_delta\ndata: ${JSON.stringify({ text: toolMsg })}\n\n`);
        // Emit structured tool_start event for frontend tracking
        safeWrite(`event: tool_start\ndata: ${JSON.stringify({ tool: name, args: args || {} })}\n\n`);
        // Persist tool call start
        addToolCall(convId, name, 'running', null);
      },
      onToolResult: (name, result) => {
        const statusEmoji = result.isError ? "❌" : "✅";
        const preview = result.content?.slice(0, 150) || "done";
        const toolMsg = `${statusEmoji} *Tool result:* ${preview}\n\n`;
        fullText += toolMsg;
        safeWrite(`event: step_delta\ndata: ${JSON.stringify({ text: toolMsg })}\n\n`);
        // Emit structured tool_result event for frontend tracking
        safeWrite(`event: tool_result\ndata: ${JSON.stringify({ tool: name, status: result.isError ? 'error' : 'success', result: preview })}\n\n`);
        // Update persisted tool call with result
        const conv = getConversation(convId);
        const tc = [...conv.toolCalls].reverse().find(t => t.name === name && t.status === 'running');
        if (tc) {
          tc.status = result.isError ? 'error' : 'success';
          tc.result = preview;
        }
        schedulePersist();
      },
    });

    // Always store assistant response in shared memory (even if client disconnected)
    if (fullText) {
      appendMessage(convId, "assistant", fullText);
    }

    // Send step_complete only if client is still connected
    clearInterval(keepalive);
    if (!clientDisconnected) {
      safeWrite(`event: step_complete\ndata: ${JSON.stringify({ text: fullText, conversation_id: convId })}\n\n`);
      try { res.end(); } catch { /* already closed */ }
    }
  } catch (err) {
    clearInterval(keepalive);
    console.error("Agent loop error:", err);

    // Always persist whatever text was accumulated (partial response is better than nothing)
    if (fullText) {
      appendMessage(convId, "assistant", fullText);
    }

    if (!clientDisconnected) {
      if (!res.headersSent) {
        res.status(500).json({ error: err.message });
      } else {
        const errMsg = `\n\nSorry, an error occurred: ${err.message}`;
        safeWrite(`event: step_delta\ndata: ${JSON.stringify({ text: errMsg })}\n\n`);
        safeWrite(`event: step_complete\ndata: ${JSON.stringify({ text: fullText + errMsg, conversation_id: convId })}\n\n`);
        try { res.end(); } catch { /* already closed */ }
      }
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

  // Start health watchdog — auto-reconnects dead MCP servers
  mcpHub.startHealthWatchdog();

  const server = app.listen(PORT, () => {
    console.log(`Jada Agent Backend listening on :${PORT}`);
    console.log(`Model: ${MODEL}`);
    console.log(`Shared memory: enabled (${MAX_HISTORY} msg/conv, ${CONVERSATION_TTL_MS / 3600000}h TTL)`);
    console.log(`Timeouts: none (no cap), keepalive=${SSE_KEEPALIVE_MS / 1000}s`);
  });

  // Graceful shutdown
  for (const sig of ["SIGTERM", "SIGINT"]) {
    process.on(sig, () => {
      console.log(`Received ${sig}, shutting down...`);
      mcpHub.stopHealthWatchdog();
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 5000); // force kill after 5s
    });
  }

  // Catch unhandled rejections so process doesn't crash
  process.on("unhandledRejection", (err) => {
    console.error("Unhandled rejection:", err);
  });
}

start().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
