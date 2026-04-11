<template>
	<div id="jada-agent" class="jada-app">
		<div class="jada-sidebar">
			<div class="jada-sidebar-header">
				<div class="jada-logo">
					<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" class="jada-logo-svg">
						<circle cx="16" cy="16" r="14" fill="#1a1a2e" stroke="#e94560" stroke-width="1.5"/>
						<circle cx="11" cy="13" r="2" fill="#e94560"/>
						<circle cx="21" cy="13" r="2" fill="#e94560"/>
						<path d="M10 20 Q16 25 22 20" stroke="#e94560" stroke-width="1.5" fill="none" stroke-linecap="round"/>
					</svg>
					<span class="jada-logo-text">Jada Agent</span>
				</div>
			</div>
			<nav class="jada-nav">
				<a v-for="tab in tabs"
				   :key="tab.id"
				   :class="['jada-nav-item', { active: currentTab === tab.id }]"
				   @click="currentTab = tab.id">
					<span class="jada-nav-icon" v-html="tab.icon"></span>
					<span class="jada-nav-label">{{ tab.label }}</span>
				</a>
			</nav>
			<div class="jada-sidebar-footer">
				<div :class="['jada-status-badge', healthy ? 'online' : 'offline']">
					<span class="jada-status-dot"></span>
					{{ healthy ? 'Connected' : 'Offline' }}
				</div>
			</div>
		</div>
		<div class="jada-main">
			<DashboardView v-if="currentTab === 'dashboard'" :healthy="healthy" :health-data="healthData" @refresh="checkHealth" />
			<ChatView v-if="currentTab === 'chat'" />
			<SkillsView v-if="currentTab === 'skills'" />
			<SchedulesView v-if="currentTab === 'schedules'" />
			<SettingsView v-if="currentTab === 'settings'" />
		</div>
	</div>
</template>

<script>
import api from './api.js'
import DashboardView from './components/DashboardView.vue'
import ChatView from './components/ChatView.vue'
import SkillsView from './components/SkillsView.vue'
import SchedulesView from './components/SchedulesView.vue'
import SettingsView from './components/SettingsView.vue'

export default {
	name: 'App',
	components: { DashboardView, ChatView, SkillsView, SchedulesView, SettingsView },
	data() {
		return {
			currentTab: 'dashboard',
			healthy: false,
			healthData: null,
			tabs: [
				{ id: 'dashboard', label: 'Dashboard', icon: '&#9673;' },
				{ id: 'chat', label: 'Chat', icon: '&#9993;' },
				{ id: 'skills', label: 'Skills & Tools', icon: '&#9881;' },
				{ id: 'schedules', label: 'Schedules', icon: '&#9202;' },
				{ id: 'settings', label: 'Settings', icon: '&#9881;' },
			],
		}
	},
	async mounted() {
		await this.checkHealth()
		this.healthInterval = setInterval(() => this.checkHealth(), 30000)
	},
	beforeUnmount() {
		clearInterval(this.healthInterval)
	},
	methods: {
		async checkHealth() {
			try {
				const data = await api.getHealth()
				this.healthy = data?.ok === true
				this.healthData = data
			} catch {
				this.healthy = false
				this.healthData = null
			}
		},
	},
}
</script>

<style scoped>
.jada-app {
	display: flex;
	height: 100%;
	min-height: calc(100vh - 50px);
	background: var(--color-main-background);
	font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.jada-sidebar {
	width: 240px;
	min-width: 240px;
	background: linear-gradient(180deg, #0f0f1a 0%, #1a1a2e 100%);
	border-right: 1px solid rgba(233, 69, 96, 0.15);
	display: flex;
	flex-direction: column;
	overflow-y: auto;
}

.jada-sidebar-header {
	padding: 20px 16px 16px;
	border-bottom: 1px solid rgba(255,255,255,0.06);
}

.jada-logo {
	display: flex;
	align-items: center;
	gap: 10px;
}

.jada-logo-svg {
	width: 32px;
	height: 32px;
}

.jada-logo-text {
	font-size: 18px;
	font-weight: 700;
	color: #fff;
	letter-spacing: -0.3px;
}

.jada-nav {
	flex: 1;
	padding: 12px 8px;
}

.jada-nav-item {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 10px 12px;
	border-radius: 10px;
	color: rgba(255,255,255,0.6);
	cursor: pointer;
	transition: all 0.2s ease;
	margin-bottom: 2px;
	text-decoration: none;
}

.jada-nav-item:hover {
	color: #fff;
	background: rgba(233, 69, 96, 0.1);
}

.jada-nav-item.active {
	color: #fff;
	background: linear-gradient(135deg, #e94560 0%, #c23152 100%);
	box-shadow: 0 2px 12px rgba(233, 69, 96, 0.3);
}

.jada-nav-icon {
	font-size: 16px;
	width: 20px;
	text-align: center;
}

.jada-nav-label {
	font-size: 14px;
	font-weight: 500;
}

.jada-sidebar-footer {
	padding: 16px;
	border-top: 1px solid rgba(255,255,255,0.06);
}

.jada-status-badge {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 8px 12px;
	border-radius: 8px;
	font-size: 12px;
	font-weight: 600;
}

.jada-status-badge.online {
	color: #4ade80;
	background: rgba(74, 222, 128, 0.1);
}

.jada-status-badge.offline {
	color: #f87171;
	background: rgba(248, 113, 113, 0.1);
}

.jada-status-dot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
}

.jada-status-badge.online .jada-status-dot {
	background: #4ade80;
	box-shadow: 0 0 6px #4ade80;
}

.jada-status-badge.offline .jada-status-dot {
	background: #f87171;
	box-shadow: 0 0 6px #f87171;
}

.jada-main {
	flex: 1;
	overflow-y: auto;
	padding: 0;
}
</style>
