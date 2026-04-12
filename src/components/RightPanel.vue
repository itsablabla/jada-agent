<template>
	<div class="jada-right-panel">
		<div class="jada-rp-tabs">
			<button :class="['jada-rp-tab', { active: store.rightPanelTab === 'tools' }]" @click="store.rightPanelTab = 'tools'">Tools</button>
			<button :class="['jada-rp-tab', { active: store.rightPanelTab === 'files' }]" @click="store.rightPanelTab = 'files'">Files</button>
			<button :class="['jada-rp-tab', { active: store.rightPanelTab === 'context' }]" @click="store.rightPanelTab = 'context'">Context</button>
		</div>

		<!-- Tools tab -->
		<div v-if="store.rightPanelTab === 'tools'" class="jada-rp-content">
			<h4>MCP Servers</h4>
			<div v-for="server in store.mcpServers" :key="server.name" class="jada-rp-server">
				<span :class="['jada-rp-dot', server.connected ? 'on' : 'off']"></span>
				<span class="jada-rp-server-name">{{ server.name }}</span>
				<span class="jada-rp-server-tools">{{ server.tools }}</span>
			</div>
			<div v-if="!store.mcpServers.length" class="jada-rp-empty">No servers connected</div>

			<h4>Recent Tool Calls</h4>
			<div v-for="tc in store.recentToolCalls.slice(0, 8)" :key="tc.name + tc.timestamp" class="jada-rp-tool-call">
				<span class="jada-rp-tc-icon">&#9989;</span>
				<div class="jada-rp-tc-info">
					<div class="jada-rp-tc-name">{{ tc.name }}</div>
					<div class="jada-rp-tc-time">{{ formatTime(tc.timestamp) }}</div>
				</div>
			</div>
			<div v-if="!store.recentToolCalls.length" class="jada-rp-empty">No recent tool calls</div>
		</div>

		<!-- Files tab -->
		<div v-if="store.rightPanelTab === 'files'" class="jada-rp-content">
			<h4>Workspace Files</h4>
			<div class="jada-rp-empty">
				Files from the active workspace will appear here when the agent accesses them.
			</div>
		</div>

		<!-- Context tab -->
		<div v-if="store.rightPanelTab === 'context'" class="jada-rp-content">
			<h4>Workspace Context</h4>
			<div class="jada-rp-context-item">
				<span class="jada-rp-context-label">Active Workspace</span>
				<span class="jada-rp-context-value">{{ activeWs.name }}</span>
			</div>
			<div class="jada-rp-context-item">
				<span class="jada-rp-context-label">Total Tools</span>
				<span class="jada-rp-context-value">{{ store.totalTools }}</span>
			</div>
			<div class="jada-rp-context-item">
				<span class="jada-rp-context-label">Agent Status</span>
				<span :class="['jada-rp-context-value', store.healthy ? 'green' : 'red']">{{ store.healthy ? 'Online' : 'Offline' }}</span>
			</div>
		</div>
	</div>
</template>

<script>
import { store, actions } from '../store.js'

export default {
	name: 'RightPanel',
	data() {
		return { store }
	},
	computed: {
		activeWs() {
			return actions.getActiveWorkspace()
		},
	},
	methods: {
		formatTime(date) {
			if (!date) return ''
			return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
		},
	},
}
</script>

<style scoped>
.jada-right-panel {
	width: 300px;
	min-width: 300px;
	background: #111119;
	border-left: 1px solid rgba(255,255,255,0.06);
	display: flex;
	flex-direction: column;
	overflow: hidden;
}

.jada-rp-tabs {
	display: flex;
	border-bottom: 1px solid rgba(255,255,255,0.06);
}

.jada-rp-tab {
	flex: 1;
	padding: 10px;
	background: none;
	border: none;
	color: #555;
	font-size: 12px;
	font-weight: 600;
	cursor: pointer;
	transition: all 0.15s;
	border-bottom: 2px solid transparent;
}

.jada-rp-tab:hover { color: #8b8b9e; }
.jada-rp-tab.active { color: #e94560; border-bottom-color: #e94560; }

.jada-rp-content {
	flex: 1;
	overflow-y: auto;
	padding: 12px;
}

.jada-rp-content h4 {
	font-size: 11px;
	font-weight: 700;
	color: #555;
	text-transform: uppercase;
	letter-spacing: 0.5px;
	margin: 12px 0 8px;
}

.jada-rp-content h4:first-child { margin-top: 0; }

.jada-rp-server {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 6px 0;
	font-size: 13px;
}

.jada-rp-dot {
	width: 6px;
	height: 6px;
	border-radius: 50%;
}

.jada-rp-dot.on { background: #4ade80; }
.jada-rp-dot.off { background: #f87171; }

.jada-rp-server-name {
	flex: 1;
	color: #e8e8ef;
	text-transform: capitalize;
}

.jada-rp-server-tools {
	color: #555;
	font-size: 12px;
}

.jada-rp-tool-call {
	display: flex;
	align-items: flex-start;
	gap: 8px;
	padding: 6px 0;
}

.jada-rp-tc-icon { font-size: 12px; }

.jada-rp-tc-name {
	font-size: 12px;
	font-family: 'SF Mono', 'Fira Code', monospace;
	color: #4ade80;
}

.jada-rp-tc-time {
	font-size: 10px;
	color: #444;
}

.jada-rp-empty {
	font-size: 12px;
	color: #444;
	padding: 8px 0;
}

.jada-rp-context-item {
	display: flex;
	justify-content: space-between;
	padding: 8px 0;
	border-bottom: 1px solid rgba(255,255,255,0.04);
}

.jada-rp-context-label { font-size: 12px; color: #555; }
.jada-rp-context-value { font-size: 12px; color: #e8e8ef; font-weight: 600; }
.jada-rp-context-value.green { color: #4ade80; }
.jada-rp-context-value.red { color: #f87171; }
</style>
