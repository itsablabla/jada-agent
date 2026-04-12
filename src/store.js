import { reactive } from 'vue'
import api from './api.js'

/**
 * Global reactive store for workspace state, conversations, and user profile.
 * Shared across all components via provide/inject or direct import.
 */
export const store = reactive({
	// Current view: 'chat' | 'workspaces' | 'workspace-detail' | 'document-editor' | 'tool-explorer' | 'search' | 'settings' | 'profile'
	currentView: 'chat',

	// Workspace state
	workspaces: [],
	activeWorkspaceId: 'nextcloud',

	// Conversation state
	conversations: [],
	activeConversationId: null,
	messages: [],

	// Health & tools
	healthy: false,
	healthData: null,
	mcpServers: [],
	totalTools: 0,
	recentToolCalls: [],

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

		// Always ensure Nextcloud root workspace exists
		if (!store.workspaces.find(w => w.id === 'nextcloud')) {
			store.workspaces.unshift(DEFAULT_WORKSPACES[0])
		}

		// Load health
		await this.refreshHealth()

		// Load conversations for active workspace
		await this.loadConversations()

		// Load recent tool calls from backend (persisted across reloads)
		await this.loadRecentToolCalls()

		// Load user profile
		try {
			store.userProfile = await api.getUserProfile()
		} catch {
			// Profile endpoint may not exist yet — use Nextcloud user info
			store.userProfile = {
				uid: window.OC?.currentUser || 'admin',
				displayName: window.OC?.getCurrentUser?.()?.displayName || 'User',
				email: '',
			}
		}
	},

	async refreshHealth() {
		try {
			const data = await api.getHealth()
			store.healthy = data?.ok === true || data?.status === 'ok'
			store.healthData = data

			// Extract MCP server info
			// Backend returns mcpServers (or servers) with {status, tools} per server
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
		} catch {
			store.healthy = false
			store.healthData = null
		}
	},

	async loadConversations() {
		try {
			const data = await api.getConversations()
			if (Array.isArray(data)) {
				store.conversations = data
			} else if (data?.conversations) {
				store.conversations = data.conversations
			}
		} catch {
			store.conversations = []
		}
	},

	setActiveWorkspace(id) {
		store.activeWorkspaceId = id
		store.activeConversationId = null
		store.messages = []
	},

	getActiveWorkspace() {
		return store.workspaces.find(w => w.id === store.activeWorkspaceId) || store.workspaces[0]
	},

	startNewChat() {
		store.activeConversationId = 'conv-' + Date.now()
		store.messages = []
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
			// Backend may not support this yet — keep empty
		}
	},
}
