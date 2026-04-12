<template>
	<div class="jada-dashboard">
		<div class="jada-dashboard-header">
			<h1>Dashboard</h1>
			<button class="jada-btn jada-btn-secondary" @click="$emit('refresh')">
				Refresh
			</button>
		</div>

		<div class="jada-cards">
			<div :class="['jada-card', 'jada-card-status', healthy ? 'healthy' : 'unhealthy']">
				<div class="jada-card-icon">
					<span v-if="healthy">&#10003;</span>
					<span v-else>&#10007;</span>
				</div>
				<div class="jada-card-content">
					<div class="jada-card-label">Agent Status</div>
					<div class="jada-card-value">{{ healthy ? 'Online' : 'Offline' }}</div>
				</div>
			</div>

			<div class="jada-card">
				<div class="jada-card-icon">&#9881;</div>
				<div class="jada-card-content">
					<div class="jada-card-label">Model</div>
					<div class="jada-card-value">{{ model || 'Not configured' }}</div>
				</div>
			</div>

			<div class="jada-card">
				<div class="jada-card-icon">&#9733;</div>
				<div class="jada-card-content">
					<div class="jada-card-label">Skills</div>
					<div class="jada-card-value">{{ skillCount }} installed</div>
				</div>
			</div>

			<div class="jada-card">
				<div class="jada-card-icon">&#128268;</div>
				<div class="jada-card-content">
					<div class="jada-card-label">MCP Servers</div>
					<div class="jada-card-value">{{ mcpCount }} connected</div>
				</div>
			</div>
		</div>

		<div class="jada-section">
			<h2>Quick Actions</h2>
			<div class="jada-actions">
				<button class="jada-btn jada-btn-primary" @click="$parent.currentTab = 'chat'">
					Open Chat
				</button>
				<button class="jada-btn jada-btn-secondary" @click="$parent.currentTab = 'skills'">
					Manage Skills
				</button>
				<button class="jada-btn jada-btn-secondary" @click="$parent.currentTab = 'schedules'">
					View Schedules
				</button>
			</div>
		</div>

		<div class="jada-section" v-if="healthData">
			<h2>System Info</h2>
			<div class="jada-info-grid">
				<div class="jada-info-row" v-for="(value, key) in flatHealth" :key="key">
					<span class="jada-info-key">{{ key }}</span>
					<span class="jada-info-value">{{ value }}</span>
				</div>
			</div>
		</div>
	</div>
</template>

<script>
import api from '../api.js'

export default {
	name: 'DashboardView',
	props: {
		healthy: Boolean,
		healthData: Object,
	},
	data() {
		return {
			model: '',
			skillCount: 0,
			mcpCount: 0,
		}
	},
	computed: {
		flatHealth() {
			if (!this.healthData) return {}
			const flat = {}
			const walk = (obj, prefix = '') => {
				for (const [k, v] of Object.entries(obj)) {
					const key = prefix ? `${prefix}.${k}` : k
					if (v && typeof v === 'object' && !Array.isArray(v)) {
						walk(v, key)
					} else {
						flat[key] = String(v)
					}
				}
			}
			walk(this.healthData)
			return flat
		},
	},
	async mounted() {
		try {
			const skills = await api.getSkills()
			if (Array.isArray(skills)) {
				this.skillCount = skills.length
			} else if (skills && typeof skills === 'object') {
				this.skillCount = Object.keys(skills).length
			}
		} catch { /* ignore */ }

		if (this.healthData) {
			this.model = this.healthData.model || this.healthData.agent?.model || ''
		}
	},
}
</script>

<style scoped>
.jada-dashboard {
	padding: 32px;
	max-width: 1200px;
}

.jada-dashboard-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 28px;
}

.jada-dashboard-header h1 {
	font-size: 28px;
	font-weight: 700;
	color: var(--color-main-text);
}

.jada-cards {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
	gap: 16px;
	margin-bottom: 32px;
}

.jada-card {
	background: var(--color-background-dark);
	border: 1px solid var(--color-border);
	border-radius: 14px;
	padding: 20px;
	display: flex;
	align-items: center;
	gap: 16px;
	transition: transform 0.2s, box-shadow 0.2s;
}

.jada-card:hover {
	transform: translateY(-2px);
	box-shadow: 0 4px 16px rgba(0,0,0,0.08);
}

.jada-card-status.healthy {
	border-color: rgba(74, 222, 128, 0.3);
	background: linear-gradient(135deg, rgba(74, 222, 128, 0.05), rgba(74, 222, 128, 0.02));
}

.jada-card-status.unhealthy {
	border-color: rgba(248, 113, 113, 0.3);
	background: linear-gradient(135deg, rgba(248, 113, 113, 0.05), rgba(248, 113, 113, 0.02));
}

.jada-card-icon {
	font-size: 28px;
	width: 48px;
	height: 48px;
	display: flex;
	align-items: center;
	justify-content: center;
	border-radius: 12px;
	background: rgba(233, 69, 96, 0.1);
	color: #e94560;
	flex-shrink: 0;
}

.jada-card-status.healthy .jada-card-icon {
	background: rgba(74, 222, 128, 0.15);
	color: #4ade80;
}

.jada-card-status.unhealthy .jada-card-icon {
	background: rgba(248, 113, 113, 0.15);
	color: #f87171;
}

.jada-card-label {
	font-size: 12px;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
	text-transform: uppercase;
	letter-spacing: 0.5px;
	margin-bottom: 4px;
}

.jada-card-value {
	font-size: 18px;
	font-weight: 600;
	color: var(--color-main-text);
}

.jada-section {
	margin-bottom: 32px;
}

.jada-section h2 {
	font-size: 18px;
	font-weight: 600;
	color: var(--color-main-text);
	margin-bottom: 16px;
}

.jada-actions {
	display: flex;
	gap: 12px;
	flex-wrap: wrap;
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

.jada-btn-primary {
	background: linear-gradient(135deg, #e94560, #c23152);
	color: #fff;
}

.jada-btn-primary:hover {
	box-shadow: 0 4px 16px rgba(233, 69, 96, 0.4);
	transform: translateY(-1px);
}

.jada-btn-secondary {
	background: var(--color-background-dark);
	color: var(--color-main-text);
	border: 1px solid var(--color-border);
}

.jada-btn-secondary:hover {
	background: var(--color-background-hover);
}

.jada-info-grid {
	background: var(--color-background-dark);
	border: 1px solid var(--color-border);
	border-radius: 14px;
	overflow: hidden;
}

.jada-info-row {
	display: flex;
	padding: 10px 16px;
	border-bottom: 1px solid var(--color-border);
}

.jada-info-row:last-child {
	border-bottom: none;
}

.jada-info-key {
	flex: 0 0 200px;
	font-size: 13px;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
	font-family: monospace;
}

.jada-info-value {
	font-size: 13px;
	color: var(--color-main-text);
	word-break: break-all;
}
</style>
