# Testing Jada Agent — Nextcloud App

## Overview

Jada Agent is a Nextcloud app that provides a native UI for managing an OpenClaw AI agent. It has 5 views: Dashboard, Chat, Skills & Tools, Schedules, Settings.

## Devin Secrets Needed

- **VPS_ROOT_PASSWORD** — SSH access to the Nextcloud VPS (83.228.213.100) for deploying code changes
- **VPS_IP** — IP address of the Nextcloud VPS

## Live App URLs

- **App:** `https://next.garzaos.online/apps/jadaagent/`
- **Admin Settings:** `https://next.garzaos.online/settings/admin/jadaagent`
- **Admin Account:** Logged in as "Jaden" (admin user)

## Key DOM Elements

### Admin Settings Page (`/settings/admin/jadaagent`)
- `#openclaw-url` — OpenClaw URL input
- `#openclaw-token` — API Token input
- `#save-openclaw-settings` — Save button
- `#openclaw-settings-msg` — Status message span (shows "Saved" in green `#2d8644` or errors in red `#c9302c`)

### In-App Chat
- Textarea: `placeholder="Message Jada..."`
- Send button: enabled when textarea has text AND not loading
- Typing indicator: 3 bouncing dots with "J" avatar
- The app uses `XMLHttpRequest` (not `fetch`) for API calls — instrument XHR if counting requests

### API Endpoints
- `POST /apps/jadaagent/api/chat` — Send chat message
- `PUT /apps/jadaagent/api/settings` — Save admin settings
- `GET /apps/jadaagent/api/status` — Agent status check
- `POST /apps/jadaagent/api/test-connection` — Test OpenClaw connection

## Testing Procedures

### 1. Admin Settings Save Button
If `jadaagent-admin.js` is not deployed (returns 404), inject it via browser console:
```javascript
(function() {
  // Paste the exact content of src/admin.js here as an IIFE
  const saveBtn = document.getElementById('save-openclaw-settings');
  // ... rest of handler code
})();
```
Then modify the URL input, click Save, verify:
- Status span shows "Saved" (check with `document.getElementById('openclaw-settings-msg').textContent`)
- Color is green: `document.getElementById('openclaw-settings-msg').style.color` should be `rgb(45, 134, 68)`
- Reload page and verify value persisted

### 2. Chat Concurrent Request Guard
To count POST requests to `/api/chat`, instrument XHR (NOT fetch):
```javascript
window.__xhrPostCount = 0;
const origOpen = XMLHttpRequest.prototype.open;
const origSend = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.open = function(method, url) {
  this._method = method; this._url = url;
  return origOpen.apply(this, arguments);
};
XMLHttpRequest.prototype.send = function() {
  if (this._method === 'POST' && this._url && this._url.includes('/api/chat')) {
    window.__xhrPostCount++;
  }
  return origSend.apply(this, arguments);
};
```
The send button has `:disabled="!inputText.trim() || loading"` — this UI guard prevents clicking during loading. The `this.loading` check in `sendMessage()` is a programmatic defense-in-depth layer.

### 3. Dashboard Regression
- Navigate to Dashboard tab
- Verify: Agent Status "Online", Skills "3 installed"
- Click Refresh — should reload without errors
- Note: System Info may show `_http_status200` if the array fix isn't deployed

### 4. Settings View
- Click Settings tab
- Verify OpenClaw Gateway URL field is populated
- Click "Test Connection" → should show "Connection successful — agent is online" in green

## Infrastructure Notes

### Deployment
- App files are at `/var/www/html/custom_apps/jadaagent/` on the Nextcloud VPS
- JS bundles: `/var/www/html/custom_apps/jadaagent/js/`
- PHP files: `/var/www/html/custom_apps/jadaagent/lib/`
- After deploying PHP changes, you may need to clear opcache: `sudo -u www-data php /var/www/html/occ maintenance:repair`
- After deploying JS changes, bump the version in `appinfo/info.xml` to bust browser cache

### OpenClaw Backend
- Runs as Docker container on the same VPS at `http://openclaw:18789`
- Chat endpoint: `/v1/chat/completions` (OpenAI-compatible)
- Docker network allows Nextcloud PHP to reach `openclaw:18789` by container name

### SSH Access
- The Nextcloud VPS (83.228.213.100) uses key-based SSH only
- SSH from the main VPS (${VPS_IP}) may work if keys are configured
- If SSH is denied, you can still test the live app via browser but cannot deploy code changes

### Vue Component Access
- The Vue app is NOT mounted on `#app` or `#content-vue` — it mounts on a different element
- `document.querySelector('#terms_of_service_confirm').__vue_app__` was found but doesn't give access to chat component
- For programmatic testing of Vue methods, you may need to find the component through the internal component tree

## Common Issues

1. **Browser console returns `undefined`** for multi-line scripts — use IIFEs or single expressions
2. **fetch instrumentation shows 0 count** — the app uses XHR, not fetch. Instrument `XMLHttpRequest.prototype` instead
3. **Enter key in textarea adds newline** — use the Send button (click) instead of pressing Enter
4. **Admin.js 404** — file exists in repo but may not be deployed. Inject via console as workaround
5. **CSS color format** — browser returns `rgb(r, g, b)` not hex. `rgb(45, 134, 68)` = `#2d8644`
