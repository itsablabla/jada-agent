# Testing Jada Agent — Nextcloud App for OpenClaw

## Overview

Jada Agent is a Nextcloud app that provides a native UI for managing an OpenClaw autonomous AI agent. It has 5 views: Dashboard, Chat, Skills & Tools, Schedules, and Settings.

## Devin Secrets Needed

- SSH key for the Nextcloud server at `~/.ssh/id_rsa_server` (connects to `83.228.213.100` as `ubuntu`)
- No additional API keys needed — OpenClaw runs on the same Docker network as Nextcloud

## Test Environment

- **App URL**: `https://next.garzaos.online/apps/jadaagent/`
- **Admin Settings URL**: `https://next.garzaos.online/settings/admin/jadaagent`
- **Nextcloud Server**: `83.228.213.100` (Hostinger VPS)
- **Docker Container**: `nextcloud-aio-nextcloud`
- **App Files Location** (inside container): `/var/www/html/custom_apps/jadaagent/`
- **Admin User**: Jaden (admin account)

## Deploying Changes to Live Server

1. SSH into the server: `ssh -i ~/.ssh/id_rsa_server ubuntu@83.228.213.100`
2. Copy files into the Docker container:
   ```bash
   sudo docker cp /path/to/file nextcloud-aio-nextcloud:/var/www/html/custom_apps/jadaagent/<dest>
   ```
3. Fix ownership: `sudo docker exec nextcloud-aio-nextcloud chown -R www-data:www-data /var/www/html/custom_apps/jadaagent/`
4. Clear opcache (important for PHP changes): `sudo docker exec -u www-data nextcloud-aio-nextcloud php /var/www/html/occ maintenance:repair`
5. If you bump the app version in `appinfo/info.xml`, Nextcloud may enter maintenance mode. Fix with:
   ```bash
   sudo docker exec -u www-data nextcloud-aio-nextcloud php /var/www/html/occ maintenance:mode --off
   ```

## Common Pitfalls

- **Browser cache**: After deploying JS changes, bump the version in `appinfo/info.xml` to bust the cache. Otherwise the browser may serve stale JS bundles.
- **Opcache**: PHP file changes may not take effect until opcache is cleared. Always run `maintenance:repair` after deploying PHP changes.
- **Maintenance mode**: Version bumps in `info.xml` can trigger Nextcloud's upgrade mechanism. If the app becomes inaccessible, check if maintenance mode is on.
- **SSH key auth**: The server only accepts public key auth (no password). The key is at `~/.ssh/id_rsa_server`.
- **Docker network**: OpenClaw is accessible from within the Docker network at `http://openclaw:18789`. This URL won't resolve from outside the Docker network.

## Test Procedures

### Test 1: Admin Settings Save Button
1. Navigate to `/settings/admin/jadaagent`
2. Modify the OpenClaw URL field (e.g., append `/test-save`)
3. Click Save button
4. Verify: "Saved" text appears in green (#2d8644)
5. Verify: Save button re-enables after request
6. Reload the page
7. Verify: Modified URL persists (proves database write worked)
8. Restore original URL and save again

### Test 2: Chat Loading Guard
1. Navigate to the Chat tab
2. Type a message and click Send
3. Verify: Typing indicator (bouncing dots) appears
4. Verify: Send button becomes disabled during loading
5. Type another message and press Enter while loading
6. Verify: Second message is NOT sent (loading guard blocks it)
7. Wait for response
8. Verify: Exactly 1 user message and 1 assistant response
9. Verify: Send button re-enables after response

### Test 3: Dashboard Regression
1. Navigate to Dashboard tab (default view)
2. Verify: Agent Status shows "Online" with green checkmark
3. Verify: Skills shows "3 installed" (not corrupted by _http_status)
4. Verify: System Info shows `ok: true`, `status: live`, `_http_status: 200`
5. Click Refresh button
6. Verify: Data remains consistent after refresh

### Test 4: Settings View Regression
1. Click Settings tab in sidebar
2. Verify: OpenClaw Gateway URL field is populated (not empty)
3. Click "Test Connection" button
4. Verify: "Connection successful — agent is online" appears in green (#4ade80)
5. Verify: Button re-enables after test completes

## Key Code Paths

- **Admin Save**: `src/admin.js` → click handler → PUT `/apps/jadaagent/api/settings`
- **Chat Guard**: `src/components/ChatView.vue:88` → `if (!message || this.loading) return`
- **Send Button Disable**: `src/components/ChatView.vue:56` → `:disabled="!inputText.trim() || loading"`
- **_http_status Fix**: `lib/Service/OpenClawService.php:159` → `if (is_array($decoded) && !array_is_list($decoded))`
- **Dashboard Skills**: `src/components/DashboardView.vue:111` → `if (Array.isArray(skills))`
