<template>
	<div class="jada-chat">
		<!-- Empty state -->
		<div v-if="messages.length === 0 && !loading" class="jada-chat-empty">
			<div class="jada-chat-empty-icon">
				<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" width="64" height="64">
					<circle cx="16" cy="16" r="14" fill="#1a1a2e" stroke="#e94560" stroke-width="1.5"/>
					<circle cx="11" cy="13" r="2" fill="#e94560"/>
					<circle cx="21" cy="13" r="2" fill="#e94560"/>
					<path d="M10 20 Q16 25 22 20" stroke="#e94560" stroke-width="1.5" fill="none" stroke-linecap="round"/>
				</svg>
			</div>
			<h2>Hello, {{ userName }}</h2>
			<p>{{ store.totalTools }} tools across {{ store.mcpServers.length }} servers. How can I help?</p>
			<div class="jada-suggestions">
				<button v-for="s in suggestions" :key="s" class="jada-chip" @click="handleSend(s)">
					{{ s }}
				</button>
			</div>
		</div>

		<!-- Messages -->
		<div v-else class="jada-chat-messages" ref="messagesEl">
			<div v-for="(msg, i) in messages" :key="i" :class="['jada-msg', msg.role]">
				<div class="jada-msg-avatar">
					<span v-if="msg.role === 'user'">{{ userInitials }}</span>
					<span v-else>J</span>
				</div>
				<div class="jada-msg-body">
					<!-- Tool calls -->
					<div v-if="msg.toolCalls && msg.toolCalls.length" class="jada-tool-calls">
						<div v-for="(tc, ti) in msg.toolCalls" :key="ti" class="jada-tool-call">
							<div class="jada-tool-header">
								<span class="jada-tool-icon">{{ tc.status === 'error' ? '&#10060;' : tc.status === 'success' ? '&#9989;' : '&#128295;' }}</span>
								<span class="jada-tool-name">{{ tc.name }}</span>
							</div>
						</div>
					</div>
					<!-- Text content -->
					<div class="jada-msg-text" v-html="formatMessage(msg.content)"></div>
					<div class="jada-msg-meta">
						{{ formatTime(msg.timestamp) }}
						<span v-if="msg.toolCalls && msg.toolCalls.length"> &middot; {{ msg.toolCalls.length }} tool call{{ msg.toolCalls.length > 1 ? 's' : '' }}</span>
					</div>
				</div>
			</div>

			<!-- Streaming indicator -->
			<div v-if="loading" class="jada-msg assistant">
				<div class="jada-msg-avatar"><span>J</span></div>
				<div class="jada-msg-body">
					<!-- Show streaming tool calls -->
					<div v-if="streamingToolCalls.length" class="jada-tool-calls">
						<div v-for="(tc, ti) in streamingToolCalls" :key="ti" class="jada-tool-call">
							<div class="jada-tool-header">
								<span :class="['jada-tool-icon', tc.status === 'running' ? 'spinning' : '']">{{ tc.status === 'error' ? '&#10060;' : tc.status === 'success' ? '&#9989;' : '&#128295;' }}</span>
								<span class="jada-tool-name">{{ tc.name }}</span>
							</div>
						</div>
					</div>
					<!-- Show streaming text -->
					<div v-if="streamingText" class="jada-msg-text" v-html="formatMessage(streamingText)"></div>
					<div v-else class="jada-typing">
						<span></span><span></span><span></span>
					</div>
				</div>
			</div>
		</div>

		<!-- Input area -->
		<div class="jada-chat-input-area">
			<div class="jada-chat-input-row">
				<textarea
					ref="input"
					v-model="inputText"
					class="jada-chat-input"
					:placeholder="'Message Jada about ' + activeWsName + '...'"
					rows="1"
					@keydown.enter.exact.prevent="handleSend()"
					@input="autoResize"
				></textarea>
				<button class="jada-send-btn" @click="handleSend()" :disabled="!inputText.trim() || loading">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
					</svg>
				</button>
			</div>
			<div class="jada-input-footer">
				<span class="jada-input-model">Qwen 3.5 Plus</span>
				<span class="jada-input-tools">&middot; {{ store.totalTools }} tools</span>
				<span class="jada-input-ws">&middot; Workspace: {{ activeWsName }}</span>
			</div>
		</div>
	</div>
</template>

<script>
import { store, actions } from '../store.js'
import api from '../api.js'

export default {
	name: 'ChatView',
	data() {
		return {
			store,
			messages: [],
			inputText: '',
			loading: false,
			streamingText: '',
			streamingToolCalls: [],
			currentCancel: null,
			suggestions: [
				'List my Nextcloud files',
				'Check my calendar',
				'Show my Proton Drive stats',
				'List my Beeper chats',
				'What tools do you have?',
				'Check system status',
			],
		}
	},
	computed: {
		activeWsName() {
			return actions.getActiveWorkspace().name
		},
		userName() {
			return store.userProfile?.displayName || 'User'
		},
		userInitials() {
			const name = this.userName
			const parts = name.split(' ')
			if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
			return name.substring(0, 2).toUpperCase()
		},
	},
	watch: {
		'store.activeConversationId'() {
			this.loadConversation()
		},
	},
	mounted() {
		if (store.activeConversationId) {
			this.loadConversation()
		}
	},
	methods: {
		loadConversation() {
			if (!store.activeConversationId) return
			// Load from localStorage (Hermes Agent doesn't serve conversation history)
			this.loadFromLocalStorage(store.activeConversationId)
		},

		async handleSend(text) {
			const message = text || this.inputText.trim()
			if (!message || this.loading) return

			this.inputText = ''
			this.messages.push({
				role: 'user',
				content: message,
				timestamp: new Date(),
			})
			this.scrollToBottom()
			this.loading = true
			this.streamingText = ''
			this.streamingToolCalls = []

			if (!store.activeConversationId) {
				actions.startNewChat()
			}

			try {
				// Build full message history for Hermes Agent (OpenAI format)
				const allMessages = this.messages.map(m => ({
					role: m.role,
					content: m.content,
				}))
				const { promise, cancel } = api.createSSEStream(allMessages)
				this.currentCancel = cancel

				const response = await promise
				if (!response.ok) {
					throw new Error(`HTTP ${response.status}`)
				}

				const reader = response.body.getReader()
				const decoder = new TextDecoder()
				let buffer = ''
				let fullText = ''
				const toolCalls = []

				let currentEvent = ''
				while (true) {
					const { done, value } = await reader.read()
					if (done) break

					buffer += decoder.decode(value, { stream: true })
					const lines = buffer.split('\n')
					buffer = lines.pop() || ''

					for (const line of lines) {
						// Track SSE event type (Hermes sends "event: hermes.tool.progress")
						if (line.startsWith('event: ')) {
							currentEvent = line.slice(7).trim()
							continue
						}
						if (!line.startsWith('data: ')) continue
						const data = line.slice(6).trim()
						if (data === '[DONE]') continue

						try {
							const parsed = JSON.parse(data)

							// Hermes tool progress events
							if (currentEvent === 'hermes.tool.progress' && parsed.tool) {
								const toolName = parsed.tool
								toolCalls.push({ name: toolName, status: 'running', result: null })
								this.streamingToolCalls = [...toolCalls]
								actions.addToolCall({ name: toolName, status: 'running', timestamp: new Date() })
								currentEvent = ''
								continue
							}
							currentEvent = ''

							// OpenAI chat completions streaming format (Hermes Agent)
							const delta = parsed.choices?.[0]?.delta
							if (delta) {
								if (delta.content) {
									fullText += delta.content
									this.streamingText = fullText
								}
								// Check for finish_reason to mark tools as complete
								if (parsed.choices?.[0]?.finish_reason === 'stop') {
									toolCalls.forEach(tc => {
										if (tc.status === 'running') tc.status = 'success'
									})
									this.streamingToolCalls = [...toolCalls]
								}
							}
						} catch {
							// Ignore unparseable lines
						}
					}
					this.scrollToBottom()
				}

				// Save conversation to localStorage for persistence
				this.saveToLocalStorage()

				// Finalize message
				this.messages.push({
					role: 'assistant',
					content: fullText || this.streamingText || '(No response)',
					timestamp: new Date(),
					toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
				})
			} catch (err) {
				if (err.name === 'AbortError') return
				// Fallback to non-streaming
				try {
					const result = await api.sendMessage(message, store.activeConversationId)
					this.messages.push({
						role: 'assistant',
						content: result.response || result.message || JSON.stringify(result),
						timestamp: new Date(),
					})
				} catch (fallbackErr) {
					this.messages.push({
						role: 'assistant',
						content: 'Error: ' + (fallbackErr.response?.data?.error || fallbackErr.message || 'Failed to reach agent'),
						timestamp: new Date(),
					})
				}
			} finally {
				this.loading = false
				this.streamingText = ''
				this.streamingToolCalls = []
				this.currentCancel = null
				this.scrollToBottom()
				// Refresh conversation list + tool calls in sidebar
				actions.loadConversations()
				actions.loadRecentToolCalls()
			}
		},

		formatMessage(text) {
			if (!text) return ''
			// Escape HTML
			let html = text
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
			// Markdown: code blocks (``` ... ```)
			html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
			// Markdown: inline code
			html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
			// Markdown: bold
			html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
			// Markdown: italic (single * or _)
			html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
			// Markdown: headings (## or ###)
			html = html.replace(/^### (.+)$/gm, '<strong style="font-size:13px">$1</strong>')
			html = html.replace(/^## (.+)$/gm, '<strong style="font-size:14px">$1</strong>')
			// Markdown: unordered list items
			html = html.replace(/^- (.+)$/gm, '&bull; $1')
			// Newlines
			html = html.replace(/\n/g, '<br>')
			return html
		},

		formatTime(date) {
			if (!date) return ''
			return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
		},

		scrollToBottom() {
			this.$nextTick(() => {
				const el = this.$refs.messagesEl
				if (el) el.scrollTop = el.scrollHeight
			})
		},

		autoResize() {
			const el = this.$refs.input
			if (!el) return
			el.style.height = 'auto'
			el.style.height = Math.min(el.scrollHeight, 120) + 'px'
		},

		/** Save current conversation to localStorage for persistence across reloads */
		saveToLocalStorage() {
			if (!store.activeConversationId) return
			try {
				const convKey = `jada_conv_${store.activeConversationId}`
				const data = {
					id: store.activeConversationId,
					messages: this.messages,
					updatedAt: new Date().toISOString(),
					title: this.messages.find(m => m.role === 'user')?.content?.slice(0, 60) || 'New Chat',
				}
				localStorage.setItem(convKey, JSON.stringify(data))

				// Update conversation list index
				const indexKey = 'jada_conversations'
				const index = JSON.parse(localStorage.getItem(indexKey) || '[]')
				const existing = index.findIndex(c => c.id === data.id)
				const entry = { id: data.id, title: data.title, updatedAt: data.updatedAt }
				if (existing >= 0) {
					index[existing] = entry
				} else {
					index.unshift(entry)
				}
				// Keep last 50 conversations
				if (index.length > 50) index.length = 50
				localStorage.setItem(indexKey, JSON.stringify(index))

				// Update store sidebar
				store.conversations = index
			} catch {
				// localStorage full or unavailable — ignore
			}
		},

		/** Load conversation from localStorage */
		loadFromLocalStorage(conversationId) {
			try {
				const data = JSON.parse(localStorage.getItem(`jada_conv_${conversationId}`) || 'null')
				if (data?.messages) {
					this.messages = data.messages.map(m => ({
						...m,
						timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
					}))
				}
			} catch {
				// Corrupt data — ignore
			}
		},
	},

	beforeUnmount() {
		if (this.currentCancel) this.currentCancel()
	},
}
</script>

<style scoped>
.jada-chat {
	display: flex;
	flex-direction: column;
	height: 100%;
	min-height: 0;
}

/* ─── Empty state ─── */
.jada-chat-empty {
	flex: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	text-align: center;
	padding: 40px 20px;
}

.jada-chat-empty-icon {
	margin-bottom: 20px;
	opacity: 0.9;
	animation: float 3s ease-in-out infinite;
}

@keyframes float {
	0%, 100% { transform: translateY(0); }
	50% { transform: translateY(-8px); }
}

.jada-chat-empty h2 {
	font-size: 24px;
	font-weight: 700;
	color: #fff;
	margin: 0 0 8px;
}

.jada-chat-empty p {
	font-size: 14px;
	color: #8b8b9e;
	margin: 0 0 24px;
}

.jada-suggestions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	justify-content: center;
	max-width: 600px;
}

.jada-chip {
	padding: 8px 16px;
	border-radius: 20px;
	border: 1px solid rgba(255,255,255,0.1);
	background: rgba(255,255,255,0.04);
	color: #e8e8ef;
	font-size: 13px;
	cursor: pointer;
	transition: all 0.2s;
}

.jada-chip:hover {
	border-color: #e94560;
	background: rgba(233, 69, 96, 0.1);
	color: #e94560;
}

/* ─── Messages ─── */
.jada-chat-messages {
	flex: 1;
	overflow-y: auto;
	padding: 20px 24px;
}

.jada-msg {
	display: flex;
	gap: 12px;
	margin-bottom: 20px;
	max-width: 800px;
}

.jada-msg.user {
	margin-left: auto;
	flex-direction: row-reverse;
}

.jada-msg-avatar {
	width: 32px;
	height: 32px;
	border-radius: 8px;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 12px;
	font-weight: 700;
	flex-shrink: 0;
	color: #fff;
}

.jada-msg.user .jada-msg-avatar {
	background: linear-gradient(135deg, #3b82f6, #2563eb);
}

.jada-msg.assistant .jada-msg-avatar {
	background: linear-gradient(135deg, #e94560, #c23152);
}

.jada-msg-body {
	max-width: 650px;
	min-width: 0;
}

.jada-msg.user .jada-msg-body {
	text-align: right;
}

.jada-msg-text {
	background: #1e1e2a;
	border: 1px solid rgba(255,255,255,0.06);
	border-radius: 12px;
	padding: 10px 14px;
	font-size: 14px;
	line-height: 1.6;
	color: #e8e8ef;
	display: inline-block;
	text-align: left;
}

.jada-msg.user .jada-msg-text {
	background: linear-gradient(135deg, #3b82f6, #2563eb);
	color: #fff;
	border: none;
}

.jada-msg-text code {
	background: rgba(0,0,0,0.2);
	padding: 1px 5px;
	border-radius: 4px;
	font-size: 13px;
	font-family: 'SF Mono', 'Fira Code', monospace;
}

.jada-msg-meta {
	font-size: 11px;
	color: #555;
	margin-top: 4px;
	padding: 0 4px;
}

/* ─── Tool calls ─── */
.jada-tool-calls {
	margin-bottom: 8px;
}

.jada-tool-call {
	background: #1a1a24;
	border: 1px solid rgba(255,255,255,0.06);
	border-radius: 8px;
	margin-bottom: 6px;
	overflow: hidden;
}

.jada-tool-header {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 6px 10px;
	font-size: 12px;
	font-weight: 600;
	color: #e94560;
}

.jada-tool-icon {
	font-size: 13px;
}

.jada-tool-icon.spinning {
	animation: spin 1s linear infinite;
}

@keyframes spin {
	from { transform: rotate(0deg); }
	to { transform: rotate(360deg); }
}

.jada-tool-name {
	font-family: 'SF Mono', 'Fira Code', monospace;
	font-size: 12px;
}

/* ─── Typing indicator ─── */
.jada-typing {
	display: flex;
	gap: 4px;
	padding: 8px 14px;
	background: #1e1e2a;
	border-radius: 12px;
	display: inline-flex;
}

.jada-typing span {
	width: 7px;
	height: 7px;
	border-radius: 50%;
	background: #e94560;
	animation: bounce 1.4s ease-in-out infinite;
}

.jada-typing span:nth-child(2) { animation-delay: 0.2s; }
.jada-typing span:nth-child(3) { animation-delay: 0.4s; }

@keyframes bounce {
	0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
	40% { transform: scale(1); opacity: 1; }
}

/* ─── Input area ─── */
.jada-chat-input-area {
	padding: 12px 24px 16px;
	border-top: 1px solid rgba(255,255,255,0.06);
}

.jada-chat-input-row {
	display: flex;
	align-items: flex-end;
	gap: 8px;
	background: #1e1e2a;
	border: 1px solid rgba(255,255,255,0.08);
	border-radius: 14px;
	padding: 8px 8px 8px 16px;
	max-width: 800px;
	transition: border-color 0.2s;
}

.jada-chat-input-row:focus-within {
	border-color: rgba(233, 69, 96, 0.5);
}

.jada-chat-input {
	flex: 1;
	border: none;
	background: transparent;
	color: #e8e8ef;
	font-size: 14px;
	line-height: 1.5;
	resize: none;
	outline: none;
	min-height: 22px;
	max-height: 120px;
	padding: 2px 0;
	font-family: inherit;
}

.jada-chat-input::placeholder {
	color: #555;
}

.jada-send-btn {
	width: 34px;
	height: 34px;
	border-radius: 10px;
	border: none;
	background: linear-gradient(135deg, #e94560, #c23152);
	color: #fff;
	cursor: pointer;
	display: flex;
	align-items: center;
	justify-content: center;
	transition: all 0.2s;
	flex-shrink: 0;
}

.jada-send-btn:hover:not(:disabled) {
	box-shadow: 0 2px 10px rgba(233, 69, 96, 0.4);
}

.jada-send-btn:disabled {
	opacity: 0.3;
	cursor: not-allowed;
}

.jada-input-footer {
	display: flex;
	gap: 6px;
	padding: 6px 4px 0;
	font-size: 11px;
	color: #444;
}
</style>
