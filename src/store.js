import { reactive } from 'vue'
import api from './api.js'

/**
 * Global reactive store for workspace state, conversations, and user profile.
 * Conversations are now persisted server-side via LibreChat's API.
 */
export const store = reactive({
	// Current view
	currentView: 'chat',

	// Workspace state
	workspaces: [],
	activeWorkspaceId: 'nextcloud',

	// Conversation state (server-side via LibreChat)
	conversations: [],
	activeConversationId: null,
	messages: [],
	conversationsCursor: null,
	hasMoreConversations: false,
	conversationsLoading: false,

	// Health & tools
	healthy: false,
	healthData: null,
	mcpServers: [],
	totalTools: 0,
	modelName: '',
	recentToolCalls: [],

	// Tags (server-side via LibreChat)
	tags: [],

	// Search
	searchResults: [],
	searchLoading: false,

	// Sharing
	sharedLinks: [],

	// Memories
	memories: [],
	memoryStats: { totalTokens: 0, charLimit: 10000 },

	// Presets
	presets: [],

	// User
	userProfile: null,

	// Right panel
	rightPanelTab: 'tools',
	rightPanelOpen: true,

	// Mobile
	isMobile: false,
	mobileSidebarOpen: false,
})

/** Default workspaces — Nextcloud is always root */
const DEFAULT_WORKSPACES = [
	{
		id: 'nextcloud',
		name: 'Nextcloud',
		color: '#0082c9',
		isRoot: true,
		description: 'Your home workspace — general Nextcloud operations, file management, calendar, contacts, email, and system administration.',
		tags: ['files', 'calendar', 'contacts', 'admin'],
		chatCount: 0,
		toolCalls: 0,
		lastActive: null,
	},
	{
		id: 'kuse',
		name: 'Kuse',
		color: '#e94560',
		isRoot: false,
		description: 'Kuse platform development — API integrations, MCP tool deployment, document management.',
		tags: ['api', 'mcp', 'webhooks'],
		chatCount: 0,
		toolCalls: 0,
		lastActive: null,
	},
	{
		id: 'nomad-internet',
		name: 'Nomad Internet',
		color: '#008061',
		isRoot: false,
		description: 'Customer support, billing, FreeScout helpdesk management, and Verizon integration.',
		tags: ['support', 'billing', 'email'],
		chatCount: 0,
		toolCalls: 0,
		lastActive: null,
	},
	{
		id: 'garza-os',
		name: 'GARZA OS',
		color: '#8b5cf6',
		isRoot: false,
		description: 'Infrastructure management — VPS, Docker containers, MCP servers, Railway deployments.',
		tags: ['infra', 'docker', 'mcp', 'vps'],
		chatCount: 0,
		toolCalls: 0,
		lastActive: null,
	},
	{
		id: 'development',
		name: 'Development',
		color: '#22c55e',
		isRoot: false,
		description: 'General software development — code reviews, debugging, Paperclip, Sim Studio.',
		tags: ['code', 'review', 'deploy'],
		chatCount: 0,
		toolCalls: 0,
		lastActive: null,
	},
	{
		id: 'finance',
		name: 'Finance',
		color: '#f59e0b',
		isRoot: false,
		description: 'Akaunting, Chargebee, invoicing, payment tracking, and financial reporting.',
		tags: ['invoices', 'payments'],
		chatCount: 0,
		toolCalls: 0,
		lastActive: null,
	},
	{
		id: 'personal',
		name: 'Personal',
		color: '#ec4899',
		isRoot: false,
		description: 'Personal tasks, notes, and miscellaneous items.',
		tags: ['notes', 'tasks'],
		chatCount: 0,
		toolCalls: 0,
		lastActive: null,
	},
]

export const actions = {
	async init() {
		store.isMobile = window.innerWidth < 768
		window.addEventListener('resize', () => {
			store.isMobile = window.innerWidth < 768
		})

		// Load workspaces (fallback to defaults)
		try {
			const ws = await api.getWorkspaces()
			store.workspaces = Array.isArray(ws) && ws.length > 0 ? ws : DEFAULT_WORKSPACES
		} catch {
			store.workspaces = DEFAULT_WORKSPACES
		}

		if (!store.workspaces.find(w => w.id === 'nextcloud')) {
			store.workspaces.unshift(DEFAULT_WORKSPACES[0])
		}

		await this.refreshHealth()

		try {
			store.userProfile = await api.getUserProfile()
		} catch {
			store.userProfile = {
				uid: window.OC?.currentUser || 'default',
				displayName: window.OC?.getCurrentUser?.()?.displayName || 'User',
				email: '',
			}
		}

		// Load conversations from LibreChat server
		await this.loadConversations()

		// Load tags
		await this.loadTags()
	},

	async refreshHealth() {
		try {
			const data = await api.getHealth()
			store.healthy = data?.ok === true
			store.healthData = data

			const servers = data?.mcpServers || data?.servers
			if (servers && typeof servers === 'object') {
				store.mcpServers = Object.entries(servers).map(([name, info]) => ({
					name,
					tools: info.tools || 0,
					connected: info.status === 'connected' || info.connected !== false,
				}))
				store.totalTools = store.mcpServers.reduce((sum, s) => sum + s.tools, 0)
			} else if (data?.tools) {
				store.totalTools = data.tools
			} else if (data?.tool_count) {
				store.totalTools = data.tool_count
			}

			if (data?.model_name) {
				store.modelName = data.model_name
			}
		} catch {
			store.healthy = false
			store.healthData = null
		}
	},

	// ─── Server-side conversations ───────────────────────────────────────

	async loadConversations(append = false) {
		if (store.conversationsLoading) return
		store.conversationsLoading = true

		try {
			const params = { limit: 25 }
			if (append && store.conversationsCursor) {
				params.cursor = store.conversationsCursor
			}

			const result = await api.getConversations(params)
			const convos = (result?.conversations || []).map(c => ({
				id: c.conversationId || c._id,
				title: c.title || 'New Conversation',
				updatedAt: c.updatedAt || c.createdAt,
				createdAt: c.createdAt,
				endpoint: c.endpoint,
				model: c.model,
				tags: c.tags || [],
				isArchived: c.isArchived || false,
			}))

			if (append) {
				store.conversations.push(...convos)
			} else {
				store.conversations = convos
			}

			store.conversationsCursor = result?.nextCursor || null
			store.hasMoreConversations = !!result?.nextCursor
		} catch (e) {
			console.error('Failed to load conversations from server:', e)
			// Fallback to localStorage for backward compat during migration
			this.loadConversationsFromLocalStorage()
		} finally {
			store.conversationsLoading = false
		}
	},

	loadConversationsFromLocalStorage() {
		const uid = store.userProfile?.uid || window.OC?.currentUser || 'default'
		const scopedKey = `jada_${uid}_conversations`
		try {
			store.conversations = JSON.parse(localStorage.getItem(scopedKey) || '[]')
		} catch {
			store.conversations = []
		}
	},

	async loadConversationMessages(conversationId) {
		if (!conversationId) return
		try {
			const messages = await api.getConversationMessages(conversationId)
			if (Array.isArray(messages)) {
				store.messages = messages.map(m => ({
					role: m.isCreatedByUser ? 'user' : 'assistant',
					content: typeof m.text === 'string' ? m.text : (m.content || ''),
					messageId: m.messageId,
					parentMessageId: m.parentMessageId,
					createdAt: m.createdAt,
					sender: m.sender,
				}))
			} else {
				store.messages = []
			}
		} catch (e) {
			console.error('Failed to load messages:', e)
			store.messages = []
		}
	},

	async selectConversation(conversationId) {
		store.activeConversationId = conversationId
		store.messages = []
		store.recentToolCalls = []
		// Don't call loadConversationMessages here — ChatView's watcher on
		// activeConversationId already triggers loadServerMessages(), so calling
		// it here would cause a duplicate API request.
		store.currentView = 'chat'
	},

	async deleteConversation(conversationId) {
		try {
			await api.deleteConversation(conversationId)
			store.conversations = store.conversations.filter(c => c.id !== conversationId)
			if (store.activeConversationId === conversationId) {
				store.activeConversationId = null
				store.messages = []
			}
		} catch (e) {
			console.error('Failed to delete conversation:', e)
		}
	},

	async updateConversationTitle(conversationId, title) {
		try {
			await api.updateConversation(conversationId, title)
			const conv = store.conversations.find(c => c.id === conversationId)
			if (conv) conv.title = title
		} catch (e) {
			console.error('Failed to update conversation title:', e)
		}
	},

	async archiveConversation(conversationId) {
		try {
			await api.archiveConversation(conversationId, true)
			store.conversations = store.conversations.filter(c => c.id !== conversationId)
			if (store.activeConversationId === conversationId) {
				store.activeConversationId = null
				store.messages = []
			}
		} catch (e) {
			console.error('Failed to archive conversation:', e)
		}
	},

	async generateTitle(conversationId) {
		try {
			const result = await api.genTitle(conversationId)
			if (result?.title) {
				const conv = store.conversations.find(c => c.id === conversationId)
				if (conv) conv.title = result.title
			}
			return result
		} catch (e) {
			console.error('Failed to generate title:', e)
		}
	},

	// ─── Tags ────────────────────────────────────────────────────────────

	async loadTags() {
		try {
			const tags = await api.getTags()
			store.tags = Array.isArray(tags) ? tags : []
		} catch {
			store.tags = []
		}
	},

	async tagConversation(conversationId, tag) {
		try {
			await api.addTag(conversationId, tag)
			const conv = store.conversations.find(c => c.id === conversationId)
			if (conv && !conv.tags.includes(tag)) conv.tags.push(tag)
			await this.loadTags()
		} catch (e) {
			console.error('Failed to tag conversation:', e)
		}
	},

	async untagConversation(conversationId, tag) {
		try {
			await api.removeTag(conversationId, tag)
			const conv = store.conversations.find(c => c.id === conversationId)
			if (conv) conv.tags = conv.tags.filter(t => t !== tag)
			await this.loadTags()
		} catch (e) {
			console.error('Failed to untag conversation:', e)
		}
	},

	// ─── Search ──────────────────────────────────────────────────────────

	async searchMessages(query) {
		if (!query || query.trim().length < 2) {
			store.searchResults = []
			return
		}
		store.searchLoading = true
		try {
			const result = await api.search(query)
			store.searchResults = (result?.messages || []).map(m => ({
				messageId: m.messageId,
				conversationId: m.conversationId,
				text: m.text || m.content || '',
				sender: m.sender,
				isCreatedByUser: m.isCreatedByUser,
				createdAt: m.createdAt,
			}))
		} catch (e) {
			console.error('Search failed:', e)
			store.searchResults = []
		} finally {
			store.searchLoading = false
		}
	},

	// ─── Sharing ─────────────────────────────────────────────────────────

	async loadSharedLinks() {
		try {
			const result = await api.getSharedLinks()
			store.sharedLinks = result?.links || []
		} catch {
			store.sharedLinks = []
		}
	},

	async shareConversation(conversationId) {
		try {
			const result = await api.createShareLink(conversationId)
			await this.loadSharedLinks()
			return result
		} catch (e) {
			console.error('Failed to share conversation:', e)
		}
	},

	async deleteShareLink(id) {
		try {
			await api.deleteShareLink(id)
			store.sharedLinks = store.sharedLinks.filter(l => l._id !== id)
		} catch (e) {
			console.error('Failed to delete share link:', e)
		}
	},

	// ─── Memories ────────────────────────────────────────────────────────

	async loadMemories() {
		try {
			const result = await api.getMemories()
			store.memories = result?.memories || []
			store.memoryStats = {
				totalTokens: result?.totalTokens || 0,
				charLimit: result?.charLimit || 10000,
				usagePercentage: result?.usagePercentage || null,
			}
		} catch {
			store.memories = []
		}
	},

	async deleteMemory(id) {
		try {
			await api.deleteMemory(id)
			store.memories = store.memories.filter(m => m._id !== id)
		} catch (e) {
			console.error('Failed to delete memory:', e)
		}
	},

	// ─── Presets ─────────────────────────────────────────────────────────

	async loadPresets() {
		try {
			const result = await api.getPresets()
			store.presets = Array.isArray(result) ? result : []
		} catch {
			store.presets = []
		}
	},

	async createPreset(data) {
		try {
			const result = await api.createPreset(data)
			await this.loadPresets()
			return result
		} catch (e) {
			console.error('Failed to create preset:', e)
		}
	},

	async deletePreset(id) {
		try {
			await api.deletePreset(id)
			store.presets = store.presets.filter(p => p._id !== id)
		} catch (e) {
			console.error('Failed to delete preset:', e)
		}
	},

	// ─── Navigation ──────────────────────────────────────────────────────

	setActiveWorkspace(id) {
		store.activeWorkspaceId = id
		store.activeConversationId = null
		store.messages = []
		// Reload conversations filtered by tag if workspace has a tag mapping
		this.loadConversations()
	},

	getActiveWorkspace() {
		return store.workspaces.find(w => w.id === store.activeWorkspaceId) || store.workspaces[0]
	},

	startNewChat() {
		store.activeConversationId = null
		store.messages = []
		store.recentToolCalls = []
		store.currentView = 'chat'
	},

	navigate(view) {
		store.currentView = view
		if (store.isMobile) {
			store.mobileSidebarOpen = false
		}
	},

	addToolCall(toolCall) {
		store.recentToolCalls.unshift(toolCall)
		if (store.recentToolCalls.length > 20) {
			store.recentToolCalls.pop()
		}
	},

	async loadRecentToolCalls() {
		try {
			const data = await api.getRecentToolCalls()
			if (data?.toolCalls && Array.isArray(data.toolCalls)) {
				store.recentToolCalls = data.toolCalls.map(tc => ({
					name: tc.name,
					status: tc.status || 'success',
					result: tc.result || null,
					timestamp: tc.timestamp ? new Date(tc.timestamp) : new Date(),
					conversationId: tc.conversationId,
				}))
			}
		} catch {
			// keep empty
		}
	},
}
