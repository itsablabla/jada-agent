<template>
	<div class="jada-profile">
		<div class="jada-profile-header">
			<div class="jada-profile-avatar">{{ userInitials }}</div>
			<div class="jada-profile-info">
				<h1>{{ userName }}</h1>
				<div class="jada-profile-role">Admin &middot; Nextcloud Owner</div>
				<div class="jada-profile-email">{{ store.userProfile?.email || '' }}</div>
			</div>
		</div>

		<div class="jada-profile-stats">
			<div class="jada-profile-stat">
				<div class="jada-profile-stat-value">{{ store.conversations.length }}</div>
				<div class="jada-profile-stat-label">Conversations</div>
			</div>
			<div class="jada-profile-stat">
				<div class="jada-profile-stat-value">{{ store.recentToolCalls.length }}</div>
				<div class="jada-profile-stat-label">Tool Calls</div>
			</div>
			<div class="jada-profile-stat">
				<div class="jada-profile-stat-value">{{ store.workspaces.length }}</div>
				<div class="jada-profile-stat-label">Workspaces</div>
			</div>
		</div>

		<div class="jada-profile-section">
			<h3>Workspace Memberships</h3>
			<div v-for="ws in store.workspaces" :key="ws.id" class="jada-profile-ws-item">
				<span class="jada-ws-dot" :style="{ background: ws.color }"></span>
				<span class="jada-profile-ws-name">{{ ws.name }}</span>
				<span v-if="ws.isRoot" class="jada-profile-ws-badge">HOME</span>
				<span class="jada-profile-ws-role">Owner</span>
			</div>
		</div>

		<div class="jada-profile-section">
			<h3>Multi-User Isolation</h3>
			<div class="jada-profile-info-box">
				<p>Each Nextcloud user gets isolated chat history and workspace configuration.</p>
				<ul>
					<li>Private conversations per user</li>
					<li>Per-user workspace preferences</li>
					<li>Agent authenticates via each user's own app password</li>
					<li>Admin can view all workspaces</li>
				</ul>
			</div>
		</div>

		<div class="jada-profile-section">
			<h3>Nextcloud Users with Jada Access</h3>
			<div class="jada-profile-users">
				<div class="jada-profile-user-item current">
					<div class="jada-profile-user-avatar">{{ userInitials }}</div>
					<div>
						<div class="jada-profile-user-name">{{ userName }}</div>
						<div class="jada-profile-user-role">Admin (You)</div>
					</div>
				</div>
			</div>
			<button class="jada-btn-secondary" style="margin-top: 12px;">+ Invite Nextcloud User</button>
		</div>
	</div>
</template>

<script>
import { store } from '../store.js'

export default {
	name: 'UserProfileView',
	data() {
		return { store }
	},
	computed: {
		userName() {
			return store.userProfile?.displayName || store.userProfile?.uid || 'User'
		},
		userInitials() {
			const name = this.userName
			const parts = name.split(' ')
			if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
			return name.substring(0, 2).toUpperCase()
		},
	},
}
</script>

<style scoped>
.jada-profile {
	padding: 28px;
	overflow-y: auto;
	height: 100%;
	max-width: 700px;
}

.jada-profile-header {
	display: flex;
	align-items: center;
	gap: 20px;
	margin-bottom: 28px;
}

.jada-profile-avatar {
	width: 72px;
	height: 72px;
	border-radius: 16px;
	background: linear-gradient(135deg, #e94560, #c23152);
	color: #fff;
	font-size: 24px;
	font-weight: 700;
	display: flex;
	align-items: center;
	justify-content: center;
}

.jada-profile-info h1 {
	font-size: 24px;
	font-weight: 700;
	color: #fff;
	margin: 0 0 4px;
}

.jada-profile-role {
	font-size: 14px;
	color: #8b8b9e;
}

.jada-profile-email {
	font-size: 13px;
	color: #555;
	margin-top: 2px;
}

.jada-profile-stats {
	display: flex;
	gap: 16px;
	margin-bottom: 28px;
}

.jada-profile-stat {
	background: #1a1a24;
	border: 1px solid rgba(255,255,255,0.06);
	border-radius: 12px;
	padding: 16px 28px;
	text-align: center;
}

.jada-profile-stat-value {
	font-size: 28px;
	font-weight: 700;
	color: #e94560;
}

.jada-profile-stat-label {
	font-size: 12px;
	color: #555;
	margin-top: 4px;
}

.jada-profile-section {
	margin-bottom: 28px;
}

.jada-profile-section h3 {
	font-size: 16px;
	font-weight: 600;
	color: #e8e8ef;
	margin: 0 0 12px;
}

.jada-profile-ws-item {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 10px 14px;
	border-radius: 8px;
	background: #1a1a24;
	margin-bottom: 4px;
}

.jada-ws-dot {
	width: 10px;
	height: 10px;
	border-radius: 50%;
}

.jada-profile-ws-name {
	flex: 1;
	font-size: 13px;
	color: #e8e8ef;
}

.jada-profile-ws-badge {
	padding: 2px 6px;
	border-radius: 4px;
	background: rgba(0, 130, 201, 0.2);
	color: #0082c9;
	font-size: 9px;
	font-weight: 700;
}

.jada-profile-ws-role {
	font-size: 12px;
	color: #555;
}

.jada-profile-info-box {
	background: #1a1a24;
	border: 1px solid rgba(255,255,255,0.06);
	border-radius: 12px;
	padding: 16px;
}

.jada-profile-info-box p {
	font-size: 13px;
	color: #8b8b9e;
	margin: 0 0 10px;
}

.jada-profile-info-box ul {
	margin: 0;
	padding-left: 20px;
}

.jada-profile-info-box li {
	font-size: 13px;
	color: #8b8b9e;
	margin-bottom: 4px;
}

.jada-profile-users {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.jada-profile-user-item {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 10px 14px;
	border-radius: 8px;
	background: #1a1a24;
}

.jada-profile-user-item.current {
	border: 1px solid rgba(233, 69, 96, 0.2);
}

.jada-profile-user-avatar {
	width: 36px;
	height: 36px;
	border-radius: 8px;
	background: linear-gradient(135deg, #e94560, #c23152);
	color: #fff;
	font-size: 13px;
	font-weight: 700;
	display: flex;
	align-items: center;
	justify-content: center;
}

.jada-profile-user-name {
	font-size: 14px;
	font-weight: 600;
	color: #e8e8ef;
}

.jada-profile-user-role {
	font-size: 12px;
	color: #555;
}

.jada-btn-secondary {
	padding: 8px 18px;
	border-radius: 10px;
	border: 1px solid rgba(255,255,255,0.1);
	background: transparent;
	color: #8b8b9e;
	font-size: 13px;
	font-weight: 600;
	cursor: pointer;
}

.jada-btn-secondary:hover {
	border-color: rgba(255,255,255,0.2);
	color: #e8e8ef;
}
</style>
