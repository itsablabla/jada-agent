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
						<div class="jada-mcp-url">{{ server.url || 'Local process' }}</div>
					</div>
					<div :class="['jada-mcp-status', server.connected ? 'connected' : 'disconnected']">
						{{ server.connected ? 'Connected' : 'Configured' }}
					</div>
				</div>
				<div v-if="mcpServers.length === 0" class="jada-empty-state">
					No MCP servers configured. Add them in OpenClaw settings.
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
		}
	},
	async mounted() {
		await this.loadSkills()
	},
	methods: {
		async loadSkills() {
			// MCP servers configured in OpenClaw — always show them
			this.mcpServers = [
				{ name: 'Nextcloud', url: 'https://mcp-next.garzaos.online/mcp', connected: true },
				{ name: 'Composio', url: 'https://mcp-next.garzaos.online/composio/mcp', connected: true },
				{ name: 'ProtonMail', url: 'https://mcp-next.garzaos.online/protonmail/mcp', connected: true },
			]

			try {
				const result = await api.getSkills()
				if (Array.isArray(result)) {
					this.skills = result
				} else if (result && typeof result === 'object' && !result.error) {
					this.skills = Object.entries(result).map(([id, v]) => ({ id, ...v }))
				}
			} catch { /* ignore */ }
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
</style>
