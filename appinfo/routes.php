<?php

return [
    'routes' => [
        // Page routes
        ['name' => 'page#index', 'url' => '/', 'verb' => 'GET'],
        
        // OpenClaw proxy API routes
        ['name' => 'agent#health', 'url' => '/api/health', 'verb' => 'GET'],
        ['name' => 'agent#healthDetail', 'url' => '/api/health/detail', 'verb' => 'GET'],
        ['name' => 'agent#chat', 'url' => '/api/chat', 'verb' => 'POST'],
        ['name' => 'agent#chatSSE', 'url' => '/api/chat/sse', 'verb' => 'POST'],
        ['name' => 'agent#reconnect', 'url' => '/api/reconnect', 'verb' => 'POST'],
        ['name' => 'agent#getConversations', 'url' => '/api/conversations', 'verb' => 'GET'],
        ['name' => 'agent#getConversation', 'url' => '/api/conversations/{id}', 'verb' => 'GET'],
        ['name' => 'agent#getConversationToolCalls', 'url' => '/api/conversations/{id}/toolcalls', 'verb' => 'GET'],
        ['name' => 'agent#getRecentToolCalls', 'url' => '/api/toolcalls/recent', 'verb' => 'GET'],
        ['name' => 'agent#deleteConversation', 'url' => '/api/conversations/{id}', 'verb' => 'DELETE'],
        // MCP server management
        ['name' => 'agent#getMcpServers', 'url' => '/api/mcp', 'verb' => 'GET'],
        ['name' => 'agent#addMcpServer', 'url' => '/api/mcp', 'verb' => 'POST'],
        ['name' => 'agent#removeMcpServer', 'url' => '/api/mcp/{name}', 'verb' => 'DELETE'],

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
