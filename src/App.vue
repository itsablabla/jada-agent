<template>
	<div :class="['jada-app', { mobile: store.isMobile }]">
		<!-- Left Sidebar -->
		<div v-if="!store.isMobile || store.mobileSidebarOpen" class="jada-sidebar">
			<div class="jada-sidebar-header">
				<div class="jada-logo">
					<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" class="jada-logo-svg">
						<circle cx="16" cy="16" r="14" fill="#1a1a2e" stroke="#e94560" stroke-width="1.5"/>
						<circle cx="11" cy="13" r="2" fill="#e94560"/>
						<circle cx="21" cy="13" r="2" fill="#e94560"/>
						<path d="M10 20 Q16 25 22 20" stroke="#e94560" stroke-width="1.5" fill="none" stroke-linecap="round"/>
					</svg>
					<span class="jada-logo-text">Jada AI</span>
				</div>
				<button class="jada-new-chat-btn" @click="actions.startNewChat()">+ New Chat</button>
			</div>

			<!-- Workspace selector -->
			<div class="jada-ws-selector" @click="wsDropdownOpen = !wsDropdownOpen">
				<span class="jada-ws-dot" :style="{ background: activeWs.color }"></span>
				<span class="jada-ws-name">{{ activeWs.name }}</span>
				<span v-if="activeWs.isRoot" class="jada-ws-pin">&#128204;</span>
				<span class="jada-ws-arrow">&#9662;</span>
			</div>
			<div v-if="wsDropdownOpen" class="jada-ws-dropdown">
				<div
					v-for="ws in store.workspaces"
					:key="ws.id"
					:class="['jada-ws-dropdown-item', { active: ws.id === store.activeWorkspaceId, root: ws.isRoot }]"
					@click="selectWorkspace(ws.id)"
				>
					<span class="jada-ws-dot" :style="{ background: ws.color }"></span>
					<span>{{ ws.name }}</span>
					<span v-if="ws.isRoot" class="jada-ws-pin">&#128204;</span>
					<span class="jada-ws-count">{{ ws.chatCount || 0 }}</span>
				</div>
			</div>

			<!-- Navigation -->
			<nav class="jada-nav">
				<a :class="['jada-nav-item', { active: store.currentView === 'chat' }]" @click="actions.navigate('chat')">
					<span class="jada-nav-icon">&#128172;</span>
					<span class="jada-nav-label">Chat</span>
				</a>
				<a :class="['jada-nav-item', { active: store.currentView === 'workspaces' }]" @click="actions.navigate('workspaces')">
					<span class="jada-nav-icon">&#128193;</span>
					<span class="jada-nav-label">Workspaces</span>
				</a>
				<a :class="['jada-nav-item', { active: store.currentView === 'document-editor' }]" @click="actions.navigate('document-editor')">
					<span class="jada-nav-icon">&#128196;</span>
					<span class="jada-nav-label">Documents</span>
				</a>
				<a :class="['jada-nav-item', { active: store.currentView === 'tool-explorer' }]" @click="actions.navigate('tool-explorer')">
					<span class="jada-nav-icon">&#128295;</span>
					<span class="jada-nav-label">Tools</span>
				</a>
				<a :class="['jada-nav-item', { active: store.currentView === 'search' }]" @click="actions.navigate('search')">
					<span class="jada-nav-icon">&#128269;</span>
					<span class="jada-nav-label">Search</span>
				</a>
				<a :class="['jada-nav-item', { active: store.currentView === 'settings' }]" @click="actions.navigate('settings')">
					<span class="jada-nav-icon">&#9881;</span>
					<span class="jada-nav-label">Settings</span>
				</a>
			</nav>

			<!-- Conversation list (only in chat view) -->
			<div v-if="store.currentView === 'chat'" class="jada-conv-list">
				<div class="jada-conv-section-label">Today</div>
				<div
					v-for="conv in filteredConversations"
					:key="conv.id"
					:class="['jada-conv-item', { active: conv.id === store.activeConversationId }]"
					@click="openConversation(conv)"
				>
					<span class="jada-conv-icon">&#128172;</span>
					<div class="jada-conv-info">
						<div class="jada-conv-title">{{ conv.title || conv.id }}</div>
						<div class="jada-conv-preview">{{ conv.lastMessage || '' }}</div>
					</div>
				</div>
			</div>

			<!-- Sidebar footer -->
			<div class="jada-sidebar-footer">
				<div class="jada-user-info" @click="actions.navigate('profile')">
					<div class="jada-user-avatar">{{ userInitials }}</div>
					<div class="jada-user-meta">
						<div class="jada-user-name">{{ userName }}</div>
						<div class="jada-user-role">Admin</div>
					</div>
				</div>
				<div class="jada-server-status">
					<span :class="['jada-status-dot', store.healthy ? 'online' : 'offline']"></span>
					{{ store.mcpServers.length }} servers &middot; {{ store.totalTools }} tools
				</div>
			</div>
		</div>

		<!-- Main content area -->
		<div class="jada-main">
			<!-- Mobile header -->
			<div v-if="store.isMobile" class="jada-mobile-header">
				<button class="jada-hamburger" @click="store.mobileSidebarOpen = !store.mobileSidebarOpen">&#9776;</button>
				<span class="jada-mobile-title">{{ viewTitle }}</span>
				<div class="jada-user-avatar small" @click="actions.navigate('profile')">{{ userInitials }}</div>
			</div>

			<ChatView v-if="store.currentView === 'chat'" />
			<WorkspacesView v-else-if="store.currentView === 'workspaces'" />
			<WorkspaceDetailView v-else-if="store.currentView === 'workspace-detail'" />
			<DocumentEditorView v-else-if="store.currentView === 'document-editor'" />
			<ToolExplorerView v-else-if="store.currentView === 'tool-explorer'" />
			<SearchView v-else-if="store.currentView === 'search'" />
			<SettingsView v-else-if="store.currentView === 'settings'" />
			<UserProfileView v-else-if="store.currentView === 'profile'" />
		</div>

		<!-- Right panel (desktop only, chat view) -->
		<RightPanel v-if="!store.isMobile && store.currentView === 'chat' && store.rightPanelOpen" />

		<!-- Mobile overlay -->
		<div v-if="store.isMobile && store.mobileSidebarOpen" class="jada-overlay" @click="store.mobileSidebarOpen = false"></div>
	</div>
</template>

<script>
import { store, actions } from './store.js'
import ChatView from './components/ChatView.vue'
import WorkspacesView from './components/WorkspacesView.vue'
import WorkspaceDetailView from './components/WorkspaceDetailView.vue'
import DocumentEditorView from './components/DocumentEditorView.vue'
import ToolExplorerView from './components/ToolExplorerView.vue'
import SearchView from './components/SearchView.vue'
import SettingsView from './components/SettingsView.vue'
import UserProfileView from './components/UserProfileView.vue'
import RightPanel from './components/RightPanel.vue'

export default {
	name: 'App',
	components: {
		ChatView,
		WorkspacesView,
		WorkspaceDetailView,
		DocumentEditorView,
		ToolExplorerView,
		SearchView,
		SettingsView,
		UserProfileView,
		RightPanel,
	},
	data() {
		return {
			store,
			actions,
			wsDropdownOpen: false,
		}
	},
	computed: {
		activeWs() {
			return actions.getActiveWorkspace()
		},
		userName() {
			return store.userProfile?.displayName || store.userProfile?.uid || 'User'
		},
		userInitials() {
			const name = this.userName
			const parts = name.split(' ')
			if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
			return name.substring(0, 2).toUpperCase()
		},
		filteredConversations() {
			return store.conversations.filter(c =>
				!store.activeWorkspaceId || c.workspace === store.activeWorkspaceId || !c.workspace
			).slice(0, 20)
		},
		viewTitle() {
			const titles = {
				chat: 'Chat',
				workspaces: 'Workspaces',
				'workspace-detail': this.activeWs.name,
				'document-editor': 'Documents',
				'tool-explorer': 'Tools',
				search: 'Search',
				settings: 'Settings',
				profile: 'Profile',
			}
			return titles[store.currentView] || 'Jada AI'
		},
	},
	async mounted() {
		await actions.init()
		this.healthInterval = setInterval(() => actions.refreshHealth(), 30000)
	},
	beforeUnmount() {
		clearInterval(this.healthInterval)
	},
	methods: {
		selectWorkspace(id) {
			actions.setActiveWorkspace(id)
			this.wsDropdownOpen = false
		},
		openConversation(conv) {
			store.activeConversationId = conv.id
			store.currentView = 'chat'
		},
	},
}
</script>

<style scoped>
.jada-app {
	display: flex;
	height: 100%;
	min-height: calc(100vh - 50px);
	background: #0d0d14;
	font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	color: #e8e8ef;
	position: relative;
}

/* ─── Sidebar ─── */
.jada-sidebar {
	width: 280px;
	min-width: 280px;
	background: #111119;
	border-right: 1px solid rgba(255,255,255,0.06);
	display: flex;
	flex-direction: column;
	overflow-y: auto;
	z-index: 100;
}

.mobile .jada-sidebar {
	position: fixed;
	top: 0;
	left: 0;
	bottom: 0;
	width: 300px;
	z-index: 1000;
	box-shadow: 4px 0 24px rgba(0,0,0,0.5);
}

.jada-sidebar-header {
	padding: 16px;
	border-bottom: 1px solid rgba(255,255,255,0.06);
	display: flex;
	align-items: center;
	justify-content: space-between;
}

.jada-logo {
	display: flex;
	align-items: center;
	gap: 10px;
}

.jada-logo-svg {
	width: 28px;
	height: 28px;
}

.jada-logo-text {
	font-size: 17px;
	font-weight: 700;
	color: #fff;
}

.jada-new-chat-btn {
	padding: 6px 14px;
	border-radius: 8px;
	border: none;
	background: linear-gradient(135deg, #e94560, #c23152);
	color: #fff;
	font-size: 12px;
	font-weight: 600;
	cursor: pointer;
	transition: all 0.2s;
}

.jada-new-chat-btn:hover {
	box-shadow: 0 2px 10px rgba(233, 69, 96, 0.4);
}

/* ─── Workspace selector ─── */
.jada-ws-selector {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 10px 16px;
	margin: 8px 12px;
	border-radius: 10px;
	background: rgba(255,255,255,0.04);
	cursor: pointer;
	transition: background 0.2s;
}

.jada-ws-selector:hover {
	background: rgba(255,255,255,0.08);
}

.jada-ws-dot {
	width: 10px;
	height: 10px;
	border-radius: 50%;
	flex-shrink: 0;
}

.jada-ws-name {
	flex: 1;
	font-size: 13px;
	font-weight: 600;
	color: #fff;
}

.jada-ws-pin {
	font-size: 12px;
}

.jada-ws-arrow {
	font-size: 10px;
	color: #8b8b9e;
}

.jada-ws-dropdown {
	margin: 0 12px 8px;
	background: #1a1a24;
	border: 1px solid rgba(255,255,255,0.08);
	border-radius: 10px;
	overflow: hidden;
}

.jada-ws-dropdown-item {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 8px 12px;
	font-size: 13px;
	color: #8b8b9e;
	cursor: pointer;
	transition: all 0.15s;
}

.jada-ws-dropdown-item:hover {
	background: rgba(255,255,255,0.05);
	color: #e8e8ef;
}

.jada-ws-dropdown-item.active {
	background: rgba(233, 69, 96, 0.15);
	color: #e94560;
}

.jada-ws-dropdown-item.root {
	border-left: 2px solid #0082c9;
}

.jada-ws-count {
	margin-left: auto;
	font-size: 11px;
	color: #555;
}

/* ─── Navigation ─── */
.jada-nav {
	padding: 8px;
}

.jada-nav-item {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 9px 12px;
	border-radius: 8px;
	color: #8b8b9e;
	cursor: pointer;
	transition: all 0.15s;
	text-decoration: none;
	font-size: 13px;
}

.jada-nav-item:hover {
	color: #e8e8ef;
	background: rgba(255,255,255,0.04);
}

.jada-nav-item.active {
	color: #fff;
	background: rgba(233, 69, 96, 0.15);
}

.jada-nav-icon {
	font-size: 15px;
	width: 20px;
	text-align: center;
}

.jada-nav-label {
	font-weight: 500;
}

/* ─── Conversation list ─── */
.jada-conv-list {
	flex: 1;
	overflow-y: auto;
	padding: 0 8px;
	border-top: 1px solid rgba(255,255,255,0.04);
	margin-top: 4px;
}

.jada-conv-section-label {
	font-size: 11px;
	font-weight: 600;
	color: #555;
	text-transform: uppercase;
	letter-spacing: 0.5px;
	padding: 12px 12px 4px;
}

.jada-conv-item {
	display: flex;
	align-items: flex-start;
	gap: 10px;
	padding: 8px 12px;
	border-radius: 8px;
	cursor: pointer;
	transition: background 0.15s;
}

.jada-conv-item:hover {
	background: rgba(255,255,255,0.04);
}

.jada-conv-item.active {
	background: rgba(233, 69, 96, 0.1);
}

.jada-conv-icon {
	font-size: 14px;
	margin-top: 2px;
}

.jada-conv-info {
	flex: 1;
	min-width: 0;
}

.jada-conv-title {
	font-size: 13px;
	font-weight: 500;
	color: #e8e8ef;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.jada-conv-preview {
	font-size: 11px;
	color: #555;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	margin-top: 2px;
}

/* ─── Sidebar footer ─── */
.jada-sidebar-footer {
	padding: 12px 16px;
	border-top: 1px solid rgba(255,255,255,0.06);
	margin-top: auto;
}

.jada-user-info {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 6px 0;
	cursor: pointer;
}

.jada-user-info:hover .jada-user-name {
	color: #e94560;
}

.jada-user-avatar {
	width: 32px;
	height: 32px;
	border-radius: 8px;
	background: linear-gradient(135deg, #e94560, #c23152);
	color: #fff;
	font-size: 12px;
	font-weight: 700;
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
}

.jada-user-avatar.small {
	width: 28px;
	height: 28px;
	font-size: 11px;
}

.jada-user-name {
	font-size: 13px;
	font-weight: 600;
	color: #e8e8ef;
	transition: color 0.15s;
}

.jada-user-role {
	font-size: 11px;
	color: #555;
}

.jada-server-status {
	font-size: 11px;
	color: #555;
	display: flex;
	align-items: center;
	gap: 6px;
	margin-top: 8px;
}

.jada-status-dot {
	width: 6px;
	height: 6px;
	border-radius: 50%;
}

.jada-status-dot.online {
	background: #4ade80;
	box-shadow: 0 0 6px #4ade80;
}

.jada-status-dot.offline {
	background: #f87171;
}

/* ─── Main content ─── */
.jada-main {
	flex: 1;
	overflow: hidden;
	display: flex;
	flex-direction: column;
	background: #16161f;
	min-width: 0;
}

/* ─── Mobile ─── */
.jada-mobile-header {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 10px 16px;
	border-bottom: 1px solid rgba(255,255,255,0.06);
	background: #111119;
}

.jada-hamburger {
	background: none;
	border: none;
	color: #e8e8ef;
	font-size: 20px;
	cursor: pointer;
	padding: 4px;
}

.jada-mobile-title {
	flex: 1;
	font-size: 16px;
	font-weight: 600;
}

.jada-overlay {
	position: fixed;
	inset: 0;
	background: rgba(0,0,0,0.5);
	z-index: 999;
}
</style>
