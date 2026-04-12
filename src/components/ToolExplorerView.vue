<template>
	<div class="jada-tools">
		<div class="jada-tools-header">
			<h1>Tool Explorer</h1>
			<div class="jada-tools-search">
				<input v-model="searchQuery" placeholder="Search tools..." class="jada-tools-input" />
			</div>
		</div>

		<div class="jada-tools-filters">
			<button
				:class="['jada-filter-btn', { active: selectedServer === null }]"
				@click="selectedServer = null"
			>All ({{ store.totalTools }})</button>
			<button
				v-for="server in store.mcpServers"
				:key="server.name"
				:class="['jada-filter-btn', { active: selectedServer === server.name }]"
				@click="selectedServer = server.name"
			>{{ server.name }} ({{ server.tools }})</button>
		</div>

		<div class="jada-tools-grid">
			<div v-for="tool in filteredTools" :key="tool.name" class="jada-tool-card">
				<div class="jada-tool-card-header">
					<span class="jada-tool-card-icon">&#128295;</span>
					<span class="jada-tool-card-name">{{ tool.name }}</span>
				</div>
				<p class="jada-tool-card-desc">{{ tool.description || 'No description' }}</p>
				<div class="jada-tool-card-server">
					<span class="jada-tool-server-dot" :style="{ background: serverColor(tool.server) }"></span>
					{{ tool.server }}
				</div>
			</div>
		</div>

		<div v-if="!filteredTools.length && searchQuery" class="jada-tools-empty">
			No tools matching "{{ searchQuery }}"
		</div>
		<div v-if="!toolsList.length" class="jada-tools-empty">
			Tool data will be available when the agent is connected. Check the health endpoint.
		</div>
	</div>
</template>

<script>
import { store } from '../store.js'
import api from '../api.js'

export default {
	name: 'ToolExplorerView',
	data() {
		return {
			store,
			searchQuery: '',
			selectedServer: null,
			toolsList: [],
		}
	},
	computed: {
		filteredTools() {
			let tools = this.toolsList
			if (this.selectedServer) {
				tools = tools.filter(t => t.server === this.selectedServer)
			}
			if (this.searchQuery.trim()) {
				const q = this.searchQuery.toLowerCase()
				tools = tools.filter(t =>
					t.name.toLowerCase().includes(q) ||
					(t.description || '').toLowerCase().includes(q)
				)
			}
			return tools
		},
	},
	async mounted() {
		await this.loadTools()
	},
	methods: {
		async loadTools() {
			try {
				const data = await api.getHealthDetail()
				if (data?.tools) {
					this.toolsList = data.tools.map(t => ({
						name: t.name || t,
						description: t.description || '',
						server: t.server || this.inferServer(t.name || t),
					}))
				} else if (data?.servers) {
					// Build tool list from server info
					const tools = []
					for (const [name, info] of Object.entries(data.servers)) {
						const count = info.tools || 0
						for (let i = 0; i < Math.min(count, 5); i++) {
							tools.push({
								name: `${name}_tool_${i + 1}`,
								description: `Tool from ${name} server`,
								server: name,
							})
						}
					}
					this.toolsList = tools
				}
			} catch {
				// Try skills endpoint as fallback
				try {
					const skills = await api.getSkills()
					if (Array.isArray(skills)) {
						this.toolsList = skills.map(s => ({
							name: s.name || s,
							description: s.description || '',
							server: 'local',
						}))
					}
				} catch {
					this.toolsList = []
				}
			}
		},
		inferServer(name) {
			if (name.startsWith('nextcloud__')) return 'nextcloud'
			if (name.startsWith('kuse__')) return 'kuse'
			if (name.startsWith('composio__')) return 'composio'
			if (name.startsWith('rube__')) return 'rube'
			if (name.startsWith('vault__')) return 'vault'
			if (name.startsWith('protonmail__')) return 'protonmail'
			return 'unknown'
		},
		serverColor(name) {
			const colors = {
				nextcloud: '#0082c9',
				kuse: '#e94560',
				composio: '#8b5cf6',
				rube: '#22c55e',
				vault: '#f59e0b',
				protonmail: '#6d4aff',
			}
			return colors[name] || '#555'
		},
	},
}
</script>

<style scoped>
.jada-tools {
	padding: 28px;
	overflow-y: auto;
	height: 100%;
}

.jada-tools-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 20px;
}

.jada-tools-header h1 {
	font-size: 24px;
	font-weight: 700;
	color: #fff;
	margin: 0;
}

.jada-tools-input {
	padding: 8px 14px;
	border: 1px solid rgba(255,255,255,0.1);
	border-radius: 10px;
	background: #1a1a24;
	color: #e8e8ef;
	font-size: 13px;
	width: 280px;
}

.jada-tools-input:focus {
	outline: none;
	border-color: #e94560;
}

.jada-tools-input::placeholder { color: #444; }

.jada-tools-filters {
	display: flex;
	gap: 8px;
	margin-bottom: 20px;
	flex-wrap: wrap;
}

.jada-filter-btn {
	padding: 6px 14px;
	border-radius: 20px;
	border: 1px solid rgba(255,255,255,0.08);
	background: transparent;
	color: #8b8b9e;
	font-size: 12px;
	font-weight: 600;
	cursor: pointer;
	transition: all 0.15s;
	text-transform: capitalize;
}

.jada-filter-btn:hover { border-color: rgba(255,255,255,0.2); color: #e8e8ef; }
.jada-filter-btn.active { background: rgba(233, 69, 96, 0.15); border-color: #e94560; color: #e94560; }

.jada-tools-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
	gap: 12px;
}

.jada-tool-card {
	background: #1a1a24;
	border: 1px solid rgba(255,255,255,0.06);
	border-radius: 10px;
	padding: 14px;
	transition: all 0.15s;
}

.jada-tool-card:hover {
	border-color: rgba(255,255,255,0.12);
}

.jada-tool-card-header {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-bottom: 6px;
}

.jada-tool-card-icon { font-size: 14px; }

.jada-tool-card-name {
	font-size: 13px;
	font-weight: 600;
	color: #e8e8ef;
	font-family: 'SF Mono', 'Fira Code', monospace;
}

.jada-tool-card-desc {
	font-size: 12px;
	color: #555;
	margin: 0 0 8px;
	line-height: 1.4;
}

.jada-tool-card-server {
	display: flex;
	align-items: center;
	gap: 6px;
	font-size: 11px;
	color: #8b8b9e;
	text-transform: capitalize;
}

.jada-tool-server-dot {
	width: 6px;
	height: 6px;
	border-radius: 50%;
}

.jada-tools-empty {
	text-align: center;
	padding: 40px;
	color: #555;
	font-size: 14px;
}
</style>
