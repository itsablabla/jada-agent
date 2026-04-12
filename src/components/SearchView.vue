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
				placeholder="Search conversations, tools, files..."
				@input="handleSearch"
				ref="searchInput"
			/>
		</div>

		<div v-if="query.trim()" class="jada-search-results">
			<div class="jada-search-result-count">{{ results.length }} results for "{{ query }}"</div>

			<div v-for="(r, i) in results" :key="i" class="jada-search-result" @click="openResult(r)">
				<span :class="['jada-search-type', r.type]">{{ r.type }}</span>
				<div class="jada-search-result-info">
					<div class="jada-search-result-title">{{ r.title }}</div>
					<div class="jada-search-result-preview" v-html="r.preview"></div>
				</div>
			</div>

			<div v-if="!results.length" class="jada-search-empty">
				No results found. Try a different search term.
			</div>
		</div>

		<div v-else class="jada-search-empty-state">
			<p>Search across your conversations, tool calls, and files.</p>
			<div class="jada-search-recent">
				<div class="jada-search-recent-label">Recent Searches</div>
				<div v-for="term in recentSearches" :key="term" class="jada-search-recent-item" @click="query = term; handleSearch()">
					&#128269; {{ term }}
				</div>
			</div>
		</div>
	</div>
</template>

<script>
import { store } from '../store.js'

export default {
	name: 'SearchView',
	data() {
		return {
			store,
			query: '',
			results: [],
			recentSearches: ['nextcloud files', 'calendar events', 'kuse documents'],
		}
	},
	mounted() {
		this.$nextTick(() => this.$refs.searchInput?.focus())
	},
	methods: {
		handleSearch() {
			const q = this.query.toLowerCase().trim()
			if (!q) {
				this.results = []
				return
			}

			const results = []

			// Search conversations
			for (const conv of store.conversations) {
				const title = conv.title || conv.id || ''
				if (title.toLowerCase().includes(q)) {
					results.push({
						type: 'chat',
						title: title,
						preview: conv.lastMessage || 'Conversation',
						data: conv,
					})
				}
			}

			// Search tool calls
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

			// Search workspaces
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

			this.results = results
		},
		openResult(r) {
			if (r.type === 'chat') {
				store.activeConversationId = r.data.id
				store.currentView = 'chat'
			} else if (r.type === 'workspace') {
				store.activeWorkspaceId = r.data.id
				store.currentView = 'workspace-detail'
			} else if (r.type === 'tool') {
				store.currentView = 'tool-explorer'
			}
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

.jada-search-recent {
	margin-top: 24px;
	text-align: left;
}

.jada-search-recent-label {
	font-size: 11px;
	font-weight: 700;
	color: #444;
	text-transform: uppercase;
	letter-spacing: 0.5px;
	margin-bottom: 8px;
}

.jada-search-recent-item {
	padding: 8px 12px;
	border-radius: 8px;
	font-size: 13px;
	color: #8b8b9e;
	cursor: pointer;
	transition: background 0.15s;
}

.jada-search-recent-item:hover {
	background: rgba(255,255,255,0.04);
	color: #e8e8ef;
}
</style>
