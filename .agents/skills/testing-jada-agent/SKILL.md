# Testing Jada Agent Backend

## Overview
The Jada Agent is an MCP-powered AI backend that connects to multiple MCP servers (Nextcloud, Composio, Kuse, Rube) and exposes a chat API with SSE streaming. It runs as a Docker container on the Hermes VPS (187.77.25.131).

## Devin Secrets Needed
- `OPENROUTER_API_KEY` — LLM API key for Qwen 3.5 Plus
- `VPS_ROOT_PASSWORD` — SSH access to Hermes VPS (187.77.25.131)
- Chat Bearer token: `jada-chat-2026` (hardcoded in server.mjs)

## Quick Health Check
```bash
curl -s https://jada-api.garzaos.online/health | python3 -m json.tool
```
Expected: `status: ok`, `tools: 347` (or similar), all 4 MCP servers connected.

## API Authentication
All `/api/*` endpoints require `Authorization: Bearer jada-chat-2026`.
- Missing/wrong token → 401 Unauthorized
- Health endpoint (`/health`) does NOT require auth

## Testing Tool-Calling (Super Agent Mode)
The key test for the system prompt is whether the model calls tools immediately instead of lecturing.

```bash
# Test: Direct Nextcloud tool call
curl -s -N -X POST https://jada-api.garzaos.online/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer jada-chat-2026" \
  -d '{"messages":[{"role":"user","content":"List the files in my root Nextcloud directory"}],"conversation_id":"test-'$(date +%s)'"}'
```

**Pass criteria:**
- SSE stream contains `step_delta` event with `🔧*Calling tool:*` followed by a `nextcloud__` tool name
- Response includes actual file/folder names from Nextcloud
- Response does NOT contain "I cannot", "I'm unable", "please go to", or "for security reasons"

**Fail criteria:**
- Model says "I cannot" or suggests manual steps
- No tool call indicator (no 🔧) in stream
- Generic explanation instead of actual results

## SSE Stream Format
The backend streams responses in Persona-compatible SSE format:
- `reason_delta` — Model's internal reasoning (thinking tokens)
- `step_delta` — Visible response content, including tool call indicators
- `step_complete` — Final aggregated response with full text

Tool calls appear as:
```
🔧*Calling tool:* `nextcloud__nc_webdav_list_directory`
✅*Tool result:* { ... truncated JSON ... }
```

## Testing Shared Memory
```bash
# Step 1: Store something
curl -s -N -X POST https://jada-api.garzaos.online/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer jada-chat-2026" \
  -d '{"messages":[{"role":"user","content":"Remember the code word: pineapple"}],"conversation_id":"memory-test"}'

# Step 2: Recall on same conversation_id
curl -s -N -X POST https://jada-api.garzaos.online/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer jada-chat-2026" \
  -d '{"messages":[{"role":"user","content":"What was the code word?"}],"conversation_id":"memory-test"}'
```
Should recall "pineapple" from server-side conversation store.

## Testing Nextcloud Mail Page
- **Gmail**: Navigate to `https://next.garzaos.online/apps/mail/box/104` — should show real emails with sender names, subjects, dates (not skeleton placeholders)
- **ProtonMail**: Navigate to `https://next.garzaos.online/apps/mail/box/2023` — may show skeleton loading if ProtonMail Bridge credentials have expired. The bridge runs on the primary VPS (${VPS_IP}) and may lose auth after crashes.
- Both accounts should be visible in the sidebar with folder structures

## Infrastructure Access
- **Hermes VPS** (187.77.25.131): SSH as root, password in `$VPS_ROOT_PASSWORD`. Hosts jada-agent-backend and jada-telegram-bot containers.
- **Primary VPS** (${VPS_IP}): Same SSH credentials. Hosts ProtonMail Bridge, various MCP servers. Containers may crash and need restart.
- **Nextcloud** (next.garzaos.online): Admin login via browser. The Jada AI chat widget (Persona v3.10.0) is injected via JSLoader on all pages.

## Common Issues
- **ProtonMail Bridge loses auth after VPS crashes** — Requires interactive re-login inside the bridge container. Ports 11143 (IMAP) and 11025 (SMTP) should be open but bridge will reject with "no such user" until re-authenticated.
- **Tool count drops below expected** — Check health endpoint. If an MCP server disconnects, tool count drops. Restart the jada-agent-backend container: `docker restart jada-agent-backend`
- **SSE stream hangs or times out** — The agent loop has a 120s timeout. If the model takes too long reasoning, the stream may appear stuck. Use `timeout 120 cat` when piping curl output.
- **Widget not visible on Nextcloud** — The Persona widget is injected via JSLoader. Check JSLoader settings in Nextcloud admin if the FAB button is missing.
- **SSH keys may get rejected** — The Hermes VPS password (`${FREESCOUT_ADMIN_PASSWORD}+`) works. SSH keys have been unreliable across sessions.
