<template>
	<div class="jada-skills">
		<div class="jada-skills-header">
			<h1>Skills & Tools</h1>
			<button class="jada-btn jada-btn-secondary" @click="loadSkills">Refresh</button>
		</div>

		<div class="jada-section">
			<h2>MCP Servers</h2>
			<p class="jada-hint">External tool servers connected to your agent.</p>
			<div class="jada-mcp-grid">
				<div v-for="server in mcpServers" :key="server.name" class="jada-mcp-card">
					<div class="jada-mcp-icon">&#128268;</div>
					<div class="jada-mcp-info">
						<div class="jada-mcp-name">{{ server.name }}</div>
						<div class="jada-mcp-url">{{ server.url || server.command || 'Local process' }}</div>
					</div>
					<div :class="['jada-mcp-status', server.connected ? 'connected' : 'disconnected']">
						{{ server.connected ? 'Connected' : 'Configured' }}
					</div>
					<button class="jada-btn-remove" :disabled="removing === server.name" @click="removeServer(server.name)" title="Remove server">&#10005;</button>
				</div>
				<div v-if="mcpServers.length === 0 && !mcpError" class="jada-empty-state">
					No MCP servers configured yet.
				</div>
				<div v-if="mcpError" class="jada-empty-state jada-error">{{ mcpError }}</div>
				<div v-if="removeError" class="jada-msg jada-err" style="margin-top:8px">{{ removeError }}</div>
			</div>

			<!-- Add MCP Server form -->
			<div class="jada-add-mcp">
				<h3>Add MCP Server</h3>
				<div class="jada-add-mcp-form">
					<div class="jada-form-row">
						<label>Name</label>
						<input v-model="newServer.name" placeholder="my-server" />
					</div>
					<div class="jada-form-row">
						<label>Type</label>
						<select v-model="newServer.type">
							<option value="http">HTTP / SSE</option>
							<option value="stdio">stdio (local process)</option>
						</select>
					</div>
					<div v-if="newServer.type === 'http'" class="jada-form-row">
						<label>URL</label>
						<input v-model="newServer.url" placeholder="https://mcp.example.com/sse" />
					</div>
					<div v-if="newServer.type === 'stdio'" class="jada-form-row">
						<label>Command</label>
						<input v-model="newServer.command" placeholder="npx -y @modelcontextprotocol/server-example" />
					</div>
					<div class="jada-form-row jada-form-actions">
						<button class="jada-btn jada-btn-primary" :disabled="adding" @click="addServer">
							{{ adding ? 'Adding...' : 'Add Server' }}
						</button>
						<span v-if="addError" class="jada-msg jada-err">{{ addError }}</span>
						<span v-if="addOk" class="jada-msg jada-ok">Added!</span>
					</div>
				</div>
			</div>
		</div>

		<div class="jada-section">
			<h2>Installed Skills</h2>
			<p class="jada-hint">Skills extend what your agent can do.</p>
			<div class="jada-skills-grid">
				<div v-for="skill in skills" :key="skill.name || skill.id" class="jada-skill-card">
					<div class="jada-skill-icon">&#9733;</div>
					<div class="jada-skill-info">
						<div class="jada-skill-name">{{ skill.name || skill.id }}</div>
						<div class="jada-skill-desc">{{ skill.description || 'No description' }}</div>
					</div>
				</div>
				<div v-if="skills.length === 0" class="jada-empty-state">
					No skills installed yet. Skills can be added via OpenClaw CLI or Control UI.
				</div>
			</div>
		</div>
	</div>
</template>

<script>
import api from '../api.js'

export default {
	name: 'SkillsView',
	data() {
		return {
			skills: [],
			mcpServers: [],
			mcpError: '',
			removeError: '',
			newServer: { name: '', type: 'http', url: '', command: '' },
			adding: false,
			addError: '',
			addOk: false,
			removing: null,
		}
	},
	async mounted() {
		await this.loadSkills()
	},
	methods: {
		async loadSkills() {
			this.mcpError = ''
			try {
				const result = await api.getMcpServers()
				if (Array.isArray(result)) {
					this.mcpServers = result
				} else if (result && typeof result === 'object' && !result.error) {
					this.mcpServers = Object.entries(result).map(([name, v]) => ({ name, ...v }))
				} else {
					this.mcpServers = []
					if (result?.error) this.mcpError = result.error
				}
			} catch { /* backend may not support yet */ }

			try {
				const result = await api.getSkills()
				if (Array.isArray(result)) {
					this.skills = result
				} else if (result && typeof result === 'object' && !result.error) {
					this.skills = Object.entries(result).map(([id, v]) => ({ id, ...v }))
				}
			} catch { /* ignore */ }
		},

		async addServer() {
			this.addError = ''
			this.addOk = false
			const { name, type, url, command } = this.newServer
			if (!name.trim()) { this.addError = 'Name is required'; return }
			if (type === 'http' && !url.trim()) { this.addError = 'URL is required'; return }
			if (type === 'stdio' && !command.trim()) { this.addError = 'Command is required'; return }

			this.adding = true
			try {
				const payload = { name: name.trim() }
				if (type === 'http') payload.url = url.trim()
				else payload.command = command.trim()

				await api.addMcpServer(payload)
				this.addOk = true
				this.newServer = { name: '', type: 'http', url: '', command: '' }
				await this.loadSkills()
				setTimeout(() => { this.addOk = false }, 3000)
			} catch (err) {
				this.addError = err.message || 'Failed to add server'
			} finally {
				this.adding = false
			}
		},

		async removeServer(name) {
			this.removing = name
			this.removeError = ''
			try {
				await api.removeMcpServer(name)
				await this.loadSkills()
			} catch (err) {
				this.removeError = err.message || 'Failed to remove server'
			} finally {
				this.removing = null
			}
		},
	},
}
</script>

<style scoped>
.jada-skills {
	padding: 32px;
	max-width: 1200px;
}

.jada-skills-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 28px;
}

.jada-skills-header h1 {
	font-size: 28px;
	font-weight: 700;
}

.jada-section {
	margin-bottom: 36px;
}

.jada-section h2 {
	font-size: 18px;
	font-weight: 600;
	margin-bottom: 4px;
}

.jada-hint {
	font-size: 13px;
	color: var(--color-text-maxcontrast);
	margin-bottom: 16px;
}

.jada-mcp-grid, .jada-skills-grid {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.jada-mcp-card, .jada-skill-card {
	display: flex;
	align-items: center;
	gap: 14px;
	padding: 16px 20px;
	background: var(--color-background-dark);
	border: 1px solid var(--color-border);
	border-radius: 12px;
	transition: all 0.2s;
}

.jada-mcp-card:hover, .jada-skill-card:hover {
	border-color: rgba(233, 69, 96, 0.3);
	box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}

.jada-mcp-icon, .jada-skill-icon {
	width: 40px;
	height: 40px;
	border-radius: 10px;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 20px;
	background: rgba(233, 69, 96, 0.1);
	flex-shrink: 0;
}

.jada-mcp-info, .jada-skill-info {
	flex: 1;
	min-width: 0;
}

.jada-mcp-name, .jada-skill-name {
	font-size: 15px;
	font-weight: 600;
	color: var(--color-main-text);
}

.jada-mcp-url {
	font-size: 12px;
	color: var(--color-text-maxcontrast);
	font-family: monospace;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.jada-skill-desc {
	font-size: 13px;
	color: var(--color-text-maxcontrast);
}

.jada-mcp-status {
	padding: 4px 12px;
	border-radius: 20px;
	font-size: 12px;
	font-weight: 600;
	flex-shrink: 0;
}

.jada-mcp-status.connected {
	background: rgba(74, 222, 128, 0.15);
	color: #4ade80;
}

.jada-mcp-status.disconnected {
	background: rgba(251, 191, 36, 0.15);
	color: #fbbf24;
}

.jada-empty-state {
	padding: 32px;
	text-align: center;
	color: var(--color-text-maxcontrast);
	font-size: 14px;
	background: var(--color-background-dark);
	border: 1px dashed var(--color-border);
	border-radius: 12px;
}

.jada-btn {
	padding: 10px 20px;
	border-radius: 10px;
	border: none;
	font-size: 14px;
	font-weight: 600;
	cursor: pointer;
	transition: all 0.2s;
}

.jada-btn-secondary {
	background: var(--color-background-dark);
	color: var(--color-main-text);
	border: 1px solid var(--color-border);
}

.jada-btn-secondary:hover {
	background: var(--color-background-hover);
}

.jada-btn-remove {
	width: 28px;
	height: 28px;
	border-radius: 6px;
	border: 1px solid rgba(248, 113, 113, 0.4);
	background: transparent;
	color: #f87171;
	font-size: 12px;
	cursor: pointer;
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	transition: all 0.15s;
}

.jada-btn-remove:hover:not(:disabled) {
	background: rgba(248, 113, 113, 0.15);
}

.jada-btn-remove:disabled {
	opacity: 0.4;
	cursor: not-allowed;
}

.jada-error {
	color: #f87171;
}

.jada-add-mcp {
	margin-top: 20px;
	padding: 20px;
	background: var(--color-background-dark);
	border: 1px solid var(--color-border);
	border-radius: 12px;
}

.jada-add-mcp h3 {
	font-size: 15px;
	font-weight: 600;
	margin: 0 0 14px;
}

.jada-add-mcp-form {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.jada-form-row {
	display: flex;
	align-items: center;
	gap: 12px;
}

.jada-form-row label {
	flex: 0 0 80px;
	font-size: 12px;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.jada-form-row input,
.jada-form-row select {
	flex: 1;
	padding: 8px 12px;
	border: 1px solid var(--color-border);
	border-radius: 8px;
	background: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 13px;
}

.jada-form-row input:focus,
.jada-form-row select:focus {
	outline: none;
	border-color: rgba(233, 69, 96, 0.5);
}

.jada-form-actions {
	padding-top: 4px;
}

.jada-msg {
	font-size: 13px;
	font-weight: 600;
	margin-left: 8px;
}

.jada-ok { color: #4ade80; }
.jada-err { color: #f87171; }

.jada-btn-primary {
	padding: 8px 18px;
	border-radius: 8px;
	border: none;
	background: linear-gradient(135deg, #e94560, #c23152);
	color: #fff;
	font-size: 13px;
	font-weight: 600;
	cursor: pointer;
	transition: opacity 0.15s;
}

.jada-btn-primary:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}
</style>
