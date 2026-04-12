/**
 * Telegram bot that routes messages through the Jada Agent Backend.
 * Shares the same conversation memory as the web widget via conversation_id.
 *
 * Each Telegram chat gets a conversation_id like "telegram-<chatId>",
 * but the user can also link their widget session via /link <id>.
 */
import TelegramBot from "node-telegram-bot-api";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const JADA_API_URL = process.env.JADA_API_URL || "http://jada-agent-backend:3100";
const JADA_BEARER = process.env.JADA_BEARER_TOKEN || "jada-chat-2026";

if (!BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN is required");
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Map Telegram chatId to conversationId (default: "telegram-<chatId>")
const chatConvMap = new Map();

function getConvId(chatId) {
  return chatConvMap.get(chatId) || `telegram-${chatId}`;
}

// /start command
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "Hey! I'm Jada, the GARZA OS AI assistant. I can manage your Nextcloud files, calendar, contacts, and more.\n\nJust send me a message and I'll use my tools to get it done.\n\n*Commands:*\n/link <id> — Link to a web widget conversation\n/unlink — Use a fresh Telegram conversation\n/status — Check backend health",
    { parse_mode: "Markdown" }
  );
});

// /link command — share conversation with widget
bot.onText(/\/link (.+)/, (msg, match) => {
  const convId = match[1].trim();
  chatConvMap.set(msg.chat.id, convId);
  bot.sendMessage(msg.chat.id, `Linked to conversation: \`${convId}\`\nI now share memory with that widget session.`, {
    parse_mode: "Markdown",
  });
});

// /unlink command
bot.onText(/\/unlink/, (msg) => {
  chatConvMap.delete(msg.chat.id);
  bot.sendMessage(msg.chat.id, "Unlinked. Using fresh Telegram conversation.");
});

// /status command
bot.onText(/\/status/, async (msg) => {
  try {
    const res = await fetch(`${JADA_API_URL}/health`);
    const data = await res.json();
    const servers = Object.entries(data.mcpServers || {})
      .map(([name, info]) => `  ${info.status === "connected" ? "✓" : "✗"} ${name}: ${info.tools || 0} tools`)
      .join("\n");
    bot.sendMessage(
      msg.chat.id,
      `*Backend Status*\nModel: ${data.model}\nTools: ${data.tools}\nConversations: ${data.conversations}\n\n*MCP Servers:*\n${servers}`,
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    bot.sendMessage(msg.chat.id, `Backend unreachable: ${err.message}`);
  }
});

// Handle regular messages — route through Jada backend
bot.on("message", async (msg) => {
  // Skip commands
  if (msg.text?.startsWith("/")) return;
  if (!msg.text) return;

  const chatId = msg.chat.id;
  const convId = getConvId(chatId);

  // Send "typing" indicator
  bot.sendChatAction(chatId, "typing");

  try {
    const response = await fetch(`${JADA_API_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${JADA_BEARER}`,
        "X-Conversation-Id": convId,
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: msg.text }],
        conversation_id: convId,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      bot.sendMessage(chatId, `Error: ${response.status} — ${err}`);
      return;
    }

    // Read SSE stream and collect the full response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = "";
    let buffer = "";

    // Send typing every 4s while processing
    const typingInterval = setInterval(() => {
      bot.sendChatAction(chatId, "typing");
    }, 4000);

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // keep incomplete line

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              // Only accumulate from step_delta; step_complete contains the full text
              // which would duplicate everything. step_complete includes conversation_id.
              if (data.text && !data.conversation_id) fullText += data.text;
            } catch {
              // skip malformed JSON
            }
          }
        }
      }
    } finally {
      clearInterval(typingInterval);
    }

    // Clean up tool indicators for Telegram (keep it readable)
    let cleanText = fullText
      .replace(/🔧 \*Calling tool:\* `[^`]+`\n?/g, "")
      .replace(/[✅❌] \*Tool result:\* [^\n]*\n?\n?/g, "")
      .trim();

    if (!cleanText) {
      cleanText = "Done. (tools executed but no text response)";
    }

    // Telegram has a 4096 char limit per message
    if (cleanText.length > 4000) {
      const chunks = cleanText.match(/.{1,4000}/gs) || [cleanText];
      for (const chunk of chunks) {
        await bot.sendMessage(chatId, chunk, { parse_mode: "Markdown" }).catch(() => {
          // Fallback without markdown if parsing fails
          bot.sendMessage(chatId, chunk);
        });
      }
    } else {
      await bot.sendMessage(chatId, cleanText, { parse_mode: "Markdown" }).catch(() => {
        bot.sendMessage(chatId, cleanText);
      });
    }
  } catch (err) {
    console.error("Error processing message:", err);
    bot.sendMessage(chatId, `Sorry, something went wrong: ${err.message}`);
  }
});

console.log("Jada Telegram Bot started — routing through Jada Agent Backend");
console.log(`Backend: ${JADA_API_URL}`);
console.log("Shared memory: enabled (conversation_id per chat)");
