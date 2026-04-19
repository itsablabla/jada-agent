<template>
	<div class="jada-settings">
		<h1>Settings</h1>

		<div class="jada-settings-grid">
			<!-- Left: nav -->
			<div class="jada-settings-nav">
				<a v-for="section in sections" :key="section.id"
					:class="['jada-settings-nav-item', { active: activeSection === section.id }]"
					@click="activeSection = section.id"
				>{{ section.label }}</a>
			</div>

			<!-- Right: content -->
			<div class="jada-settings-content">
				<!-- General -->
				<div v-if="activeSection === 'general'" class="jada-settings-section">
					<h2>General</h2>
					<div class="jada-form-group">
						<label>Agent Backend URL</label>
						<input v-model="settings.openclaw_url" placeholder="https://jada-api.garzaos.online" />
					</div>
					<div class="jada-form-group">
						<label>API Token</label>
						<input v-model="settings.openclaw_token" type="password" placeholder="Bearer token" />
					</div>
					<div class="jada-form-group">
						<label>Auto-execute tool calls</label>
						<div class="jada-toggle-row">
							<span class="jada-toggle-label">Allow agent to execute tools without confirmation</span>
							<button :class="['jada-toggle', { on: autoExecute }]" @click="autoExecute = !autoExecute">
								<span class="jada-toggle-knob"></span>
							</button>
						</div>
					</div>
					<div class="jada-form-group">
						<label>Per-user chat isolation</label>
						<div class="jada-toggle-row">
							<span class="jada-toggle-label">Each Nextcloud user gets isolated chat history</span>
							<button :class="['jada-toggle', { on: perUserIsolation }]" @click="perUserIsolation = !perUserIsolation">
								<span class="jada-toggle-knob"></span>
							</button>
						</div>
					</div>
					<button class="jada-btn-primary" @click="handleSave" :disabled="saving">
						{{ saving ? 'Saving...' : 'Save Settings' }}
					</button>
					<span v-if="statusMsg" :class="['jada-status-msg', statusOk ? 'ok' : 'err']">{{ statusMsg }}</span>
				</div>

				<!-- MCP Servers -->
				<div v-if="activeSection === 'mcp'" class="jada-settings-section">
					<h2>MCP Servers</h2>
					<p class="jada-hint">Connected MCP servers that provide tools to the agent.</p>
					<div class="jada-mcp-list">
						<div v-for="server in store.mcpServers" :key="server.name" class="jada-mcp-item">
							<span :class="['jada-mcp-dot', server.connected ? 'on' : 'off']"></span>
							<div class="jada-mcp-info">
								<div class="jada-mcp-name">{{ server.name }}</div>
								<div class="jada-mcp-tools">{{ server.tools }} tools</div>
							</div>
							<span :class="['jada-mcp-status', server.connected ? 'on' : 'off']">
								{{ server.connected ? 'Connected' : 'Disconnected' }}
							</span>
							<button class="jada-mcp-remove-btn" :disabled="mcpRemoving === server.name" @click="removeMcpServer(server.name)" title="Remove">&#10005;</button>
						</div>
						<div v-if="!store.mcpServers.length" class="jada-mcp-empty">
							No MCP servers connected. Configure the backend URL above or add one below.
						</div>
					</div>
					<div v-if="mcpRemoveError" class="jada-mcp-msg err" style="margin-bottom:8px">{{ mcpRemoveError }}</div>
					<div class="jada-mcp-total">
						Total: {{ store.totalTools }} tools across {{ store.mcpServers.length }} servers
					</div>

					<!-- Add form -->
					<div class="jada-mcp-add">
						<h3>Add MCP Server</h3>
						<div class="jada-mcp-add-row">
							<input v-model="mcpNew.name" placeholder="Server name" />
							<select v-model="mcpNew.type">
								<option value="http">HTTP / SSE</option>
								<option value="stdio">stdio</option>
							</select>
						</div>
						<div class="jada-mcp-add-row">
							<input v-if="mcpNew.type === 'http'" v-model="mcpNew.url" placeholder="https://mcp.example.com/sse" style="flex:1" />
							<input v-else v-model="mcpNew.command" placeholder="npx -y @modelcontextprotocol/server-example" style="flex:1" />
						</div>
						<div class="jada-mcp-add-row">
							<button class="jada-btn-primary" :disabled="mcpAdding" @click="addMcpServer">
								{{ mcpAdding ? 'Adding...' : 'Add Server' }}
							</button>
							<span v-if="mcpAddError" class="jada-mcp-msg err">{{ mcpAddError }}</span>
							<span v-if="mcpAddOk" class="jada-mcp-msg ok">Added!</span>
						</div>
					</div>
				</div>

				<!-- Workspaces -->
				<div v-if="activeSection === 'workspaces'" class="jada-settings-section">
					<h2>Workspaces</h2>
					<p class="jada-hint">Manage your workspace configuration. Nextcloud is always the root workspace.</p>
					<div v-for="ws in store.workspaces" :key="ws.id" class="jada-ws-setting-item">
						<span class="jada-ws-dot" :style="{ background: ws.color }"></span>
						<span class="jada-ws-setting-name">{{ ws.name }}</span>
						<span v-if="ws.isRoot" class="jada-ws-badge">HOME</span>
						<span class="jada-ws-setting-count">{{ ws.chatCount || 0 }} chats</span>
					</div>
				</div>

				<!-- About -->
				<div v-if="activeSection === 'about'" class="jada-settings-section">
					<h2>About</h2>
					<div class="jada-about-grid">
						<div class="jada-about-row">
							<span class="jada-about-label">App Version</span>
							<span class="jada-about-value">0.2.0</span>
						</div>
						<div class="jada-about-row">
							<span class="jada-about-label">Agent Backend</span>
							<span class="jada-about-value">Hermes (Jada API)</span>
						</div>
						<div class="jada-about-row">
							<span class="jada-about-label">Agent Status</span>
							<span :class="['jada-about-value', store.healthy ? 'green' : 'red']">
								{{ store.healthy ? 'Online' : 'Offline' }}
							</span>
						</div>
						<div class="jada-about-row">
							<span class="jada-about-label">Tools</span>
							<span class="jada-about-value">{{ store.totalTools }}</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script>
import { store } from '../store.js'
import api from '../api.js'

export default {
	name: 'SettingsView',
	data() {
		return {
			store,
			activeSection: 'general',
			settings: {
				openclaw_url: '',
				openclaw_token: '',
			},
			autoExecute: true,
			perUserIsolation: true,
			saving: false,
			statusMsg: '',
			statusOk: false,
			sections: [
				{ id: 'general', label: 'General' },
				{ id: 'mcp', label: 'MCP Servers' },
				{ id: 'workspaces', label: 'Workspaces' },
				{ id: 'about', label: 'About' },
			],
			// MCP add/remove state
			mcpNew: { name: '', type: 'http', url: '', command: '' },
			mcpAdding: false,
			mcpAddError: '',
			mcpAddOk: false,
			mcpRemoving: null,
			mcpRemoveError: '',
		}
	},
	async mounted() {
		try {
			const s = await api.getSettings()
			this.settings = { ...this.settings, ...s }
		} catch { /* ignore */ }
	},
	methods: {
		async handleSave() {
			this.saving = true
			this.statusMsg = ''
			try {
				await api.saveSettings(this.settings)
				this.statusMsg = 'Saved'
				this.statusOk = true
			} catch (err) {
				this.statusMsg = 'Failed: ' + (err.message || 'Unknown')
				this.statusOk = false
			} finally {
				this.saving = false
			}
		},

		async addMcpServer() {
			this.mcpAddError = ''
			this.mcpAddOk = false
			const { name, type, url, command } = this.mcpNew
			if (!name.trim()) { this.mcpAddError = 'Name is required'; return }
			if (type === 'http' && !url.trim()) { this.mcpAddError = 'URL is required'; return }
			if (type === 'stdio' && !command.trim()) { this.mcpAddError = 'Command is required'; return }

			this.mcpAdding = true
			try {
				const payload = { name: name.trim() }
				if (type === 'http') payload.url = url.trim()
				else payload.command = command.trim()

				await api.addMcpServer(payload)
				this.mcpAddOk = true
				this.mcpNew = { name: '', type: 'http', url: '', command: '' }
				// Refresh store health to pick up new server list
				const { actions } = await import('../store.js')
				await actions.refreshHealth()
				setTimeout(() => { this.mcpAddOk = false }, 3000)
			} catch (err) {
				this.mcpAddError = err.message || 'Failed to add server'
			} finally {
				this.mcpAdding = false
			}
		},

		async removeMcpServer(name) {
			this.mcpRemoving = name
			this.mcpRemoveError = ''
			try {
				await api.removeMcpServer(name)
				const { actions } = await import('../store.js')
				await actions.refreshHealth()
			} catch (err) {
				this.mcpRemoveError = err.message || 'Failed to remove server'
			} finally {
				this.mcpRemoving = null
			}
		},
	},
}
</script>

<style scoped>
.jada-settings {
	padding: 28px;
	overflow-y: auto;
	height: 100%;
}

.jada-settings h1 {
	font-size: 24px;
	font-weight: 700;
	color: #fff;
	margin: 0 0 24px;
}

.jada-settings-grid {
	display: flex;
	gap: 24px;
}

.jada-settings-nav {
	width: 180px;
	min-width: 180px;
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.jada-settings-nav-item {
	padding: 8px 14px;
	border-radius: 8px;
	font-size: 13px;
	color: #8b8b9e;
	cursor: pointer;
	transition: all 0.15s;
	text-decoration: none;
}

.jada-settings-nav-item:hover { background: rgba(255,255,255,0.04); color: #e8e8ef; }
.jada-settings-nav-item.active { background: rgba(233, 69, 96, 0.15); color: #e94560; }

.jada-settings-content {
	flex: 1;
	max-width: 600px;
}

.jada-settings-section h2 {
	font-size: 18px;
	font-weight: 600;
	color: #e8e8ef;
	margin: 0 0 16px;
}

.jada-hint {
	font-size: 13px;
	color: #555;
	margin: 0 0 16px;
}

.jada-form-group {
	margin-bottom: 18px;
}

.jada-form-group label {
	display: block;
	font-size: 12px;
	font-weight: 600;
	color: #8b8b9e;
	margin-bottom: 6px;
}

.jada-form-group input {
	width: 100%;
	padding: 10px 14px;
	border: 1px solid rgba(255,255,255,0.1);
	border-radius: 10px;
	background: #1a1a24;
	color: #e8e8ef;
	font-size: 14px;
	box-sizing: border-box;
}

.jada-form-group input:focus {
	outline: none;
	border-color: #e94560;
}

.jada-toggle-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
}

.jada-toggle-label {
	font-size: 13px;
	color: #8b8b9e;
}

.jada-toggle {
	width: 40px;
	height: 22px;
	border-radius: 12px;
	border: none;
	background: #333;
	position: relative;
	cursor: pointer;
	transition: background 0.2s;
}

.jada-toggle.on { background: #e94560; }

.jada-toggle-knob {
	position: absolute;
	top: 3px;
	left: 3px;
	width: 16px;
	height: 16px;
	border-radius: 50%;
	background: #fff;
	transition: transform 0.2s;
}

.jada-toggle.on .jada-toggle-knob {
	transform: translateX(18px);
}

.jada-btn-primary {
	padding: 10px 24px;
	border-radius: 10px;
	border: none;
	background: linear-gradient(135deg, #e94560, #c23152);
	color: #fff;
	font-size: 13px;
	font-weight: 600;
	cursor: pointer;
	margin-right: 12px;
}

.jada-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

.jada-status-msg {
	font-size: 13px;
	font-weight: 600;
}

.jada-status-msg.ok { color: #4ade80; }
.jada-status-msg.err { color: #f87171; }

/* MCP servers */
.jada-mcp-list { margin-bottom: 16px; }

.jada-mcp-item {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 12px 14px;
	background: #1a1a24;
	border-radius: 10px;
	margin-bottom: 6px;
}

.jada-mcp-dot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
}

.jada-mcp-dot.on { background: #4ade80; }
.jada-mcp-dot.off { background: #f87171; }

.jada-mcp-info { flex: 1; }

.jada-mcp-name {
	font-size: 14px;
	font-weight: 600;
	color: #e8e8ef;
	text-transform: capitalize;
}

.jada-mcp-tools {
	font-size: 12px;
	color: #555;
}

.jada-mcp-status {
	font-size: 12px;
	font-weight: 600;
}

.jada-mcp-status.on { color: #4ade80; }
.jada-mcp-status.off { color: #f87171; }

.jada-mcp-empty {
	padding: 16px;
	text-align: center;
	color: #555;
	font-size: 13px;
}

.jada-mcp-total {
	font-size: 13px;
	color: #8b8b9e;
	font-weight: 600;
}

.jada-mcp-remove-btn {
	width: 26px;
	height: 26px;
	border-radius: 6px;
	border: 1px solid rgba(248, 113, 113, 0.4);
	background: transparent;
	color: #f87171;
	font-size: 11px;
	cursor: pointer;
	flex-shrink: 0;
	transition: all 0.15s;
}

.jada-mcp-remove-btn:hover:not(:disabled) {
	background: rgba(248, 113, 113, 0.15);
}

.jada-mcp-remove-btn:disabled {
	opacity: 0.4;
	cursor: not-allowed;
}

.jada-mcp-add {
	margin-top: 20px;
	padding: 16px;
	background: #1a1a24;
	border-radius: 10px;
}

.jada-mcp-add h3 {
	font-size: 14px;
	font-weight: 600;
	color: #e8e8ef;
	margin: 0 0 12px;
}

.jada-mcp-add-row {
	display: flex;
	gap: 8px;
	margin-bottom: 8px;
	align-items: center;
}

.jada-mcp-add-row input,
.jada-mcp-add-row select {
	flex: 1;
	padding: 8px 12px;
	border: 1px solid rgba(255,255,255,0.1);
	border-radius: 8px;
	background: #12121a;
	color: #e8e8ef;
	font-size: 13px;
}

.jada-mcp-add-row input:focus,
.jada-mcp-add-row select:focus {
	outline: none;
	border-color: #e94560;
}

.jada-mcp-msg {
	font-size: 12px;
	font-weight: 600;
	margin-left: 6px;
}

.jada-mcp-msg.ok { color: #4ade80; }
.jada-mcp-msg.err { color: #f87171; }
.jada-ws-setting-item {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 10px 14px;
	background: #1a1a24;
	border-radius: 8px;
	margin-bottom: 4px;
}

.jada-ws-dot {
	width: 10px;
	height: 10px;
	border-radius: 50%;
}

.jada-ws-setting-name {
	flex: 1;
	font-size: 14px;
	color: #e8e8ef;
}

.jada-ws-badge {
	padding: 2px 6px;
	border-radius: 4px;
	background: rgba(0, 130, 201, 0.2);
	color: #0082c9;
	font-size: 9px;
	font-weight: 700;
}

.jada-ws-setting-count {
	font-size: 12px;
	color: #555;
}

/* About */
.jada-about-grid {
	background: #1a1a24;
	border-radius: 12px;
	overflow: hidden;
}

.jada-about-row {
	display: flex;
	padding: 12px 16px;
	border-bottom: 1px solid rgba(255,255,255,0.04);
}

.jada-about-row:last-child { border-bottom: none; }

.jada-about-label {
	flex: 0 0 160px;
	font-size: 13px;
	font-weight: 600;
	color: #555;
}

.jada-about-value {
	font-size: 13px;
	color: #e8e8ef;
}

.jada-about-value.green { color: #4ade80; }
.jada-about-value.red { color: #f87171; }
</style>
