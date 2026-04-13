# Testing Jada Agent — Nextcloud AI Chat App

## Overview

Jada Agent is a Nextcloud app providing a native AI chat interface powered by the Hermes Agent backend (native Nous Research framework). It connects to 1 active MCP server (Nextcloud) with 118 tools. Model: Gemini 2.5 Flash via direct Google API.

## Devin Secrets Needed

- **VPS_ROOT_PASSWORD** — SSH access to the Nextcloud VPS (83.228.213.100) for deploying code changes
- **VPS_IP** — IP address of the Nextcloud VPS
- SSH key at `~/.ssh/nc_rsa` — for `ubuntu@83.228.213.100` access

## Live App URLs

- **App:** `https://next.garzaos.online/apps/jadaagent/`
- **Admin Account:** Logged in as "Jaden" (admin user)
- **Backend Health:** `https://next.garzaos.online/apps/jadaagent/api/health`

## Architecture

### Hermes Agent Backend
- Runs as `hermes-agent` Docker container on 83.228.213.100
- Internal port 3100, external port 3200
- Native Nous Research Hermes framework (NOT a custom agent loop)
- Built-in context compression, tool execution, MCP support
- OpenAI-compatible API: `/v1/chat/completions` with SSE streaming
- PHP proxy at `/apps/jadaagent/api/*` forwards to Hermes via curl
- PHP is a thin auth pipe — only forwards `X-Nextcloud-User` header

### LLM Model
- **Active:** Gemini 2.5 Flash (direct Google API, key in `/opt/hermes-agent/.env`)
- **Fallback:** Qwen via OpenRouter (configured but not primary)
- Prompt caching: 1st request ~3.8s, subsequent ~1.35s (3x improvement)
- Prompt tokens per request: ~28K (with 118 tools)

### MCP Servers (1 active, 118 tools)
- **Nextcloud** (118 tools): Files, calendar, contacts, notes, deck, tables, cookbook, news, collectives
- **Composio** (disabled): Was adding 122 tool schemas to every prompt for no benefit
- **Proton-Unified** (disabled): Was returning 502 Bad Gateway, adding 63 tool schemas
- Config: `/opt/hermes-agent/config.yaml` on the live server

### SSE Streaming
- Frontend consumes OpenAI-format Server-Sent Events:
  - `choices[0].delta.content` — text chunks from the model
  - `hermes.tool.progress` — tool call status updates
  - `[DONE]` — stream complete
- Tool results are NOT included in chat text — only the model's formatted markdown

## Key DOM Elements

### Chat UI
- Textarea: `placeholder="Message Jada about Nextcloud..."`
- Send button: enabled when textarea has text AND not loading
- New Chat button: `+ New Chat` at top of sidebar
- Suggestion buttons: "List my Nextcloud files", "Check my calendar", etc.
- Status bar (bottom-left): Shows "1 servers · 118 tools"
- Footer (below textarea): Shows "Gemini 2.5 Flash · 118 tools · Workspace: Nextcloud"

### Right Panel (Tools/Files/Context tabs)
- MCP Servers section: Green dot for Nextcloud, tool count 118
- Recent Tool Calls section: Shows tool name, ✅/❌/⏳ status, timestamp
- Context tab: Shows "Total Tools: 118", "Agent Status: Online"

### Settings Page
- Settings > MCP Servers: Shows "Total: 118 tools across 1 servers" with only Nextcloud listed
- Settings > General: Backend URL `http://172.18.0.1:3200`, API Token masked

### Sidebar (Conversations)
- Conversations listed under "Today" with title preview
- Clicking a conversation loads full message history from localStorage
- Conversations persist across page reloads (localStorage with `jada_conv_*` keys)

## Health Data Verification

The health endpoint returns model name and tool counts. All 6 UI locations should match:
1. Greeting text: "N tools across M servers"
2. Footer: "Model Name · N tools · Workspace: Name"
3. Sidebar status: "M servers · N tools"
4. Right panel MCP Servers: Server names with tool counts
5. Context tab: "Total Tools: N"
6. Settings > MCP Servers: "Total: N tools across M servers"

If any location shows different values, the JS bundle may be stale (needs version bump + cache bust).

## Testing Procedures

### 1. Short Response (No Tools)
- New chat → type "What is 2+2?" → press Enter
- Expected: Text-only response "4" in ~2 seconds, zero tool call icons, right panel unchanged
- Verifies: SSE streaming path works independently of tool calls
- Performance baseline: curl to Hermes directly should complete in <2s

### 2. Single Tool Call (Nextcloud Files)
- New chat → click "List my Nextcloud files" suggestion button
- Expected: Tool call `mcp_nextcloud_nc_webdav_list_directory` fires, ✅ icon appears, response shows ~45 folders in clean markdown, right panel shows new ✅ entry
- Verifies: MCP tool execution, right panel real-time updates, no raw JSON in chat

### 3. Calendar Tool Call
- Same conversation → type "What's on my calendar this week?"
- Expected: Multiple calendar tool calls, markdown table response
- Verifies: Multi-tool orchestration, conversation continuity

### 4. Multi-Tool Long Response
- New chat → "Give me a complete overview: list my files, check my calendar, show my contacts, and list my deck boards"
- Expected: 4+ tool calls, long markdown response with sections, completes without truncation
- Verifies: Context compression handles large responses, no timeout

### 5. Conversation Continuity
- Same conversation as Test 4 → "How many folders were in that list?"
- Expected: Agent responds from memory with correct count (~45 folders)
- Verifies: Conversation persistence in localStorage, Hermes user scoping

### 6. Right Panel Persistence
- After tests → reload page → check right panel + sidebar
- Expected: Tool calls survive reload with correct ✅/❌ status, conversations appear in sidebar
- Verifies: localStorage persistence, conversation loading

### 7. Error Handling
- New chat → "List my cookbook recipes and news feeds"
- Expected: Tools return 404 (apps not installed), ❌ icons in right panel, agent explains failure in natural language
- Verifies: Error handling path — no raw error JSON in chat

### Performance Benchmarking
```bash
# Direct Hermes TTFB measurement
ssh -i ~/.ssh/nc_rsa ubuntu@83.228.213.100 'curl -s -o /dev/null -w "TTFB: %{time_starttransfer}s\nTotal: %{time_total}s\n" -X POST http://localhost:3200/v1/chat/completions -H "Content-Type: application/json" -H "Authorization: Bearer jada-chat-2026" -H "X-Nextcloud-User: admin" -d "{\"model\":\"gemini-2.5-flash\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"stream\":true}"'
# Expected: Total < 4s (cold), < 2s (cached)
```

## Deployment

### SSH Access
- SSH: `ssh -i ~/.ssh/nc_rsa ubuntu@83.228.213.100`
- Key-based auth — the SSH key works with `ubuntu@` (NOT `root@`)

### Deploying Frontend/PHP Changes
IMPORTANT: Never use `docker cp /dev/stdin` — it creates a symlink to `/proc/self/fd/0` instead of writing file contents.

```bash
# 1. SCP file to host /tmp first
scp -i ~/.ssh/nc_rsa path/to/file ubuntu@83.228.213.100:/tmp/filename

# 2. Docker cp from /tmp into container
ssh -i ~/.ssh/nc_rsa ubuntu@83.228.213.100 'sudo docker cp /tmp/filename nextcloud-aio-nextcloud:/var/www/html/custom_apps/jadaagent/path/to/file'

# 3. Bump version in appinfo/info.xml for JS cache bust
# 4. Run php occ upgrade inside the container
ssh -i ~/.ssh/nc_rsa ubuntu@83.228.213.100 'sudo docker exec -u www-data nextcloud-aio-nextcloud php occ upgrade'
```

### Deploying Hermes Config Changes
```bash
# Config is at /opt/hermes-agent/config.yaml on the host
ssh -i ~/.ssh/nc_rsa ubuntu@83.228.213.100 'sudo docker restart hermes-agent'
```

### Verifying Deployment
```bash
# Check backend health
curl -s https://next.garzaos.online/apps/jadaagent/api/health | python3 -m json.tool

# Verify Hermes is running with correct model
ssh -i ~/.ssh/nc_rsa ubuntu@83.228.213.100 'sudo docker logs hermes-agent --tail 20 2>&1'

# Check JS cache version (should change after version bump)
# Look for ?v= parameter in page source
```

## Common Issues

1. **Stale JS bundle** — If UI shows old values (e.g., "303 tools"), bump `appinfo/info.xml` version and run `php occ upgrade`. Nextcloud aggressively caches JS bundles.
2. **Hermes MCP servers disconnected on restart** — After `docker restart hermes-agent`, MCP servers may take 10-30s to reconnect. Check with `/api/health`.
3. **Notes are locked** — `nc_notes_get_note` calls may fail with "Locked" if notes are open elsewhere. Agent should fall back to WebDAV file reads.
4. **Enter key sends message** — Unlike older versions, Enter now sends. Shift+Enter for newline.
5. **docker cp /dev/stdin creates symlinks** — NEVER use this pattern. Always scp to host /tmp first, then docker cp from /tmp.
6. **Composio/Proton-Unified disabled** — These are disabled in config.yaml for performance. Can be re-enabled when those services come back online. Re-enabling adds ~30K tokens to every prompt.
7. **Old conversations show raw JSON** — Expected for conversations created before PR #16. Only new conversations benefit from the fix.
8. **Prompt caching cold start** — First request after restart takes ~3.8s. Subsequent requests ~1.35s due to Gemini's automatic prompt caching.
