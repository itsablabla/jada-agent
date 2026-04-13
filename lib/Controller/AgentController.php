<?php

declare(strict_types=1);

namespace OCA\JadaAgent\Controller;

use OCA\JadaAgent\Service\OpenClawService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\IUserSession;

/**
 * Thin proxy controller for Hermes backend.
 *
 * Hermes is the authoritative owner of conversation state, user scoping,
 * tool call tracking, and session management.  PHP's only job is to:
 *   1. Verify Nextcloud authentication (handled by the framework)
 *   2. Forward the user's identity via X-Nextcloud-User / X-Nextcloud-Name
 *   3. Pipe the request/response through without transformation
 */
class AgentController extends Controller {
    private OpenClawService $openClaw;
    private IUserSession $userSession;

    public function __construct(
        string $appName,
        IRequest $request,
        OpenClawService $openClaw,
        IUserSession $userSession
    ) {
        parent::__construct($appName, $request);
        $this->openClaw = $openClaw;
        $this->userSession = $userSession;
    }

    /**
     * Get the current Nextcloud user identity headers.
     * These are sent to Hermes so it can scope everything to the user.
     */
    private function getUserHeaders(): array {
        $user = $this->userSession->getUser();
        $uid = $user ? $user->getUID() : 'anonymous';
        $name = $user ? ($user->getDisplayName() ?: $uid) : 'Anonymous';
        return [
            'X-Nextcloud-User' => $uid,
            'X-Nextcloud-Name' => $name,
        ];
    }

    /**
     * @NoAdminRequired
     *
     * Health check — queries Hermes Agent /v1/models to verify it's alive.
     */
    public function health(): JSONResponse {
        $result = $this->openClaw->get('/v1/models', $this->getUserHeaders());
        $models = $result['data'] ?? [];
        $isOk = !isset($result['error']);

        // Hermes Agent manages MCP servers internally via config.yaml.
        // Report the configured servers so the UI can display tool/server counts.
        // Active MCP servers (composio and proton-unified disabled for perf)
        $mcpServers = [
            'nextcloud' => ['tools' => 118, 'status' => 'connected'],
        ];

        return new JSONResponse([
            'ok' => $isOk,
            'status' => $isOk ? 'ok' : 'error',
            'engine' => 'hermes-agent',
            'model_name' => 'Gemini 2.5 Flash',
            'models' => count($models),
            'servers' => $mcpServers,
            'tool_count' => 118,
        ]);
    }

    /**
     * @NoAdminRequired
     */
    public function healthDetail(): JSONResponse {
        return $this->health();
    }

    /**
     * @NoAdminRequired
     *
     * Non-streaming chat fallback via Hermes Agent OpenAI-compatible API.
     */
    public function chat(): JSONResponse {
        $message = $this->request->getParam('message', '');
        $messages = $this->request->getParam('messages', null);

        $chatMessages = (is_array($messages) && count($messages) > 0)
            ? $this->sanitizeMessages($messages)
            : [['role' => 'user', 'content' => $message]];

        $result = $this->openClaw->post('/v1/chat/completions', [
            'model' => 'hermes-agent',
            'messages' => $chatMessages,
            'stream' => false,
        ], $this->getUserHeaders());

        $response = '';
        if (isset($result['choices'][0]['message']['content'])) {
            $response = $result['choices'][0]['message']['content'];
        } elseif (isset($result['error'])) {
            $response = 'Error: ' . ($result['error']['message'] ?? json_encode($result['error']));
        } elseif (isset($result['raw'])) {
            $response = $result['raw'];
        }

        return new JSONResponse([
            'response' => $response,
            'model' => $result['model'] ?? '',
            'usage' => $result['usage'] ?? null,
        ]);
    }

    /**
     * @NoAdminRequired
     *
     * SSE passthrough to Hermes Agent OpenAI-compatible streaming API.
     * Hermes handles context management, tool execution, and compression natively.
     */
    public function chatSSE(): void {
        $message = $this->request->getParam('message', '');
        $messages = $this->request->getParam('messages', null);

        $chatMessages = (is_array($messages) && count($messages) > 0)
            ? $this->sanitizeMessages($messages)
            : [['role' => 'user', 'content' => $message]];

        // Disable output buffering for real-time streaming
        while (ob_get_level()) {
            ob_end_clean();
        }
        session_write_close();

        header('Content-Type: text/event-stream');
        header('Cache-Control: no-cache');
        header('Connection: keep-alive');
        header('X-Accel-Buffering: no');

        $url = $this->openClaw->getBaseUrl() . '/v1/chat/completions';
        $token = $this->openClaw->getApiToken();
        $userHeaders = $this->getUserHeaders();

        $payload = json_encode([
            'model' => 'hermes-agent',
            'messages' => $chatMessages,
            'stream' => true,
        ]);

        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_RETURNTRANSFER => false,
            CURLOPT_TIMEOUT => 0,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
            CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
            CURLOPT_HTTPHEADER => array_filter([
                'Content-Type: application/json',
                'Accept: text/event-stream',
                $token ? 'Authorization: Bearer ' . $token : null,
                'X-Nextcloud-User: ' . $userHeaders['X-Nextcloud-User'],
                'X-Nextcloud-Name: ' . $userHeaders['X-Nextcloud-Name'],
            ]),
            CURLOPT_WRITEFUNCTION => function ($ch, $data) {
                echo $data;
                flush();
                return strlen($data);
            },
        ]);

        curl_exec($ch);

        $error = curl_error($ch);
        if ($error) {
            echo "data: " . json_encode(['error' => $error]) . "\n\n";
            flush();
        }

        curl_close($ch);
        exit;
    }

    /**
     * @NoAdminRequired
     *
     * List conversations — served from localStorage on the frontend now.
     * Returns empty array since Hermes Agent manages sessions internally.
     */
    public function getConversations(): JSONResponse {
        return new JSONResponse(['conversations' => []]);
    }

    /**
     * @NoAdminRequired
     */
    public function getConversation(string $id): JSONResponse {
        return new JSONResponse(['messages' => [], 'toolCalls' => []]);
    }

    /**
     * @NoAdminRequired
     */
    public function getConversationToolCalls(string $id): JSONResponse {
        return new JSONResponse(['toolCalls' => []]);
    }

    /**
     * @NoAdminRequired
     */
    public function getRecentToolCalls(): JSONResponse {
        return new JSONResponse(['toolCalls' => []]);
    }

    /**
     * @NoAdminRequired
     */
    public function deleteConversation(string $id): JSONResponse {
        return new JSONResponse(['deleted' => true]);
    }

    /**
     * @NoAdminRequired
     */
    public function reconnect(): JSONResponse {
        // Hermes Agent handles MCP reconnection internally
        return new JSONResponse(['status' => 'ok']);
    }

    /**
     * @NoAdminRequired
     */
    public function getSkills(): JSONResponse {
        return new JSONResponse($this->openClaw->get('/api/v1/skills', $this->getUserHeaders()));
    }

    /**
     * @NoAdminRequired
     */
    public function getModels(): JSONResponse {
        return new JSONResponse($this->openClaw->get('/api/v1/models', $this->getUserHeaders()));
    }

    /**
     * Admin only — returns config which may contain sensitive data.
     */
    public function getConfig(): JSONResponse {
        return new JSONResponse($this->openClaw->get('/api/v1/config', $this->getUserHeaders()));
    }

    /**
     * Admin only — returns session data.
     */
    public function getSessions(): JSONResponse {
        return new JSONResponse($this->openClaw->get('/api/v1/sessions', $this->getUserHeaders()));
    }

    /**
     * Sanitize a client-supplied messages array: only allow 'user' and 'assistant'
     * roles and strip anything else to prevent prompt injection.
     */
    private function sanitizeMessages(array $messages): array {
        $allowed = ['user', 'assistant'];
        $clean = [];
        foreach ($messages as $msg) {
            if (!is_array($msg) || !isset($msg['role'], $msg['content'])) {
                continue;
            }
            if (!in_array($msg['role'], $allowed, true)) {
                continue;
            }
            $clean[] = [
                'role' => $msg['role'],
                'content' => (string) $msg['content'],
            ];
        }
        return $clean;
    }
}
