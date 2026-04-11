<?php

return [
    'routes' => [
        // Page routes
        ['name' => 'page#index', 'url' => '/', 'verb' => 'GET'],
        
        // OpenClaw proxy API routes
        ['name' => 'agent#health', 'url' => '/api/health', 'verb' => 'GET'],
        ['name' => 'agent#healthDetail', 'url' => '/api/health/detail', 'verb' => 'GET'],
        ['name' => 'agent#chat', 'url' => '/api/chat', 'verb' => 'POST'],
        ['name' => 'agent#chatStream', 'url' => '/api/chat/stream', 'verb' => 'POST'],
        ['name' => 'agent#getConversations', 'url' => '/api/conversations', 'verb' => 'GET'],
        ['name' => 'agent#getConversation', 'url' => '/api/conversations/{id}', 'verb' => 'GET'],
        ['name' => 'agent#deleteConversation', 'url' => '/api/conversations/{id}', 'verb' => 'DELETE'],
        ['name' => 'agent#getSkills', 'url' => '/api/skills', 'verb' => 'GET'],
        ['name' => 'agent#getModels', 'url' => '/api/models', 'verb' => 'GET'],
        ['name' => 'agent#getConfig', 'url' => '/api/config', 'verb' => 'GET'],
        ['name' => 'agent#getSessions', 'url' => '/api/sessions', 'verb' => 'GET'],
        
        // Settings
        ['name' => 'settings#getSettings', 'url' => '/api/settings', 'verb' => 'GET'],
        ['name' => 'settings#saveSettings', 'url' => '/api/settings', 'verb' => 'PUT'],
    ],
];
