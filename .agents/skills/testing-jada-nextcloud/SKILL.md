# Testing Jada AI Nextcloud App

Guide for E2E testing the Jada AI native Nextcloud app on the live deployment.

## Devin Secrets Needed

- `NEXTCLOUD_APP_PASSWORD` — Nextcloud admin app password for API auth
- SSH key file at `~/attachments/.../id_rsa` — provided per-session by user for server access to 83.228.213.100

## Infrastructure

| Component | Location | Notes |
|-----------|----------|-------|
| Nextcloud UI | https://next.garzaos.online/apps/jadaagent/ | Admin login: admin / `${NEXTCLOUD_APP_PASSWORD}` |
| Local Hermes backend | 83.228.213.100 container `hermes-backend` port 3200 | The Nextcloud app connects via `http://172.18.0.1:3200` |
| External Hermes API | https://jada-api.garzaos.online | On 187.77.25.131 — may have STALE config; the Nextcloud app uses the LOCAL backend |
| Telegram bot | Container `jada-telegram-bot` on 83.228.213.100 | Token changes frequently — check with user |
| Conversations on disk | `/data/conversations.json` inside `hermes-backend` container | File-based persistence with 2s debounce |

## Key API Endpoints

### Via Nextcloud proxy (requires Nextcloud auth)
```bash
# List conversations (requires OCS header to bypass CSRF)
curl -s -u "admin:${NEXTCLOUD_APP_PASSWORD}" -H "OCS-APIRequest: true" \
  "https://next.garzaos.online/apps/jadaagent/api/conversations"

# Send a chat message
curl -s -u "admin:${NEXTCLOUD_APP_PASSWORD}" -H "OCS-APIRequest: true" \
  -X POST -H "Content-Type: application/json" \
  -d '{"message": "List my files"}' \
  "https://next.garzaos.online/apps/jadaagent/api/chat"
```

### Via Hermes directly (Bearer token auth)
```bash
curl -s -H "Authorization: Bearer jada-chat-2026" \
  "https://jada-api.garzaos.online/health"
# Returns: {status, mcpServers: {name: {status, tools}}, tools: N, conversations: N}
```

## Testing Checklist

### 1. MCP Config Verification
- Navigate to https://next.garzaos.online/apps/jadaagent/
- Check status bar (bottom-left) for correct server count and tool count
- Check right panel "MCP Servers" section for correct server names and tool counts
- The greeting should show the correct tool count

### 2. Conversation Continuity
- Click "+ New Chat"
- Send a message that triggers a tool call (e.g., "List my Nextcloud files")
- Wait for response — should show tool call and formatted result
- Navigate away (click Files or another Nextcloud app)
- Navigate back to Jada Agent
- Wait ~5 seconds for conversations to load in sidebar
- Click the conversation in sidebar — messages should reload
- Send a follow-up referencing the first message
- **Pass**: Agent retains context and references previous data
- **Fail**: Agent says "I don't have context" or creates a new conversation

### 3. Disk Verification (Double-Prefix Bug)
```bash
# Check for double-prefix conversation IDs
curl -s -u "admin:${NEXTCLOUD_APP_PASSWORD}" -H "OCS-APIRequest: true" \
  "https://next.garzaos.online/apps/jadaagent/api/conversations" | \
  python3 -c "
import json, sys
data = json.loads(sys.stdin.read())
ids = [c['id'] for c in data]
double = [i for i in ids if i.count('admin:') > 1]
print(f'Double-prefix: {len(double)} {\"NONE\" if not double else double}')
"
```
- New conversations should have format `admin:conv-{timestamp}` (single prefix)
- Legacy conversations with `admin:admin:conv-...` are pre-fix artifacts

### 4. Tool Call Display
- After sending a message that triggers a tool call
- Right panel "Recent Tool Calls" should show the tool name with a checkmark
- The chat area should show inline tool call visualization

## Common Pitfalls

1. **SSH access to 83.228.213.100** — Only accepts SSH key auth (no password). The key is provided per-session as an attachment. Run `chmod 600` on it before use. The key may stop working mid-session.

2. **Brief "Hello, User" / "0 servers" flash on page load** — When navigating to the app, the UI briefly shows defaults before the health check completes (~3-5 seconds). This is a known minor UX issue, not a functional bug.

3. **External vs Local Hermes** — The Nextcloud app uses the LOCAL Hermes on 83.228.213.100, NOT the external one at jada-api.garzaos.online. The external API may have stale/different config.

4. **CSRF on Nextcloud API calls** — Always include `-H "OCS-APIRequest: true"` header when calling Nextcloud proxy endpoints via curl, or you'll get "CSRF check failed".

5. **Telegram bot token changes** — The bot token gets revoked/regenerated periodically. Always verify with the user if you see 401 errors from the Telegram bot container.

6. **Deploying code changes** — Use `docker cp` to copy files into containers, then `docker restart` the container. For PHP changes, copy to `/var/www/html/custom_apps/jadaagent/` inside the Nextcloud container. For backend changes, copy to `/app/` inside `hermes-backend` container.
