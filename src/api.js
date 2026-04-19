import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'

const baseUrl = generateUrl('/apps/jadaagent')

export default {
	async getHealth() {
		const res = await axios.get(`${baseUrl}/api/health`)
		return res.data
	},

	async getHealthDetail() {
		const res = await axios.get(`${baseUrl}/api/health/detail`)
		return res.data
	},

	async sendMessage(messages, conversationId = 'main') {
		// Accept either a full messages array or a single string for backward compat
		const payload = Array.isArray(messages)
			? { messages, conversation_id: conversationId }
			: { message: messages, conversation_id: conversationId }
		const res = await axios.post(`${baseUrl}/api/chat`, payload)
		return res.data
	},

	/**
	 * Open an SSE stream to the Hermes Agent backend (OpenAI-compatible).
	 * @param {Array} messages - Full conversation history [{role, content}, ...]
	 * @returns {{ promise: Promise<Response>, cancel: Function }}
	 */
	createSSEStream(messages) {
		const url = `${baseUrl}/api/chat/sse`
		const csrfToken = document.querySelector('meta[name="requesttoken"]')?.content
			|| window.OC?.requestToken || ''

		const controller = new AbortController()
		const promise = fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'requesttoken': csrfToken,
			},
			body: JSON.stringify({ messages }),
			signal: controller.signal,
		})

		return {
			promise,
			cancel: () => controller.abort(),
		}
	},

	async getConversations() {
		const res = await axios.get(`${baseUrl}/api/conversations`)
		return res.data
	},

	async getConversation(id) {
		const res = await axios.get(`${baseUrl}/api/conversations/${encodeURIComponent(id)}`)
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

	async deleteConversation(id) {
		const res = await axios.delete(`${baseUrl}/api/conversations/${encodeURIComponent(id)}`)
		return res.data
	},

	async reconnectMcp(server = null) {
		const res = await axios.post(`${baseUrl}/api/reconnect`, server ? { server } : {})
		return res.data
	},

	// Workspace API
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

	// User profile
	async getUserProfile() {
		const res = await axios.get(`${baseUrl}/api/profile`)
		return res.data
	},

	async getMcpServers() {
		const res = await axios.get(`${baseUrl}/api/mcp`)
		return res.data
	},

	async addMcpServer(server) {
		const res = await axios.post(`${baseUrl}/api/mcp`, server)
		return res.data
	},

	async removeMcpServer(name) {
		const res = await axios.delete(`${baseUrl}/api/mcp/${encodeURIComponent(name)}`)
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

	async getSettings() {
		const res = await axios.get(`${baseUrl}/api/settings`)
		return res.data
	},

	async saveSettings(settings) {
		const res = await axios.put(`${baseUrl}/api/settings`, settings)
		return res.data
	},
}
