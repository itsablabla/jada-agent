/**
 * Telegram bot for Jada AI — GARZA OS super agent.
 *
 * Key design: the bot KNOWS it's Telegram and tells the backend so the
 * system prompt adapts (concise responses, Telegram Markdown, no UI refs).
 *
 * Shares conversation memory with the Nextcloud web UI via conversation_id.
 * Each Telegram chat → "telegram-<chatId>", linkable via /link <id>.
 */
import TelegramBot from "node-telegram-bot-api";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const JADA_API_URL = process.env.JADA_API_URL || "http://localhost:3200";
const JADA_BEARER = process.env.JADA_BEARER_TOKEN || process.env.BEARER_TOKEN || "jada-chat-2026";

if (!BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN is required");
  process.exit(1);
}

// ── Bot Setup ───────────────────────────────────────────────────────
// Use polling with automatic retry on 409 conflicts.
const bot = new TelegramBot(BOT_TOKEN, {
  polling: {
    autoStart: true,
    params: { timeout: 30 },
  },
});

// Track 409 errors and retry with backoff
let conflictRetries = 0;
const MAX_CONFLICT_RETRIES = 20;

bot.on("polling_error", (err) => {
  const msg = err?.message || "";
  if (msg.includes("409") || msg.includes("Conflict")) {
    conflictRetries++;
    if (conflictRetries <= 3) {
      console.warn(`[polling] 409 conflict #${conflictRetries} — another instance is polling. Retrying...`);
    } else if (conflictRetries === MAX_CONFLICT_RETRIES) {
      console.error(`[polling] 409 conflict persists after ${MAX_CONFLICT_RETRIES} retries. The other instance may need to be stopped manually.`);
    }
    // Library auto-retries, just log it
  } else if (msg.includes("EFATAL") || msg.includes("ECONNREFUSED")) {
    console.error("[polling] Fatal error:", msg);
  }
  // Don't log every single transient error
});

// Map Telegram chatId → conversationId (default: "telegram-<chatId>")
const chatConvMap = new Map();

function getConvId(chatId) {
  return chatConvMap.get(chatId) || `telegram-${chatId}`;
}

// ── Commands ────────────────────────────────────────────────────────

bot.onText(/\/start/, (msg) => {
  const name = msg.from?.first_name || "there";
  bot.sendMessage(
    msg.chat.id,
    `Hey ${name}! 👋 I'm *Jada* — the GARZA OS AI agent.\n\n` +
      `I have direct access to your Nextcloud (files, calendar, contacts, email), ` +
      `500+ app integrations via Composio, Kuse, and more.\n\n` +
      `Just type what you need — I'll execute it.\n\n` +
      `*Commands:*\n` +
      `/status — Backend health & MCP servers\n` +
      `/link <id> — Share conversation with web UI\n` +
      `/unlink — Fresh Telegram conversation\n` +
      `/help — Show this message`,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/help/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `*Jada AI — Telegram Bot*\n\n` +
      `I'm the same agent you see in the Nextcloud web UI, but optimized for Telegram.\n\n` +
      `*What I can do:*\n` +
      `📁 Manage Nextcloud files, folders, shares\n` +
      `📅 Calendar events, contacts, tasks\n` +
      `📧 Read & send emails via ProtonMail\n` +
      `🔑 Look up passwords in Bitwarden Vault\n` +
      `🔧 500+ app integrations (GitHub, Gmail, Slack, etc.)\n` +
      `⚡ Automate workflows with Rube\n\n` +
      `Just type naturally — "list my files", "what's on my calendar today", "search passwords for AWS"`,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/link (.+)/, (msg, match) => {
  const convId = match[1].trim();
  chatConvMap.set(msg.chat.id, convId);
  bot.sendMessage(
    msg.chat.id,
    `Linked to conversation: \`${convId}\`\nI now share memory with that web session.`,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/unlink/, (msg) => {
  chatConvMap.delete(msg.chat.id);
  bot.sendMessage(msg.chat.id, "Unlinked. Using fresh Telegram conversation.");
});

bot.onText(/\/status/, async (msg) => {
  try {
    const res = await fetch(`${JADA_API_URL}/health`, {
      headers: { Authorization: `Bearer ${JADA_BEARER}` },
    });
    const data = await res.json();
    const servers = Object.entries(data.mcpServers || {})
      .map(
        ([name, info]) =>
          `  ${info.status === "connected" ? "✅" : "❌"} ${name}: ${info.tools || 0} tools`
      )
      .join("\n");
    const totalTools = data.tools || Object.values(data.mcpServers || {}).reduce((s, i) => s + (i.tools || 0), 0);
    bot.sendMessage(
      msg.chat.id,
      `⚡ *Hermes Backend*\n` +
        `Model: \`${data.model || "unknown"}\`\n` +
        `Tools: ${totalTools}\n` +
        `Conversations: ${data.conversations || 0}\n\n` +
        `*MCP Servers:*\n${servers}`,
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    bot.sendMessage(msg.chat.id, `❌ Backend unreachable: ${err.message}`);
  }
});

// ── Message Handler ─────────────────────────────────────────────────

bot.on("message", async (msg) => {
  if (msg.text?.startsWith("/")) return;

  const chatId = msg.chat.id;
  const convId = getConvId(chatId);

  // Determine what the user sent — text, voice, photo, or document
  let userText = msg.text || "";
  let mediaCaption = msg.caption || "";

  // ── Voice / Audio ──────────────────────────────────────────────
  if (msg.voice || msg.audio) {
    const fileId = (msg.voice || msg.audio).file_id;
    const duration = (msg.voice || msg.audio).duration || 0;
    bot.sendChatAction(chatId, "typing");
    try {
      const fileUrl = await bot.getFileLink(fileId);
      // Ask the agent to transcribe and handle the voice memo
      userText =
        `[Voice memo received — ${duration}s duration]\n` +
        `Audio file URL: ${fileUrl}\n` +
        (mediaCaption ? `Caption: ${mediaCaption}\n` : "") +
        `Please download this audio, upload it to Nextcloud under /Telegram Media/, ` +
        `transcribe it, and respond to the content.`;
    } catch (err) {
      bot.sendMessage(chatId, `❌ Could not fetch voice file: ${err.message}`);
      return;
    }
  }

  // ── Photo ──────────────────────────────────────────────────────
  else if (msg.photo && msg.photo.length > 0) {
    // Telegram sends multiple sizes — pick the largest
    const photo = msg.photo[msg.photo.length - 1];
    bot.sendChatAction(chatId, "typing");
    try {
      const fileUrl = await bot.getFileLink(photo.file_id);
      userText =
        `[Photo received — ${photo.width}x${photo.height}]\n` +
        `Image URL: ${fileUrl}\n` +
        (mediaCaption ? `Caption: ${mediaCaption}\n` : "") +
        `Please download this image, upload it to Nextcloud under /Telegram Media/, ` +
        `and describe or process the content as appropriate.`;
    } catch (err) {
      bot.sendMessage(chatId, `❌ Could not fetch photo: ${err.message}`);
      return;
    }
  }

  // ── Document / File ────────────────────────────────────────────
  else if (msg.document) {
    const doc = msg.document;
    bot.sendChatAction(chatId, "typing");
    try {
      const fileUrl = await bot.getFileLink(doc.file_id);
      userText =
        `[Document received — "${doc.file_name || "file"}", ${doc.file_size || 0} bytes, MIME: ${doc.mime_type || "unknown"}]\n` +
        `File URL: ${fileUrl}\n` +
        (mediaCaption ? `Caption: ${mediaCaption}\n` : "") +
        `Please download this file, upload it to Nextcloud under /Telegram Media/, ` +
        `and summarize or process it as appropriate.`;
    } catch (err) {
      bot.sendMessage(chatId, `❌ Could not fetch document: ${err.message}`);
      return;
    }
  }

  // ── Sticker / Other unsupported types ──────────────────────────
  else if (!userText) {
    bot.sendMessage(chatId, "I can handle text, voice memos, photos, and documents. Try sending one of those!");
    return;
  }

  bot.sendChatAction(chatId, "typing");

  try {
    const response = await fetch(`${JADA_API_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${JADA_BEARER}`,
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: userText }],
        conversation_id: convId,
        channel: "telegram",
        channel_meta: {
          username: msg.from?.username || undefined,
          chatTitle: msg.chat.title || msg.from?.first_name || undefined,
          chatType: msg.chat.type,
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      bot.sendMessage(chatId, `❌ Error ${response.status}: ${err.slice(0, 200)}`);
      return;
    }

    // Read SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = "";
    let buffer = "";
    let currentEvent = "";

    const typingInterval = setInterval(() => {
      bot.sendChatAction(chatId, "typing");
    }, 4000);

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (currentEvent === "step_complete" && data.text) {
                fullText = data.text;
              } else if (currentEvent === "step_delta" && data.text) {
                fullText += data.text;
              }
            } catch {
              // skip malformed JSON
            }
          }
        }
      }
    } finally {
      clearInterval(typingInterval);
    }

    // Light cleanup of any tool markers that leaked through
    let cleanText = fullText
      .replace(/🔧 \*Calling tool:\* `[^`]+`\n?/g, "")
      .replace(/[✅❌] \*Tool result:\* [^\n]*\n?\n?/g, "")
      .trim();

    if (!cleanText) {
      cleanText = "Done. (tools executed, no text output)";
    }

    await sendTelegramMessage(chatId, cleanText);
  } catch (err) {
    console.error("Error processing message:", err);
    bot.sendMessage(chatId, `❌ Error: ${err.message}`);
  }
});

/**
 * Send a message to Telegram, handling the 4096 char limit and
 * falling back from Markdown to plain text if parsing fails.
 */
async function sendTelegramMessage(chatId, text) {
  const MAX_LEN = 4000;

  if (text.length <= MAX_LEN) {
    await bot.sendMessage(chatId, text, { parse_mode: "Markdown" }).catch(() => {
      bot.sendMessage(chatId, text);
    });
    return;
  }

  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= MAX_LEN) {
      chunks.push(remaining);
      break;
    }
    let splitIdx = remaining.lastIndexOf("\n\n", MAX_LEN);
    if (splitIdx < MAX_LEN / 2) {
      splitIdx = remaining.lastIndexOf("\n", MAX_LEN);
    }
    if (splitIdx < MAX_LEN / 2) {
      splitIdx = MAX_LEN;
    }
    chunks.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx).trimStart();
  }

  for (const chunk of chunks) {
    await bot.sendMessage(chatId, chunk, { parse_mode: "Markdown" }).catch(() => {
      bot.sendMessage(chatId, chunk);
    });
  }
}

// ── Startup ─────────────────────────────────────────────────────────

console.log("Jada Telegram Bot started");
console.log(`  Backend: ${JADA_API_URL}`);
console.log(`  Channel: telegram (agent is Telegram-aware)`);
console.log(`  Shared memory: enabled (conversation_id per chat)`);
console.log(`  Mode: long-polling`);

// Graceful shutdown
for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    console.log(`Received ${sig}, stopping Telegram bot...`);
    bot.stopPolling();
    process.exit(0);
  });
}

process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err);
});
