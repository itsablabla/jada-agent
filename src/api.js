import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'

const baseUrl = generateUrl('/apps/jadaagent')

export default {
	// ─── Health ──────────────────────────────────────────────────────────

	async getHealth() {
		const res = await axios.get(`${baseUrl}/api/health`)
		return res.data
	},

	async getHealthDetail() {
		const res = await axios.get(`${baseUrl}/api/health/detail`)
		return res.data
	},

	// ─── Chat ────────────────────────────────────────────────────────────

	async sendMessage(messages, conversationId = 'main') {
		const payload = Array.isArray(messages)
			? { messages, conversation_id: conversationId }
			: { message: messages, conversation_id: conversationId }
		const res = await axios.post(`${baseUrl}/api/chat`, payload)
		return res.data
	},

	/**
	 * Open an SSE stream to the LibreChat backend (OpenAI-compatible).
	 * @param {Array} messages - Full conversation history [{role, content}, ...]
	 * @param {string} [conversationId] - Optional conversation ID for persistence
	 * @returns {{ promise: Promise<Response>, cancel: Function }}
	 */
	createSSEStream(messages, conversationId = null) {
		const url = `${baseUrl}/api/chat/sse`
		const csrfToken = document.querySelector('meta[name="requesttoken"]')?.content
			|| window.OC?.requestToken || ''

		const controller = new AbortController()
		const body = { messages }
		if (conversationId) body.conversationId = conversationId

		const promise = fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'requesttoken': csrfToken,
			},
			body: JSON.stringify(body),
			signal: controller.signal,
		})

		return {
			promise,
			cancel: () => controller.abort(),
		}
	},

	// ─── Conversations (server-side via LibreChat) ───────────────────────

	async getConversations(params = {}) {
		const res = await axios.get(`${baseUrl}/api/conversations`, { params })
		return res.data
	},

	async getConversation(id) {
		const res = await axios.get(`${baseUrl}/api/conversations/${encodeURIComponent(id)}`)
		return res.data
	},

	async deleteConversation(id) {
		const res = await axios.delete(`${baseUrl}/api/conversations/${encodeURIComponent(id)}`)
		return res.data
	},

	async updateConversation(conversationId, title) {
		const res = await axios.post(`${baseUrl}/api/conversations/update`, { conversationId, title })
		return res.data
	},

	async archiveConversation(conversationId, isArchived = true) {
		const res = await axios.post(`${baseUrl}/api/conversations/archive`, { conversationId, isArchived })
		return res.data
	},

	async genTitle(conversationId) {
		const res = await axios.get(`${baseUrl}/api/conversations/${encodeURIComponent(conversationId)}/gen-title`)
		return res.data
	},

	// ─── Messages (server-side via LibreChat) ────────────────────────────

	async getMessages(params = {}) {
		const res = await axios.get(`${baseUrl}/api/messages`, { params })
		return res.data
	},

	async getConversationMessages(conversationId) {
		const res = await axios.get(`${baseUrl}/api/messages/${encodeURIComponent(conversationId)}`)
		return res.data
	},

	async getConversationToolCalls(id) {
		const res = await axios.get(`${baseUrl}/api/conversations/${encodeURIComponent(id)}/toolcalls`)
		return res.data
	},

	async getRecentToolCalls() {
		const res = await axios.get(`${baseUrl}/api/toolcalls/recent`)
		return res.data
	},

	// ─── Search ──────────────────────────────────────────────────────────

	async search(query, params = {}) {
		const res = await axios.get(`${baseUrl}/api/search`, { params: { q: query, ...params } })
		return res.data
	},

	// ─── Tags ────────────────────────────────────────────────────────────

	async getTags() {
		const res = await axios.get(`${baseUrl}/api/tags`)
		return res.data
	},

	async addTag(conversationId, tag) {
		const res = await axios.post(`${baseUrl}/api/tags`, { conversationId, tag })
		return res.data
	},

	async removeTag(conversationId, tag) {
		const res = await axios.delete(`${baseUrl}/api/tags`, { data: { conversationId, tag } })
		return res.data
	},

	// ─── Sharing ─────────────────────────────────────────────────────────

	async getSharedLinks() {
		const res = await axios.get(`${baseUrl}/api/share`)
		return res.data
	},

	async createShareLink(conversationId) {
		const res = await axios.post(`${baseUrl}/api/share`, { conversationId })
		return res.data
	},

	async deleteShareLink(id) {
		const res = await axios.delete(`${baseUrl}/api/share/${encodeURIComponent(id)}`)
		return res.data
	},

	// ─── Memories ────────────────────────────────────────────────────────

	async getMemories() {
		const res = await axios.get(`${baseUrl}/api/memories`)
		return res.data
	},

	async deleteMemory(id) {
		const res = await axios.delete(`${baseUrl}/api/memories/${encodeURIComponent(id)}`)
		return res.data
	},

	// ─── Presets ─────────────────────────────────────────────────────────

	async getPresets() {
		const res = await axios.get(`${baseUrl}/api/presets`)
		return res.data
	},

	async createPreset(data) {
		const res = await axios.post(`${baseUrl}/api/presets`, data)
		return res.data
	},

	async deletePreset(id) {
		const res = await axios.delete(`${baseUrl}/api/presets/${encodeURIComponent(id)}`)
		return res.data
	},

	// ─── MCP / Legacy ────────────────────────────────────────────────────

	async reconnectMcp(server = null) {
		const res = await axios.post(`${baseUrl}/api/reconnect`, server ? { server } : {})
		return res.data
	},

	async getSkills() {
		const res = await axios.get(`${baseUrl}/api/skills`)
		return res.data
	},

	async getModels() {
		const res = await axios.get(`${baseUrl}/api/models`)
		return res.data
	},

	async getSessions() {
		const res = await axios.get(`${baseUrl}/api/sessions`)
		return res.data
	},

	// ─── Workspaces ──────────────────────────────────────────────────────

	async getWorkspaces() {
		const res = await axios.get(`${baseUrl}/api/workspaces`)
		return res.data
	},

	async getWorkspace(id) {
		const res = await axios.get(`${baseUrl}/api/workspaces/${encodeURIComponent(id)}`)
		return res.data
	},

	async createWorkspace(data) {
		const res = await axios.post(`${baseUrl}/api/workspaces`, data)
		return res.data
	},

	async updateWorkspace(id, data) {
		const res = await axios.put(`${baseUrl}/api/workspaces/${encodeURIComponent(id)}`, data)
		return res.data
	},

	async deleteWorkspace(id) {
		const res = await axios.delete(`${baseUrl}/api/workspaces/${encodeURIComponent(id)}`)
		return res.data
	},

	// ─── User ────────────────────────────────────────────────────────────

	async getUserProfile() {
		const res = await axios.get(`${baseUrl}/api/profile`)
		return res.data
	},

	async getSettings() {
		const res = await axios.get(`${baseUrl}/api/settings`)
		return res.data
	},

	async saveSettings(settings) {
		const res = await axios.put(`${baseUrl}/api/settings`, settings)
		return res.data
	},
}
