<?php

return [
    'routes' => [
        // Page routes
        ['name' => 'page#index', 'url' => '/', 'verb' => 'GET'],
        
        // Health
        ['name' => 'agent#health', 'url' => '/api/health', 'verb' => 'GET'],
        ['name' => 'agent#healthDetail', 'url' => '/api/health/detail', 'verb' => 'GET'],
        
        // Chat (Agents API — API key auth)
        ['name' => 'agent#chat', 'url' => '/api/chat', 'verb' => 'POST'],
        ['name' => 'agent#chatSSE', 'url' => '/api/chat/sse', 'verb' => 'POST'],
        
        // Conversations (LibreChat /api/convos — JWT auth)
        ['name' => 'agent#getConversations', 'url' => '/api/conversations', 'verb' => 'GET'],
        ['name' => 'agent#getConversation', 'url' => '/api/conversations/{id}', 'verb' => 'GET'],
        ['name' => 'agent#deleteConversation', 'url' => '/api/conversations/{id}', 'verb' => 'DELETE'],
        ['name' => 'agent#updateConversation', 'url' => '/api/conversations/update', 'verb' => 'POST'],
        ['name' => 'agent#archiveConversation', 'url' => '/api/conversations/archive', 'verb' => 'POST'],
        ['name' => 'agent#genTitle', 'url' => '/api/conversations/{id}/gen-title', 'verb' => 'GET'],
        
        // Messages (LibreChat /api/messages — JWT auth)
        ['name' => 'agent#getMessages', 'url' => '/api/messages', 'verb' => 'GET'],
        ['name' => 'agent#getConversationMessages', 'url' => '/api/messages/{id}', 'verb' => 'GET'],
        ['name' => 'agent#getConversationToolCalls', 'url' => '/api/conversations/{id}/toolcalls', 'verb' => 'GET'],
        ['name' => 'agent#getRecentToolCalls', 'url' => '/api/toolcalls/recent', 'verb' => 'GET'],
        
        // Search (via /api/messages?search= — JWT auth)
        ['name' => 'agent#searchMessages', 'url' => '/api/search', 'verb' => 'GET'],
        
        // Tags (LibreChat /api/tags — JWT auth)
        ['name' => 'agent#getTags', 'url' => '/api/tags', 'verb' => 'GET'],
        ['name' => 'agent#addTag', 'url' => '/api/tags', 'verb' => 'POST'],
        ['name' => 'agent#removeTag', 'url' => '/api/tags', 'verb' => 'DELETE'],
        
        // Sharing (LibreChat /api/share — JWT auth)
        ['name' => 'agent#getSharedLinks', 'url' => '/api/share', 'verb' => 'GET'],
        ['name' => 'agent#createShareLink', 'url' => '/api/share', 'verb' => 'POST'],
        ['name' => 'agent#deleteShareLink', 'url' => '/api/share/{id}', 'verb' => 'DELETE'],
        
        // Memories (LibreChat /api/memories — JWT auth)
        ['name' => 'agent#getMemories', 'url' => '/api/memories', 'verb' => 'GET'],
        ['name' => 'agent#deleteMemory', 'url' => '/api/memories/{id}', 'verb' => 'DELETE'],
        
        // Presets (LibreChat /api/presets — JWT auth)
        ['name' => 'agent#getPresets', 'url' => '/api/presets', 'verb' => 'GET'],
        ['name' => 'agent#createPreset', 'url' => '/api/presets', 'verb' => 'POST'],
        ['name' => 'agent#deletePreset', 'url' => '/api/presets/{id}', 'verb' => 'DELETE'],
        
        // Legacy endpoints
        ['name' => 'agent#reconnect', 'url' => '/api/reconnect', 'verb' => 'POST'],
        ['name' => 'agent#getSkills', 'url' => '/api/skills', 'verb' => 'GET'],
        ['name' => 'agent#getModels', 'url' => '/api/models', 'verb' => 'GET'],
        ['name' => 'agent#getConfig', 'url' => '/api/config', 'verb' => 'GET'],
        ['name' => 'agent#getSessions', 'url' => '/api/sessions', 'verb' => 'GET'],
        
        // Workspace API routes
        ['name' => 'workspace#getWorkspaces', 'url' => '/api/workspaces', 'verb' => 'GET'],
        ['name' => 'workspace#getWorkspace', 'url' => '/api/workspaces/{id}', 'verb' => 'GET'],
        ['name' => 'workspace#createWorkspace', 'url' => '/api/workspaces', 'verb' => 'POST'],
        ['name' => 'workspace#updateWorkspace', 'url' => '/api/workspaces/{id}', 'verb' => 'PUT'],
        ['name' => 'workspace#deleteWorkspace', 'url' => '/api/workspaces/{id}', 'verb' => 'DELETE'],
        
        // User profile
        ['name' => 'workspace#getProfile', 'url' => '/api/profile', 'verb' => 'GET'],
        
        // Settings
        ['name' => 'settings#getSettings', 'url' => '/api/settings', 'verb' => 'GET'],
        ['name' => 'settings#saveSettings', 'url' => '/api/settings', 'verb' => 'PUT'],
    ],
];
