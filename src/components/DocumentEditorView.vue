<template>
	<div class="jada-doc-editor">
		<!-- Left: file browser -->
		<div class="jada-doc-sidebar">
			<h4>Documents</h4>
			<div class="jada-doc-section-label">Recent</div>
			<div
				v-for="doc in recentDocs"
				:key="doc.name"
				:class="['jada-doc-item', { active: activeDoc === doc.name }]"
				@click="openDoc(doc)"
			>
				<span class="jada-doc-icon">&#128196;</span>
				<div class="jada-doc-item-info">
					<div class="jada-doc-item-name">{{ doc.name }}</div>
					<div class="jada-doc-item-meta">{{ doc.modified || 'Just now' }}</div>
				</div>
			</div>
			<div class="jada-doc-section-label">Nextcloud Files</div>
			<div class="jada-doc-tree-hint">
				Files from your Nextcloud instance will appear here. Use the chat to ask Jada to find or create documents.
			</div>
		</div>

		<!-- Center: editor -->
		<div class="jada-doc-center">
			<div class="jada-doc-toolbar">
				<span class="jada-doc-filename">{{ activeDoc || 'Untitled Document' }}</span>
				<div class="jada-doc-toolbar-actions">
					<button class="jada-doc-tb-btn" title="Save">&#128190;</button>
					<button class="jada-doc-tb-btn" title="Download">&#128229;</button>
				</div>
			</div>
			<div class="jada-doc-content">
				<textarea
					v-model="editorContent"
					class="jada-doc-textarea"
					placeholder="Start writing or ask Jada to generate content..."
					@input="dirty = true"
				></textarea>

				<!-- AI suggestion blocks -->
				<div v-if="aiSuggestions.length" class="jada-doc-suggestions">
					<div v-for="(s, i) in aiSuggestions" :key="i" class="jada-doc-suggestion">
						<div class="jada-doc-suggestion-header">
							<span class="jada-doc-suggestion-icon">&#10024;</span>
							<span>AI Suggestion</span>
						</div>
						<div class="jada-doc-suggestion-text">{{ s.text }}</div>
						<div class="jada-doc-suggestion-actions">
							<button class="jada-doc-apply-btn" @click="applySuggestion(s)">Apply</button>
							<button class="jada-doc-dismiss-btn" @click="aiSuggestions.splice(i, 1)">Dismiss</button>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Right: AI assistant panel -->
		<div class="jada-doc-ai-panel">
			<h4>AI Document Assistant</h4>
			<p class="jada-doc-ai-hint">Ask Jada to help edit, proofread, summarize, or translate this document.</p>

			<div class="jada-doc-quick-actions">
				<button v-for="action in quickActions" :key="action.label" class="jada-doc-action-btn" @click="handleQuickAction(action)">
					{{ action.icon }} {{ action.label }}
				</button>
			</div>

			<div class="jada-doc-ai-messages">
				<div v-for="(msg, i) in aiMessages" :key="i" :class="['jada-doc-ai-msg', msg.role]">
					<div class="jada-doc-ai-msg-text">{{ msg.content }}</div>
				</div>
			</div>

			<div class="jada-doc-ai-input-row">
				<input
					v-model="aiInput"
					class="jada-doc-ai-input"
					placeholder="Ask Jada to edit this document..."
					@keydown.enter.prevent="handleAiSend"
				/>
				<button class="jada-doc-ai-send" @click="handleAiSend" :disabled="!aiInput.trim()">&#10148;</button>
			</div>
		</div>
	</div>
</template>

<script>
import { store } from '../store.js'
import api from '../api.js'

export default {
	name: 'DocumentEditorView',
	data() {
		return {
			store,
			activeDoc: 'Untitled Document',
			editorContent: '',
			dirty: false,
			aiInput: '',
			aiMessages: [],
			aiSuggestions: [],
			recentDocs: [
				{ name: 'Meeting Notes.md', modified: '2 hours ago' },
				{ name: 'Project Proposal.md', modified: 'Yesterday' },
				{ name: 'API Documentation.md', modified: '3 days ago' },
			],
			quickActions: [
				{ icon: '&#128270;', label: 'Proofread', prompt: 'Proofread this document and suggest corrections.' },
				{ icon: '&#128221;', label: 'Summarize', prompt: 'Summarize this document in 3-5 bullet points.' },
				{ icon: '&#127760;', label: 'Translate', prompt: 'Translate this document to Spanish.' },
				{ icon: '&#128161;', label: 'Add Examples', prompt: 'Add practical examples to illustrate the main points.' },
				{ icon: '&#128187;', label: 'From Code', prompt: 'Generate documentation from the code in this document.' },
			],
		}
	},
	methods: {
		openDoc(doc) {
			this.activeDoc = doc.name
			this.editorContent = ''
			this.aiSuggestions = []
		},
		applySuggestion(s) {
			this.editorContent += '\n\n' + s.text
			this.aiSuggestions = this.aiSuggestions.filter(x => x !== s)
		},
		async handleQuickAction(action) {
			this.aiInput = action.prompt
			await this.handleAiSend()
		},
		async handleAiSend() {
			const message = this.aiInput.trim()
			if (!message) return
			this.aiInput = ''

			this.aiMessages.push({ role: 'user', content: message })

			const fullMessage = `[Document Editor — ${this.activeDoc}]\n\nDocument content:\n${this.editorContent || '(empty)'}\n\nUser request: ${message}`

			try {
				const result = await api.sendMessage(fullMessage)
				const response = result.response || result.message || JSON.stringify(result)
				this.aiMessages.push({ role: 'assistant', content: response })
				this.aiSuggestions.push({ text: response })
			} catch (err) {
				this.aiMessages.push({ role: 'assistant', content: 'Error: ' + (err.message || 'Failed to reach agent') })
			}
		},
	},
}
</script>

<style scoped>
.jada-doc-editor {
	display: flex;
	height: 100%;
	min-height: 0;
}

/* ─── File browser sidebar ─── */
.jada-doc-sidebar {
	width: 240px;
	min-width: 240px;
	background: #111119;
	border-right: 1px solid rgba(255,255,255,0.06);
	padding: 16px 12px;
	overflow-y: auto;
}

.jada-doc-sidebar h4 {
	font-size: 14px;
	font-weight: 700;
	color: #fff;
	margin: 0 0 12px;
}

.jada-doc-section-label {
	font-size: 10px;
	font-weight: 700;
	color: #555;
	text-transform: uppercase;
	letter-spacing: 0.5px;
	padding: 8px 8px 4px;
}

.jada-doc-item {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 8px;
	border-radius: 8px;
	cursor: pointer;
	transition: background 0.15s;
}

.jada-doc-item:hover { background: rgba(255,255,255,0.04); }
.jada-doc-item.active { background: rgba(233, 69, 96, 0.12); }

.jada-doc-icon { font-size: 14px; }

.jada-doc-item-name {
	font-size: 13px;
	color: #e8e8ef;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.jada-doc-item-meta {
	font-size: 10px;
	color: #444;
}

.jada-doc-tree-hint {
	font-size: 11px;
	color: #444;
	padding: 8px;
	line-height: 1.5;
}

/* ─── Center editor ─── */
.jada-doc-center {
	flex: 1;
	display: flex;
	flex-direction: column;
	min-width: 0;
}

.jada-doc-toolbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 10px 16px;
	border-bottom: 1px solid rgba(255,255,255,0.06);
	background: #16161f;
}

.jada-doc-filename {
	font-size: 14px;
	font-weight: 600;
	color: #e8e8ef;
}

.jada-doc-toolbar-actions {
	display: flex;
	gap: 6px;
}

.jada-doc-tb-btn {
	background: none;
	border: none;
	color: #8b8b9e;
	font-size: 16px;
	cursor: pointer;
	padding: 4px 8px;
	border-radius: 6px;
}

.jada-doc-tb-btn:hover { background: rgba(255,255,255,0.06); }

.jada-doc-content {
	flex: 1;
	overflow-y: auto;
	padding: 16px;
}

.jada-doc-textarea {
	width: 100%;
	min-height: 300px;
	background: #1a1a24;
	border: 1px solid rgba(255,255,255,0.06);
	border-radius: 10px;
	padding: 16px;
	color: #e8e8ef;
	font-size: 14px;
	line-height: 1.8;
	font-family: 'Georgia', 'Times New Roman', serif;
	resize: vertical;
	box-sizing: border-box;
}

.jada-doc-textarea:focus {
	outline: none;
	border-color: rgba(233, 69, 96, 0.3);
}

.jada-doc-textarea::placeholder { color: #444; }

/* ─── AI suggestions ─── */
.jada-doc-suggestions {
	margin-top: 16px;
}

.jada-doc-suggestion {
	background: rgba(233, 69, 96, 0.08);
	border: 1px solid rgba(233, 69, 96, 0.2);
	border-radius: 10px;
	padding: 12px;
	margin-bottom: 10px;
}

.jada-doc-suggestion-header {
	display: flex;
	align-items: center;
	gap: 6px;
	font-size: 12px;
	font-weight: 600;
	color: #e94560;
	margin-bottom: 8px;
}

.jada-doc-suggestion-text {
	font-size: 13px;
	color: #e8e8ef;
	line-height: 1.6;
	margin-bottom: 10px;
	max-height: 120px;
	overflow-y: auto;
}

.jada-doc-suggestion-actions {
	display: flex;
	gap: 8px;
}

.jada-doc-apply-btn {
	padding: 4px 12px;
	border-radius: 6px;
	border: none;
	background: #e94560;
	color: #fff;
	font-size: 12px;
	font-weight: 600;
	cursor: pointer;
}

.jada-doc-dismiss-btn {
	padding: 4px 12px;
	border-radius: 6px;
	border: 1px solid rgba(255,255,255,0.1);
	background: transparent;
	color: #8b8b9e;
	font-size: 12px;
	cursor: pointer;
}

/* ─── AI panel ─── */
.jada-doc-ai-panel {
	width: 280px;
	min-width: 280px;
	background: #111119;
	border-left: 1px solid rgba(255,255,255,0.06);
	display: flex;
	flex-direction: column;
	padding: 16px 12px;
}

.jada-doc-ai-panel h4 {
	font-size: 14px;
	font-weight: 700;
	color: #fff;
	margin: 0 0 6px;
}

.jada-doc-ai-hint {
	font-size: 12px;
	color: #555;
	margin: 0 0 12px;
}

.jada-doc-quick-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	margin-bottom: 12px;
}

.jada-doc-action-btn {
	padding: 5px 10px;
	border-radius: 8px;
	border: 1px solid rgba(255,255,255,0.08);
	background: rgba(255,255,255,0.03);
	color: #8b8b9e;
	font-size: 11px;
	cursor: pointer;
	transition: all 0.15s;
}

.jada-doc-action-btn:hover {
	border-color: #e94560;
	color: #e94560;
}

.jada-doc-ai-messages {
	flex: 1;
	overflow-y: auto;
	margin-bottom: 12px;
}

.jada-doc-ai-msg {
	padding: 8px 10px;
	border-radius: 8px;
	margin-bottom: 6px;
	font-size: 13px;
	line-height: 1.5;
}

.jada-doc-ai-msg.user {
	background: rgba(59, 130, 246, 0.15);
	color: #93c5fd;
}

.jada-doc-ai-msg.assistant {
	background: #1a1a24;
	color: #e8e8ef;
}

.jada-doc-ai-input-row {
	display: flex;
	gap: 6px;
}

.jada-doc-ai-input {
	flex: 1;
	padding: 8px 12px;
	border: 1px solid rgba(255,255,255,0.08);
	border-radius: 8px;
	background: #1a1a24;
	color: #e8e8ef;
	font-size: 13px;
}

.jada-doc-ai-input:focus {
	outline: none;
	border-color: #e94560;
}

.jada-doc-ai-input::placeholder { color: #444; }

.jada-doc-ai-send {
	width: 34px;
	height: 34px;
	border-radius: 8px;
	border: none;
	background: linear-gradient(135deg, #e94560, #c23152);
	color: #fff;
	cursor: pointer;
	font-size: 14px;
	display: flex;
	align-items: center;
	justify-content: center;
}

.jada-doc-ai-send:disabled {
	opacity: 0.3;
	cursor: not-allowed;
}
</style>
