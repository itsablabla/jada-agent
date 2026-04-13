<template>
	<div class="jada-search">
		<div class="jada-search-header">
			<h1>Search</h1>
		</div>
		<div class="jada-search-bar">
			<span class="jada-search-icon">&#128269;</span>
			<input
				v-model="query"
				class="jada-search-input"
				placeholder="Search conversations, messages, tools..."
				@input="handleSearch"
				ref="searchInput"
			/>
			<div v-if="store.searchLoading" class="jada-search-spinner"></div>
		</div>

		<div v-if="query.trim()" class="jada-search-results">
			<div class="jada-search-result-count">
				{{ totalResults }} results for "{{ query }}"
				<span v-if="serverResults.length"> ({{ serverResults.length }} from server)</span>
			</div>

			<!-- Server-side search results (MeiliSearch full-text) -->
			<div v-for="(r, i) in serverResults" :key="'s-'+i" class="jada-search-result" @click="openMessageResult(r)">
				<span class="jada-search-type message">message</span>
				<div class="jada-search-result-info">
					<div class="jada-search-result-title">{{ r.sender || (r.isCreatedByUser ? 'You' : 'Jada') }}</div>
					<div class="jada-search-result-preview">{{ truncate(r.text, 120) }}</div>
					<div class="jada-search-result-meta">{{ formatDate(r.createdAt) }}</div>
				</div>
			</div>

			<!-- Local results (conversations, tools, workspaces) -->
			<div v-for="(r, i) in localResults" :key="'l-'+i" class="jada-search-result" @click="openResult(r)">
				<span :class="['jada-search-type', r.type]">{{ r.type }}</span>
				<div class="jada-search-result-info">
					<div class="jada-search-result-title">{{ r.title }}</div>
					<div class="jada-search-result-preview">{{ r.preview }}</div>
				</div>
			</div>

			<div v-if="!totalResults && !store.searchLoading" class="jada-search-empty">
				No results found. Try a different search term.
			</div>
		</div>

		<div v-else class="jada-search-empty-state">
			<p>Full-text search across all conversations and messages.</p>
			<p class="jada-search-hint">Powered by MeiliSearch — searches message content server-side.</p>
		</div>
	</div>
</template>

<script>
import { store, actions } from '../store.js'

let searchTimeout = null

export default {
	name: 'SearchView',
	data() {
		return {
			store,
			query: '',
			localResults: [],
		}
	},
	computed: {
		serverResults() {
			return store.searchResults || []
		},
		totalResults() {
			return this.serverResults.length + this.localResults.length
		},
	},
	mounted() {
		this.$nextTick(() => this.$refs.searchInput?.focus())
	},
	methods: {
		handleSearch() {
			const q = this.query.trim()
			if (!q || q.length < 2) {
				this.localResults = []
				store.searchResults = []
				return
			}

			// Local search (instant)
			this.searchLocal(q.toLowerCase())

			// Server-side search (debounced)
			clearTimeout(searchTimeout)
			searchTimeout = setTimeout(() => {
				actions.searchMessages(q)
			}, 300)
		},

		searchLocal(q) {
			const results = []

			for (const conv of store.conversations) {
				const title = conv.title || conv.id || ''
				if (title.toLowerCase().includes(q)) {
					results.push({
						type: 'chat',
						title: title,
						preview: 'Conversation',
						data: conv,
					})
				}
			}

			for (const tc of store.recentToolCalls) {
				if (tc.name.toLowerCase().includes(q)) {
					results.push({
						type: 'tool',
						title: tc.name,
						preview: `Called at ${new Date(tc.timestamp).toLocaleTimeString()}`,
						data: tc,
					})
				}
			}

			for (const ws of store.workspaces) {
				if (ws.name.toLowerCase().includes(q) || (ws.description || '').toLowerCase().includes(q)) {
					results.push({
						type: 'workspace',
						title: ws.name,
						preview: ws.description || '',
						data: ws,
					})
				}
			}

			this.localResults = results
		},

		openMessageResult(msg) {
			if (msg.conversationId) {
				actions.selectConversation(msg.conversationId)
			}
		},

		openResult(r) {
			if (r.type === 'chat') {
				actions.selectConversation(r.data.id)
			} else if (r.type === 'workspace') {
				store.activeWorkspaceId = r.data.id
				store.currentView = 'workspace-detail'
			} else if (r.type === 'tool') {
				store.currentView = 'tool-explorer'
			}
		},

		truncate(text, len) {
			if (!text) return ''
			return text.length > len ? text.slice(0, len) + '...' : text
		},

		formatDate(d) {
			if (!d) return ''
			return new Date(d).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
		},
	},
}
</script>

<style scoped>
.jada-search {
	padding: 28px;
	overflow-y: auto;
	height: 100%;
	max-width: 700px;
}

.jada-search-header h1 {
	font-size: 24px;
	font-weight: 700;
	color: #fff;
	margin: 0 0 20px;
}

.jada-search-bar {
	display: flex;
	align-items: center;
	gap: 10px;
	background: #1a1a24;
	border: 1px solid rgba(255,255,255,0.1);
	border-radius: 14px;
	padding: 12px 16px;
	margin-bottom: 24px;
}

.jada-search-bar:focus-within { border-color: #e94560; }

.jada-search-icon { font-size: 16px; color: #555; }

.jada-search-input {
	flex: 1;
	background: transparent;
	border: none;
	color: #e8e8ef;
	font-size: 15px;
	outline: none;
}

.jada-search-input::placeholder { color: #444; }

.jada-search-spinner {
	width: 16px;
	height: 16px;
	border: 2px solid rgba(233, 69, 96, 0.3);
	border-top-color: #e94560;
	border-radius: 50%;
	animation: spin 0.6s linear infinite;
}

@keyframes spin {
	to { transform: rotate(360deg); }
}

.jada-search-result-count {
	font-size: 12px;
	color: #555;
	margin-bottom: 12px;
}

.jada-search-result {
	display: flex;
	align-items: flex-start;
	gap: 12px;
	padding: 12px 14px;
	border-radius: 10px;
	cursor: pointer;
	transition: background 0.15s;
	margin-bottom: 4px;
}

.jada-search-result:hover { background: rgba(255,255,255,0.04); }

.jada-search-type {
	padding: 2px 8px;
	border-radius: 4px;
	font-size: 10px;
	font-weight: 700;
	text-transform: uppercase;
	flex-shrink: 0;
	margin-top: 2px;
}

.jada-search-type.chat { background: rgba(233, 69, 96, 0.15); color: #e94560; }
.jada-search-type.tool { background: rgba(74, 222, 128, 0.15); color: #4ade80; }
.jada-search-type.workspace { background: rgba(139, 92, 246, 0.15); color: #8b5cf6; }
.jada-search-type.message { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
.jada-search-type.document { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }

.jada-search-result-title {
	font-size: 14px;
	font-weight: 500;
	color: #e8e8ef;
	margin-bottom: 2px;
}

.jada-search-result-preview {
	font-size: 12px;
	color: #555;
}

.jada-search-result-meta {
	font-size: 11px;
	color: #444;
	margin-top: 2px;
}

.jada-search-empty {
	text-align: center;
	padding: 32px;
	color: #555;
}

.jada-search-empty-state {
	text-align: center;
	padding: 40px 0;
	color: #555;
}

.jada-search-hint {
	font-size: 12px;
	color: #444;
	margin-top: 8px;
}
</style>
