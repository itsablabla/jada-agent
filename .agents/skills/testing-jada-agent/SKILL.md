# Testing Jada Agent — Nextcloud AI Chat App

## Overview

Jada Agent is a Nextcloud app providing a native AI chat interface powered by the Hermes backend (Node.js MCP agent server). It connects to 3 MCP servers with 303+ tools across Nextcloud, Proton-Unified, and Composio.

## Devin Secrets Needed

- **VPS_ROOT_PASSWORD** — SSH access to the Nextcloud VPS (83.228.213.100) for deploying code changes
- **VPS_IP** — IP address of the Nextcloud VPS

## Live App URLs

- **App:** `https://next.garzaos.online/apps/jadaagent/`
- **Admin Account:** Logged in as "Jaden" (admin user)
- **Backend Health:** `https://next.garzaos.online/apps/jadaagent/api/health`

## Architecture

### Hermes Backend (replaces OpenClaw)
- Runs as `hermes-backend` Docker container on 83.228.213.100
- Internal port 3100, external port 3200
- PHP proxy at `/apps/jadaagent/api/*` forwards to Hermes via curl
- Hermes owns ALL user scoping, conversation state, and tool call tracking
- PHP is a thin auth pipe — only forwards `X-Nextcloud-User` header

### MCP Servers (3 servers, 303+ tools)
- **Composio** (7 tools): Meta-tools for search, execute, bash, connections
- **Proton-Unified** (178 tools): Mail, drive, iCloud, beeper, fabric + wraps Nextcloud tools via bridge
- **Nextcloud** (118 tools): Files, calendar, contacts, notes, deck, tables, cookbook, news, collectives

### SSE Streaming
- Frontend consumes Server-Sent Events with structured event types:
  - `step_delta` — text chunks from the model
  - `tool_start` — tool call initiated (shows ⏳ in right panel)
  - `tool_result` — tool call completed (shows ✅ or ❌)
  - `step_complete` — model finished generating
- Tool results are NOT included in chat text — only the model's formatted markdown is stored

## Key DOM Elements

### Chat UI
- Textarea: `placeholder="Message Jada about Nextcloud..."`
- Send button: enabled when textarea has text AND not loading
- New Chat button: `+ New Chat` at top of sidebar
- Suggestion buttons: "List my Nextcloud files", "Check my calendar", etc.
- Status bar: Shows "3 servers · 303 tools" at bottom

### Right Panel (Tools/Files/Context tabs)
- MCP Servers section: Green dots for connected, tool counts per server
- Recent Tool Calls section: Shows tool name, ✅/❌/⏳ status, timestamp
- Tool calls persist across page reloads (loaded from `/api/toolcalls/recent`)

### Sidebar (Conversations)
- Conversations listed under "Today" with title preview
- Clicking a conversation loads full message history
- Conversations persist across page reloads (stored in `/data/conversations.json`)

## API Endpoints

- `POST /apps/jadaagent/api/chat` — Send chat message (SSE streaming response)
- `GET /apps/jadaagent/api/conversations` — List user's conversations
- `GET /apps/jadaagent/api/conversations/:id` — Get conversation messages
- `DELETE /apps/jadaagent/api/conversations/:id` — Delete conversation
- `GET /apps/jadaagent/api/health` — Backend health + MCP server status
- `GET /apps/jadaagent/api/toolcalls/recent` — Recent tool calls for right panel
- `POST /apps/jadaagent/api/reconnect` — Reconnect MCP servers

## Testing Procedures

### 1. Short Response (No Tools)
- New chat → type "What is 2+2?" → press Enter
- Expected: Text-only response "4" in ~2 seconds, zero tool call icons, right panel unchanged
- Verifies: SSE `step_delta` path works independently of tool calls

### 2. Single Tool Call (Nextcloud Files)
- New chat → click "List my Nextcloud files" suggestion button
- Expected: Tool call `nextcloud__nc_webdav_list_directory` fires, ✅ icon appears, response shows ~42 folders in clean markdown, right panel shows new ✅ entry
- Verifies: Raw JSON elimination (PR #16), right panel real-time updates

### 3. Calendar Tool Call
- Same conversation → type "What's on my calendar this week?"
- Expected: Multiple calendar tool calls (list + events per calendar), markdown table response
- Verifies: Multi-tool orchestration within Nextcloud server, conversation continuity

### 4. Cross-Server Query (Proton)
- New chat → "Show me my Proton Drive stats"
- Expected: `proton-unified__drive_stats` fires. If Proton Bridge is up: real data. If down: ❌ icon + natural language error explanation
- Note: Proton Bridge may be intermittently down — this is an external dependency, not a Jada bug

### 5. Multi-Tool Long Response
- New chat → "Give me a complete overview: list my files, check my calendar, show my contacts, and list my deck boards"
- Expected: 4+ tool calls across servers, long markdown response with sections, completes without truncation or timeout
- Verifies: No timeout caps (PR #12), multi-server orchestration, reconnect lock (PR #14)

### 6. Conversation Continuity
- Same conversation as Test 5 → "How many folders were in that list?"
- Expected: Agent responds from memory with correct count (~44 folders), no "I don't have context" error
- Verifies: Conversation persistence, Hermes user scoping (PR #15), no double-prefix bug

### 7. Right Panel Persistence
- After tests → reload page → check right panel + sidebar
- Expected: Tool calls survive reload with correct ✅/❌ status, conversations appear in sidebar
- Verifies: Tool call persistence to disk (PR #13), conversation file storage

### 8. Error Handling
- New chat → "List my cookbook recipes and news feeds"
- Expected: Tools return 404 (apps not installed), ❌ icons in right panel, agent explains failure in natural language
- Verifies: Error handling path — no raw error JSON in chat

## Deployment

### SSH Access
- SSH to `ubuntu@83.228.213.100` (use VPS_ROOT_PASSWORD via sudo)
- Key-based auth — the SSH key works with `ubuntu@` (NOT `root@`)

### Deploying Backend Changes
```bash
ssh ubuntu@83.228.213.100
sudo docker exec -it hermes-backend sh
cd /app && git pull origin main
exit
sudo docker restart hermes-backend
```

### Deploying Frontend/PHP Changes
The Nextcloud app files are inside the `nextcloud-aio-nextcloud` Docker container:
```bash
ssh ubuntu@83.228.213.100
sudo docker exec -it nextcloud-aio-nextcloud bash
cd /var/www/html/custom_apps/jadaagent
git pull origin main
exit
```
Note: PHP opcache may need clearing. Bump version in `appinfo/info.xml` to bust JS cache.

### Verifying Deployment
```bash
# Check backend health
curl -s https://next.garzaos.online/apps/jadaagent/api/health | python3 -m json.tool

# Verify specific fix is deployed (grep for unique strings)
sudo docker exec hermes-backend grep 'YOUR_UNIQUE_STRING' /app/server.mjs
```

## Common Issues

1. **Proton-Unified tools return connection refused** — Proton Bridge upstream at `mcp.garzaos.cloud` may be down. Not a Jada bug. Check with: `curl -s https://mcp.garzaos.cloud/health`
2. **Right panel shows "No recent tool calls"** — Verify `/api/toolcalls/recent` endpoint returns data. May need Hermes restart.
3. **Old conversations show raw JSON** — Expected for conversations created before PR #16. Only new conversations benefit from the fix.
4. **Chat body shows 🔧 for failed tools** — Known minor visual issue. Right panel correctly shows ❌. The chat message body doesn't update tool icons to error state.
5. **Duplicate tool calls in error recovery** — Agent may retry failed tools multiple times (e.g., 13 calls for a simple query). System prompt partially prevents this but not fully during fallback rounds.
6. **Notes are locked** — `nc_notes_get_note` calls may fail with "Locked" if notes are open elsewhere. Agent should fall back to WebDAV file reads.
7. **Enter key sends message** — Unlike older versions, Enter now sends. Shift+Enter for newline.
8. **App uses XMLHttpRequest** — NOT fetch. If instrumenting network calls, hook into `XMLHttpRequest.prototype`.
