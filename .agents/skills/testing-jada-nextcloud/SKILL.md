# Testing Jada AI Nextcloud App

Guide for E2E testing the Jada AI native Nextcloud app on the live deployment.

## Devin Secrets Needed

- SSH key at `~/.ssh/nc_rsa` — for `ubuntu@83.228.213.100` access
- No Nextcloud app password needed if testing via browser (admin is already logged in)

## Infrastructure

| Component | Location | Notes |
|-----------|----------|-------|
| Nextcloud UI | https://next.garzaos.online/apps/jadaagent/ | Admin login: "Jaden" (admin user) |
| Local Hermes backend | 83.228.213.100 container `hermes-agent` port 3200 | Nextcloud connects via `http://172.18.0.1:3200` |
| Hermes config | `/opt/hermes-agent/config.yaml` on host | MCP servers, model, providers |
| Hermes env | `/opt/hermes-agent/.env` on host | API keys (GOOGLE_API_KEY, OPENROUTER_API_KEY) |
| Conversations | localStorage in browser (`jada_conv_*` keys) | Client-side persistence |

## Key API Endpoints

### Via Nextcloud proxy (requires Nextcloud auth or browser session)
```bash
# Health check (returns model_name, tool_count, server info)
curl -s -u "admin:${NEXTCLOUD_APP_PASSWORD}" -H "OCS-APIRequest: true" \
  "https://next.garzaos.online/apps/jadaagent/api/health"

# List conversations
curl -s -u "admin:${NEXTCLOUD_APP_PASSWORD}" -H "OCS-APIRequest: true" \
  "https://next.garzaos.online/apps/jadaagent/api/conversations"
```

### Via Hermes directly (Bearer token auth, from the server)
```bash
# Health check
ssh -i ~/.ssh/nc_rsa ubuntu@83.228.213.100 'curl -s http://localhost:3200/health'

# Chat completion (OpenAI-compatible)
ssh -i ~/.ssh/nc_rsa ubuntu@83.228.213.100 'curl -s -X POST http://localhost:3200/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer jada-chat-2026" \
  -H "X-Nextcloud-User: admin" \
  -d "{\"model\":\"gemini-2.5-flash\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"stream\":true}"'
```

## Testing Checklist

### 1. Health Display Verification
- Navigate to https://next.garzaos.online/apps/jadaagent/
- Check ALL 6 locations show consistent data:
  1. Greeting: "N tools across M servers"
  2. Footer: "Model Name · N tools · Workspace: Name"
  3. Sidebar status: "M servers · N tools"
  4. Right panel MCP Servers tab: Server names + counts
  5. Right panel Context tab: "Total Tools: N"
  6. Settings > MCP Servers: "Total: N tools across M servers"
- Current expected values: Gemini 2.5 Flash / 118 tools / 1 server (Nextcloud)

### 2. Conversation Continuity
- Click "+ New Chat"
- Send a message that triggers a tool call (e.g., "List my Nextcloud files")
- Wait for response — should show tool call and formatted result
- Reload page (F5)
- Click the conversation in sidebar — messages should reload
- Send a follow-up referencing the first message
- **Pass**: Agent retains context and references previous data
- **Fail**: Agent says "I don't have context" or creates a new conversation

### 3. Performance Verification
```bash
# Measure TTFB directly against Hermes
ssh -i ~/.ssh/nc_rsa ubuntu@83.228.213.100 'curl -s -o /dev/null -w "TTFB: %{time_starttransfer}s\nTotal: %{time_total}s\n" -X POST http://localhost:3200/v1/chat/completions -H "Content-Type: application/json" -H "Authorization: Bearer jada-chat-2026" -H "X-Nextcloud-User: admin" -d "{\"model\":\"gemini-2.5-flash\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"stream\":true}"'
```
- Expected: Total < 4s cold, < 2s cached
- Old baseline (Qwen 3.5 Plus + 303 tools): 5.95s+

### 4. Tool Call Display
- After sending a message that triggers a tool call
- Right panel "Recent Tool Calls" should show the tool name with ✅
- The chat area should show formatted markdown (no raw JSON)
- Failed tools show ❌ in the right panel

## Common Pitfalls

1. **SSH access to 83.228.213.100** — Use `ssh -i ~/.ssh/nc_rsa ubuntu@83.228.213.100`. Key-based auth only.

2. **Brief "Hello, User" / "0 tools" flash on page load** — The UI briefly shows defaults before the health check completes (~1-3 seconds). This is a known minor UX issue.

3. **Stale JS cache** — If the UI shows old values after a code deploy, the version in `appinfo/info.xml` needs bumping and `php occ upgrade` needs to run inside the Nextcloud container.

4. **CSRF on Nextcloud API calls** — Always include `-H "OCS-APIRequest: true"` header when calling Nextcloud proxy endpoints via curl.

5. **docker cp /dev/stdin creates symlinks** — NEVER use `docker cp /dev/stdin`. Always scp to host /tmp first, then docker cp from /tmp.

6. **Composio and Proton-Unified are disabled** — These MCP servers are disabled in config.yaml for performance (eliminated 185 unused tool schemas from every prompt). They can be re-enabled in `/opt/hermes-agent/config.yaml` when those upstream services are operational.

7. **Prompt caching** — Gemini 2.5 Flash has automatic prompt caching. First request after restart is slower (~3.8s), subsequent requests use cache (~1.35s). This is expected behavior, not a bug.
