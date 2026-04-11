<template>
	<div class="jada-chat">
		<div class="jada-chat-messages" ref="messages">
			<div v-if="messages.length === 0" class="jada-chat-empty">
				<div class="jada-chat-empty-icon">
					<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" width="64" height="64">
						<circle cx="16" cy="16" r="14" fill="#1a1a2e" stroke="#e94560" stroke-width="1.5"/>
						<circle cx="11" cy="13" r="2" fill="#e94560"/>
						<circle cx="21" cy="13" r="2" fill="#e94560"/>
						<path d="M10 20 Q16 25 22 20" stroke="#e94560" stroke-width="1.5" fill="none" stroke-linecap="round"/>
					</svg>
				</div>
				<h2>Chat with Jada</h2>
				<p>Send a message to your AI agent. Jada has access to your MCP tools and skills.</p>
				<div class="jada-chat-suggestions">
					<button v-for="s in suggestions" :key="s" class="jada-suggestion" @click="sendMessage(s)">
						{{ s }}
					</button>
				</div>
			</div>

			<div v-for="(msg, i) in messages" :key="i" :class="['jada-message', msg.role]">
				<div class="jada-message-avatar">
					<span v-if="msg.role === 'user'">You</span>
					<span v-else>J</span>
				</div>
				<div class="jada-message-content">
					<div class="jada-message-text" v-html="formatMessage(msg.content)"></div>
					<div class="jada-message-meta" v-if="msg.timestamp">
						{{ formatTime(msg.timestamp) }}
					</div>
				</div>
			</div>

			<div v-if="loading" class="jada-message assistant">
				<div class="jada-message-avatar"><span>J</span></div>
				<div class="jada-message-content">
					<div class="jada-typing">
						<span></span><span></span><span></span>
					</div>
				</div>
			</div>
		</div>

		<div class="jada-chat-input-area">
			<div class="jada-chat-input-wrapper">
				<textarea
					ref="input"
					v-model="inputText"
					class="jada-chat-input"
					placeholder="Message Jada..."
					rows="1"
					@keydown.enter.exact.prevent="sendMessage()"
					@input="autoResize"
				></textarea>
				<button class="jada-send-btn" @click="sendMessage()" :disabled="!inputText.trim() || loading">
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
					</svg>
				</button>
			</div>
		</div>
	</div>
</template>

<script>
import api from '../api.js'

export default {
	name: 'ChatView',
	data() {
		return {
			messages: [],
			inputText: '',
			loading: false,
			suggestions: [
				'What can you do?',
				'List my Nextcloud files',
				'Check system status',
				'What skills do you have?',
			],
		}
	},
	methods: {
		async sendMessage(text) {
			const message = text || this.inputText.trim()
			if (!message) return

			this.inputText = ''
			this.messages.push({
				role: 'user',
				content: message,
				timestamp: new Date(),
			})
			this.scrollToBottom()
			this.loading = true

			try {
				const result = await api.sendMessage(message)
				this.messages.push({
					role: 'assistant',
					content: result.response || result.message || result.text || JSON.stringify(result),
					timestamp: new Date(),
				})
			} catch (err) {
				this.messages.push({
					role: 'assistant',
					content: 'Error: ' + (err.response?.data?.error || err.message || 'Failed to reach agent'),
					timestamp: new Date(),
				})
			} finally {
				this.loading = false
				this.scrollToBottom()
			}
		},
		formatMessage(text) {
			if (!text) return ''
			return text
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/\n/g, '<br>')
				.replace(/`([^`]+)`/g, '<code>$1</code>')
				.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
		},
		formatTime(date) {
			if (!date) return ''
			const d = new Date(date)
			return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
		},
		scrollToBottom() {
			this.$nextTick(() => {
				const el = this.$refs.messages
				if (el) el.scrollTop = el.scrollHeight
			})
		},
		autoResize() {
			const el = this.$refs.input
			if (!el) return
			el.style.height = 'auto'
			el.style.height = Math.min(el.scrollHeight, 120) + 'px'
		},
	},
}
</script>

<style scoped>
.jada-chat {
	display: flex;
	flex-direction: column;
	height: calc(100vh - 50px);
}

.jada-chat-messages {
	flex: 1;
	overflow-y: auto;
	padding: 24px 32px;
}

.jada-chat-empty {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	height: 100%;
	text-align: center;
	color: var(--color-text-maxcontrast);
}

.jada-chat-empty-icon {
	margin-bottom: 20px;
	opacity: 0.8;
	animation: float 3s ease-in-out infinite;
}

@keyframes float {
	0%, 100% { transform: translateY(0); }
	50% { transform: translateY(-8px); }
}

.jada-chat-empty h2 {
	font-size: 22px;
	font-weight: 700;
	color: var(--color-main-text);
	margin-bottom: 8px;
}

.jada-chat-empty p {
	font-size: 14px;
	max-width: 400px;
	margin-bottom: 24px;
}

.jada-chat-suggestions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	justify-content: center;
}

.jada-suggestion {
	padding: 8px 16px;
	border-radius: 20px;
	border: 1px solid var(--color-border);
	background: var(--color-background-dark);
	color: var(--color-main-text);
	font-size: 13px;
	cursor: pointer;
	transition: all 0.2s;
}

.jada-suggestion:hover {
	border-color: #e94560;
	background: rgba(233, 69, 96, 0.05);
	color: #e94560;
}

.jada-message {
	display: flex;
	gap: 12px;
	margin-bottom: 20px;
	max-width: 800px;
}

.jada-message.user {
	margin-left: auto;
	flex-direction: row-reverse;
}

.jada-message-avatar {
	width: 36px;
	height: 36px;
	border-radius: 10px;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 13px;
	font-weight: 700;
	flex-shrink: 0;
}

.jada-message.user .jada-message-avatar {
	background: linear-gradient(135deg, #3b82f6, #2563eb);
	color: #fff;
}

.jada-message.assistant .jada-message-avatar {
	background: linear-gradient(135deg, #e94560, #c23152);
	color: #fff;
}

.jada-message-content {
	background: var(--color-background-dark);
	border: 1px solid var(--color-border);
	border-radius: 14px;
	padding: 12px 16px;
	max-width: 600px;
}

.jada-message.user .jada-message-content {
	background: linear-gradient(135deg, #3b82f6, #2563eb);
	color: #fff;
	border: none;
}

.jada-message-text {
	font-size: 14px;
	line-height: 1.6;
}

.jada-message-text code {
	background: rgba(0,0,0,0.1);
	padding: 2px 6px;
	border-radius: 4px;
	font-size: 13px;
}

.jada-message-meta {
	font-size: 11px;
	color: var(--color-text-maxcontrast);
	margin-top: 6px;
}

.jada-message.user .jada-message-meta {
	color: rgba(255,255,255,0.7);
}

.jada-typing {
	display: flex;
	gap: 4px;
	padding: 4px 0;
}

.jada-typing span {
	width: 8px;
	height: 8px;
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

.jada-chat-input-area {
	padding: 16px 32px 24px;
	border-top: 1px solid var(--color-border);
	background: var(--color-main-background);
}

.jada-chat-input-wrapper {
	display: flex;
	align-items: flex-end;
	gap: 8px;
	max-width: 800px;
	margin: 0 auto;
	background: var(--color-background-dark);
	border: 1px solid var(--color-border);
	border-radius: 16px;
	padding: 8px 8px 8px 16px;
	transition: border-color 0.2s;
}

.jada-chat-input-wrapper:focus-within {
	border-color: #e94560;
	box-shadow: 0 0 0 2px rgba(233, 69, 96, 0.15);
}

.jada-chat-input {
	flex: 1;
	border: none;
	background: transparent;
	color: var(--color-main-text);
	font-size: 14px;
	line-height: 1.5;
	resize: none;
	outline: none;
	min-height: 24px;
	max-height: 120px;
	padding: 4px 0;
}

.jada-send-btn {
	width: 36px;
	height: 36px;
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
	box-shadow: 0 4px 12px rgba(233, 69, 96, 0.4);
	transform: translateY(-1px);
}

.jada-send-btn:disabled {
	opacity: 0.4;
	cursor: not-allowed;
}
</style>
