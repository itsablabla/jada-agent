<template>
	<div class="jada-workspaces">
		<div class="jada-ws-header">
			<h1>Workspaces</h1>
			<button class="jada-btn-primary" @click="showCreate = true">+ New Workspace</button>
		</div>

		<div class="jada-ws-grid">
			<!-- Nextcloud root workspace always first -->
			<div
				v-for="ws in store.workspaces"
				:key="ws.id"
				:class="['jada-ws-card', { root: ws.isRoot }]"
				@click="openWorkspace(ws)"
			>
				<div class="jada-ws-card-header">
					<span class="jada-ws-card-dot" :style="{ background: ws.color }"></span>
					<span class="jada-ws-card-name">{{ ws.name }}</span>
					<span v-if="ws.isRoot" class="jada-ws-card-badge">HOME</span>
				</div>
				<p class="jada-ws-card-desc">{{ ws.description }}</p>
				<div class="jada-ws-card-tags">
					<span v-for="tag in (ws.tags || []).slice(0, 4)" :key="tag" class="jada-ws-tag">{{ tag }}</span>
				</div>
				<div class="jada-ws-card-stats">
					<span>{{ ws.chatCount || 0 }} chats</span>
					<span>&middot;</span>
					<span>{{ ws.toolCalls || 0 }} tool calls</span>
				</div>
			</div>
		</div>

		<!-- Create workspace modal -->
		<div v-if="showCreate" class="jada-modal-overlay" @click.self="showCreate = false">
			<div class="jada-modal">
				<h3>Create Workspace</h3>
				<div class="jada-form-group">
					<label>Name</label>
					<input v-model="newWs.name" placeholder="e.g., Marketing" />
				</div>
				<div class="jada-form-group">
					<label>Description</label>
					<textarea v-model="newWs.description" placeholder="What is this workspace for?" rows="3"></textarea>
				</div>
				<div class="jada-form-group">
					<label>Color</label>
					<div class="jada-color-options">
						<button
							v-for="c in colorOptions"
							:key="c"
							:class="['jada-color-btn', { selected: newWs.color === c }]"
							:style="{ background: c }"
							@click="newWs.color = c"
						></button>
					</div>
				</div>
				<div class="jada-modal-actions">
					<button class="jada-btn-secondary" @click="showCreate = false">Cancel</button>
					<button class="jada-btn-primary" @click="handleCreate" :disabled="!newWs.name.trim()">Create</button>
				</div>
			</div>
		</div>
	</div>
</template>

<script>
import { store, actions } from '../store.js'
import api from '../api.js'

export default {
	name: 'WorkspacesView',
	data() {
		return {
			store,
			showCreate: false,
			newWs: { name: '', description: '', color: '#e94560' },
			colorOptions: ['#e94560', '#0082c9', '#008061', '#8b5cf6', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4', '#f97316'],
		}
	},
	methods: {
		openWorkspace(ws) {
			actions.setActiveWorkspace(ws.id)
			store.currentView = 'workspace-detail'
		},
		async handleCreate() {
			if (!this.newWs.name.trim()) return
			const ws = {
				id: 'ws-' + Date.now(),
				name: this.newWs.name.trim(),
				description: this.newWs.description.trim(),
				color: this.newWs.color,
				isRoot: false,
				tags: [],
				chatCount: 0,
				toolCalls: 0,
				lastActive: null,
			}
			try {
				await api.createWorkspace(ws)
			} catch {
				// API may not exist yet — just add locally
			}
			store.workspaces.push(ws)
			this.showCreate = false
			this.newWs = { name: '', description: '', color: '#e94560' }
		},
	},
}
</script>

<style scoped>
.jada-workspaces {
	padding: 28px;
	overflow-y: auto;
	height: 100%;
}

.jada-ws-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 24px;
}

.jada-ws-header h1 {
	font-size: 24px;
	font-weight: 700;
	color: #fff;
	margin: 0;
}

.jada-ws-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
	gap: 16px;
}

.jada-ws-card {
	background: #1a1a24;
	border: 1px solid rgba(255,255,255,0.06);
	border-radius: 14px;
	padding: 20px;
	cursor: pointer;
	transition: all 0.2s;
}

.jada-ws-card:hover {
	transform: translateY(-2px);
	box-shadow: 0 4px 20px rgba(0,0,0,0.3);
	border-color: rgba(255,255,255,0.12);
}

.jada-ws-card.root {
	border-color: rgba(0, 130, 201, 0.4);
	background: linear-gradient(135deg, rgba(0, 130, 201, 0.08), transparent);
}

.jada-ws-card-header {
	display: flex;
	align-items: center;
	gap: 10px;
	margin-bottom: 10px;
}

.jada-ws-card-dot {
	width: 12px;
	height: 12px;
	border-radius: 50%;
}

.jada-ws-card-name {
	font-size: 16px;
	font-weight: 600;
	color: #fff;
}

.jada-ws-card-badge {
	padding: 2px 8px;
	border-radius: 4px;
	background: rgba(0, 130, 201, 0.2);
	color: #0082c9;
	font-size: 10px;
	font-weight: 700;
	letter-spacing: 0.5px;
}

.jada-ws-card-desc {
	font-size: 13px;
	color: #8b8b9e;
	margin: 0 0 12px;
	line-height: 1.5;
}

.jada-ws-card-tags {
	display: flex;
	gap: 6px;
	flex-wrap: wrap;
	margin-bottom: 12px;
}

.jada-ws-tag {
	padding: 2px 8px;
	border-radius: 12px;
	background: rgba(255,255,255,0.06);
	font-size: 11px;
	color: #8b8b9e;
}

.jada-ws-card-stats {
	font-size: 12px;
	color: #555;
	display: flex;
	gap: 6px;
}

/* ─── Buttons ─── */
.jada-btn-primary {
	padding: 8px 18px;
	border-radius: 10px;
	border: none;
	background: linear-gradient(135deg, #e94560, #c23152);
	color: #fff;
	font-size: 13px;
	font-weight: 600;
	cursor: pointer;
	transition: all 0.2s;
}

.jada-btn-primary:hover:not(:disabled) {
	box-shadow: 0 2px 12px rgba(233, 69, 96, 0.4);
}

.jada-btn-primary:disabled {
	opacity: 0.4;
	cursor: not-allowed;
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

/* ─── Modal ─── */
.jada-modal-overlay {
	position: fixed;
	inset: 0;
	background: rgba(0,0,0,0.6);
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 2000;
}

.jada-modal {
	background: #1a1a24;
	border: 1px solid rgba(255,255,255,0.1);
	border-radius: 16px;
	padding: 28px;
	width: 420px;
	max-width: 90vw;
}

.jada-modal h3 {
	font-size: 18px;
	font-weight: 700;
	color: #fff;
	margin: 0 0 20px;
}

.jada-form-group {
	margin-bottom: 16px;
}

.jada-form-group label {
	display: block;
	font-size: 12px;
	font-weight: 600;
	color: #8b8b9e;
	margin-bottom: 6px;
}

.jada-form-group input,
.jada-form-group textarea {
	width: 100%;
	padding: 10px 14px;
	border: 1px solid rgba(255,255,255,0.1);
	border-radius: 10px;
	background: #111119;
	color: #e8e8ef;
	font-size: 14px;
	box-sizing: border-box;
	font-family: inherit;
	resize: vertical;
}

.jada-form-group input:focus,
.jada-form-group textarea:focus {
	outline: none;
	border-color: #e94560;
}

.jada-color-options {
	display: flex;
	gap: 8px;
}

.jada-color-btn {
	width: 28px;
	height: 28px;
	border-radius: 8px;
	border: 2px solid transparent;
	cursor: pointer;
	transition: all 0.15s;
}

.jada-color-btn.selected {
	border-color: #fff;
	transform: scale(1.15);
}

.jada-modal-actions {
	display: flex;
	justify-content: flex-end;
	gap: 10px;
	margin-top: 24px;
}
</style>
