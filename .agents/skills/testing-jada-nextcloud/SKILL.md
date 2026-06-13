# Testing Jada AI Nextcloud App

Guide for E2E testing the Jada AI native Nextcloud app on the live deployment.

## Devin Secrets Needed

- `NEXTCLOUD_APP_PASSWORD` — Nextcloud admin app password for API auth
- SSH key at `~/.ssh/nc_rsa` — for server access to 83.228.213.100 (user: `ubuntu`, passwordless sudo)

## Infrastructure

| Component | Location | Notes |
|-----------|----------|-------|
| Nextcloud UI | https://next.garzaos.online/apps/jadaagent/ | Admin login: admin / `${NEXTCLOUD_APP_PASSWORD}` |
| Local Hermes backend | 83.228.213.100 container `hermes-backend` port 3200 | The Nextcloud app connects via `http://172.18.0.1:3200` |
| External Hermes API | https://jada-api.garzaos.online | On 187.77.25.131 — may have STALE config; the Nextcloud app uses the LOCAL backend |
| Telegram bot | Container `jada-telegram-bot` on 83.228.213.100 | Token changes frequently — check with user |
| Conversations on disk | `/data/conversations.json` inside `hermes-backend` container | File-based persistence with 2s debounce |
| Nextcloud container | `nextcloud-aio-nextcloud` on 83.228.213.100 | PHP app at `/var/www/html/custom_apps/jadaagent/` |

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

### 4. Tool Call Display & Icon Verification
- After sending a message that triggers tool calls (mix of success/error recommended)
- **Right panel**: "Recent Tool Calls" should show tool names with ✅ (success) or ❌ (error)
- **Chat body**: Inline tool call icons should match the right panel exactly
- Use "List my cookbook recipes and news feeds" as a good test — triggers ~12 tools with a mix of success (files/calendar) and error (cookbook 404, news 404)
- **Pass**: ❌ for failed tools, ✅ for successful tools in BOTH views, zero 🔧 in finalized messages
- **Fail**: 🔧 (wrench) icons remain after response completes, or icons don't match between views

### 5. Streaming Icon Transitions
- Start a new chat and send a message that triggers tools
- During streaming: tool icons should show 🔧 (wrench) with spinning animation
- After each tool completes: icon should transition to ✅ or ❌ immediately
- After full response completes: zero 🔧 icons should remain

### 6. JS Cache Verification
Nextcloud caches JS bundles using a `?v=<hash>` parameter derived from the app version in `appinfo/info.xml`.
```javascript
// Run in browser console to check which JS version is loaded
var s = document.querySelectorAll('script[src*="jadaagent-main"]')[0];
console.log('Script URL:', s.src);
console.log('Version param:', s.src.match(/\?v=([^&]+)/)?.[1]);
```
- If the `?v=` hash hasn't changed after deploying new code, the browser is serving old cached JS
- **Fix**: Bump `<version>` in `appinfo/info.xml`, then run `occ upgrade` inside the Nextcloud container

## Deploying Code Changes

### Frontend (Vue/JS)
```bash
# Build locally
cd /home/ubuntu/repos/jada-agent && npm run build

# Copy to remote
scp -i ~/.ssh/nc_rsa js/jadaagent-main.js ubuntu@83.228.213.100:/tmp/

# Deploy into Nextcloud container
ssh -i ~/.ssh/nc_rsa ubuntu@83.228.213.100 \
  "sudo docker cp /tmp/jadaagent-main.js nextcloud-aio-nextcloud:/var/www/html/custom_apps/jadaagent/js/"
```

### Cache busting after frontend deploy
```bash
# If the JS ?v= hash didn't change, bump the version in info.xml:
# Edit appinfo/info.xml → increment <version>
# Then:
scp -i ~/.ssh/nc_rsa appinfo/info.xml ubuntu@83.228.213.100:/tmp/
ssh -i ~/.ssh/nc_rsa ubuntu@83.228.213.100 \
  "sudo docker cp /tmp/info.xml nextcloud-aio-nextcloud:/var/www/html/custom_apps/jadaagent/appinfo/ && \
   sudo docker exec -u www-data nextcloud-aio-nextcloud php occ upgrade"
```

### Backend (Hermes)
```bash
scp -i ~/.ssh/nc_rsa backend/server.mjs backend/agent-loop.mjs ubuntu@83.228.213.100:/tmp/
ssh -i ~/.ssh/nc_rsa ubuntu@83.228.213.100 \
  "sudo docker cp /tmp/server.mjs hermes-backend:/app/ && \
   sudo docker cp /tmp/agent-loop.mjs hermes-backend:/app/ && \
   sudo docker restart hermes-backend"
```

## Common Pitfalls

1. **SSH access to 83.228.213.100** — Use `ssh -i ~/.ssh/nc_rsa ubuntu@83.228.213.100` (not root). Passwordless sudo available. The key may also be at `~/attachments/.../id_rsa` if provided as session attachment.

2. **Brief "Hello, User" / "0 servers" flash on page load** — The UI briefly shows defaults before the health check completes (~3-5 seconds). This is a known minor UX issue, not a functional bug.

3. **External vs Local Hermes** — The Nextcloud app uses the LOCAL Hermes on 83.228.213.100, NOT the external one at jada-api.garzaos.online. The external API may have stale/different config.

4. **CSRF on Nextcloud API calls** — Always include `-H "OCS-APIRequest: true"` header when calling Nextcloud proxy endpoints via curl, or you'll get "CSRF check failed".

5. **Telegram bot token changes** — The bot token gets revoked/regenerated periodically. Always verify with the user if you see 401 errors from the Telegram bot container.

6. **Nextcloud JS caching** — Nextcloud appends `?v=<hash>` to JS URLs based on the app version in `appinfo/info.xml`. If you deploy new JS but don't bump the version, browsers will serve the old cached bundle indefinitely. Always bump `<version>` and run `occ upgrade` after frontend changes.

7. **HTML entities vs Unicode escapes in Vue templates** — Inline HTML entity ternaries (e.g., `&#10060;`) can get corrupted during Vite minification. The app uses a `toolIcon()` method with JS Unicode escapes (`\u274c`, `\u2705`, `\ud83d\udd27`) instead — this is more reliable. If icons appear wrong, check the minified JS to see if entities were corrupted.

8. **Tool icon rendering paths** — The chat body has TWO template blocks for tool icons: finalized messages (line ~34) and streaming messages (line ~56). Both use `{{ toolIcon(tc.status) }}`. If icons are wrong in one view but not the other, check both template blocks.
