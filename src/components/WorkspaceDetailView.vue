<template>
	<div class="jada-ws-detail">
		<div class="jada-ws-detail-header">
			<button class="jada-back-btn" @click="store.currentView = 'workspaces'">&larr; Workspaces</button>
			<div class="jada-ws-detail-title">
				<span class="jada-ws-dot" :style="{ background: ws.color }"></span>
				<h1>{{ ws.name }}</h1>
				<span v-if="ws.isRoot" class="jada-ws-badge">HOME</span>
			</div>
			<p class="jada-ws-detail-desc">{{ ws.description }}</p>
		</div>

		<div class="jada-ws-detail-stats">
			<div class="jada-stat-card">
				<div class="jada-stat-value">{{ ws.chatCount || 0 }}</div>
				<div class="jada-stat-label">Conversations</div>
			</div>
			<div class="jada-stat-card">
				<div class="jada-stat-value">{{ ws.toolCalls || 0 }}</div>
				<div class="jada-stat-label">Tool Calls</div>
			</div>
			<div class="jada-stat-card">
				<div class="jada-stat-value">{{ ws.tags?.length || 0 }}</div>
				<div class="jada-stat-label">Tags</div>
			</div>
		</div>

		<div class="jada-ws-detail-actions">
			<button class="jada-btn-primary" @click="startChat">Start Chat in {{ ws.name }}</button>
			<button class="jada-btn-secondary" @click="openDocs">Open Documents</button>
		</div>

		<h3>Recent Conversations</h3>
		<div v-if="wsConversations.length" class="jada-ws-conv-list">
			<div v-for="conv in wsConversations" :key="conv.id" class="jada-ws-conv-item" @click="openConversation(conv)">
				<span class="jada-conv-icon">&#128172;</span>
				<div class="jada-conv-meta">
					<div class="jada-conv-title">{{ conv.title || conv.id }}</div>
					<div class="jada-conv-time">{{ conv.lastMessage || 'No messages yet' }}</div>
				</div>
			</div>
		</div>
		<div v-else class="jada-ws-empty">
			No conversations in this workspace yet. Start one above.
		</div>
	</div>
</template>

<script>
import { store, actions } from '../store.js'

export default {
	name: 'WorkspaceDetailView',
	data() {
		return { store }
	},
	computed: {
		ws() {
			return actions.getActiveWorkspace()
		},
		wsConversations() {
			return store.conversations.filter(c => c.workspace === store.activeWorkspaceId).slice(0, 10)
		},
	},
	methods: {
		startChat() {
			actions.startNewChat()
		},
		openDocs() {
			store.currentView = 'document-editor'
		},
		openConversation(conv) {
			store.activeConversationId = conv.id
			store.currentView = 'chat'
		},
	},
}
</script>

<style scoped>
.jada-ws-detail {
	padding: 28px;
	overflow-y: auto;
	height: 100%;
}

.jada-back-btn {
	background: none;
	border: none;
	color: #8b8b9e;
	font-size: 13px;
	cursor: pointer;
	padding: 0;
	margin-bottom: 16px;
	display: block;
}

.jada-back-btn:hover { color: #e94560; }

.jada-ws-detail-title {
	display: flex;
	align-items: center;
	gap: 12px;
	margin-bottom: 8px;
}

.jada-ws-dot {
	width: 14px;
	height: 14px;
	border-radius: 50%;
}

.jada-ws-detail-title h1 {
	font-size: 24px;
	font-weight: 700;
	color: #fff;
	margin: 0;
}

.jada-ws-badge {
	padding: 2px 8px;
	border-radius: 4px;
	background: rgba(0, 130, 201, 0.2);
	color: #0082c9;
	font-size: 10px;
	font-weight: 700;
}

.jada-ws-detail-desc {
	font-size: 14px;
	color: #8b8b9e;
	margin: 0 0 24px;
}

.jada-ws-detail-stats {
	display: flex;
	gap: 16px;
	margin-bottom: 24px;
}

.jada-stat-card {
	background: #1a1a24;
	border: 1px solid rgba(255,255,255,0.06);
	border-radius: 12px;
	padding: 16px 24px;
	text-align: center;
}

.jada-stat-value {
	font-size: 24px;
	font-weight: 700;
	color: #e94560;
}

.jada-stat-label {
	font-size: 12px;
	color: #555;
	margin-top: 4px;
}

.jada-ws-detail-actions {
	display: flex;
	gap: 12px;
	margin-bottom: 28px;
}

.jada-btn-primary {
	padding: 10px 20px;
	border-radius: 10px;
	border: none;
	background: linear-gradient(135deg, #e94560, #c23152);
	color: #fff;
	font-size: 13px;
	font-weight: 600;
	cursor: pointer;
}

.jada-btn-secondary {
	padding: 10px 20px;
	border-radius: 10px;
	border: 1px solid rgba(255,255,255,0.1);
	background: transparent;
	color: #8b8b9e;
	font-size: 13px;
	font-weight: 600;
	cursor: pointer;
}

h3 {
	font-size: 16px;
	font-weight: 600;
	color: #e8e8ef;
	margin: 0 0 12px;
}

.jada-ws-conv-list {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.jada-ws-conv-item {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 10px 14px;
	border-radius: 10px;
	background: #1a1a24;
	cursor: pointer;
	transition: background 0.15s;
}

.jada-ws-conv-item:hover {
	background: rgba(233, 69, 96, 0.1);
}

.jada-conv-icon { font-size: 16px; }

.jada-conv-title {
	font-size: 13px;
	font-weight: 500;
	color: #e8e8ef;
}

.jada-conv-time {
	font-size: 11px;
	color: #555;
}

.jada-ws-empty {
	font-size: 13px;
	color: #555;
	padding: 16px;
}
</style>
