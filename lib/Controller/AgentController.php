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
 * Proxy controller for OpenClaw Gateway API.
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
     * Build a user-scoped session identifier to prevent cross-user data leakage.
     */
    private function getScopedSessionId(): string {
        $user = $this->userSession->getUser();
        $uid = $user ? $user->getUID() : 'anonymous';
        // Check both conversation_id (new) and session_id (legacy) params
        $sessionId = $this->request->getParam('conversation_id')
            ?? $this->request->getParam('session_id', 'main');
        // Prevent double-prefixing: if the conversation_id already starts with
        // "uid:" (e.g. "admin:conv-123"), return it as-is instead of adding
        // another prefix which would create "admin:admin:conv-123".
        $prefix = $uid . ':';
        if (str_starts_with($sessionId, $prefix)) {
            return $sessionId;
        }
        return $prefix . $sessionId;
    }

    /**
     * Sanitize a client-supplied messages array: only allow 'user' and 'assistant'
     * roles and strip anything else (e.g. 'system') to prevent prompt injection.
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

    /**
     * @NoAdminRequired
     */
    public function health(): JSONResponse {
        return new JSONResponse($this->openClaw->get('/health'));
    }

    /**
     * @NoAdminRequired
     */
    public function healthDetail(): JSONResponse {
        return new JSONResponse($this->openClaw->get('/health/detail'));
    }

    /**
     * @NoAdminRequired
     *
     * Send a message to OpenClaw via OpenAI-compatible Chat Completions endpoint.
     */
    public function chat(): JSONResponse {
        $message = $this->request->getParam('message', '');
        $messages = $this->request->getParam('messages', null);
        $scopedId = $this->getScopedSessionId();

        // If a full messages array was provided, sanitize and forward for multi-turn context
        if (is_array($messages) && count($messages) > 0) {
            $chatMessages = $this->sanitizeMessages($messages);
        } else {
            $chatMessages = [
                ['role' => 'user', 'content' => $message],
            ];
        }

        // Backend uses /api/chat with SSE streaming; for non-SSE we still
        // call the same endpoint but return whatever we get as JSON.
        $result = $this->openClaw->post('/api/chat', [
            'messages' => $chatMessages,
            'conversation_id' => $scopedId,
        ]);

        // Extract the assistant response
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
     * Stream a message to OpenClaw via SSE Chat Completions (buffered fallback).
     */
    public function chatStream(): DataResponse {
        $message = $this->request->getParam('message', '');
        $messages = $this->request->getParam('messages', null);
        $scopedId = $this->getScopedSessionId();

        $chatMessages = (is_array($messages) && count($messages) > 0)
            ? $this->sanitizeMessages($messages)
            : [['role' => 'user', 'content' => $message]];

        $result = $this->openClaw->postStream('/api/chat', [
            'messages' => $chatMessages,
            'conversation_id' => $scopedId,
        ]);

        return new DataResponse(['response' => $result]);
    }

    /**
     * @NoAdminRequired
     *
     * True SSE passthrough — streams OpenClaw chunks to the client in real-time.
     * The widget uses this for live activity feed with word-by-word text reveal.
     */
    public function chatSSE(): void {
        $message = $this->request->getParam('message', '');
        $messages = $this->request->getParam('messages', null);
        $scopedId = $this->getScopedSessionId();

        $chatMessages = (is_array($messages) && count($messages) > 0)
            ? $this->sanitizeMessages($messages)
            : [['role' => 'user', 'content' => $message]];

        // Disable output buffering for real-time streaming
        while (ob_get_level()) {
            ob_end_clean();
        }

        // Release PHP session lock so other requests from this user are not blocked
        // during the streaming duration (up to 180s).
        session_write_close();

        header('Content-Type: text/event-stream');
        header('Cache-Control: no-cache');
        header('Connection: keep-alive');
        header('X-Accel-Buffering: no');

        $url = $this->openClaw->getBaseUrl() . '/api/chat';
        $token = $this->openClaw->getApiToken();

        $payload = json_encode([
            'messages' => $chatMessages,
            'conversation_id' => $scopedId,
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
     */
    public function getConversations(): JSONResponse {
        $user = $this->userSession->getUser();
        $uid = $user ? $user->getUID() : 'anonymous';
        // Use prefix filter to get all conversations for this user
        return new JSONResponse($this->openClaw->get('/api/conversations?prefix=' . urlencode($uid . ':')));
    }

    /**
     * @NoAdminRequired
     */
    public function getConversation(string $id): JSONResponse {
        return new JSONResponse($this->openClaw->get('/api/conversations/' . urlencode($id)));
    }

    /**
     * @NoAdminRequired
     */
    public function deleteConversation(string $id): JSONResponse {
        return new JSONResponse($this->openClaw->delete('/api/conversations/' . urlencode($id)));
    }

    /**
     * @NoAdminRequired
     */
    public function getSkills(): JSONResponse {
        return new JSONResponse($this->openClaw->get('/api/v1/skills'));
    }

    /**
     * @NoAdminRequired
     */
    public function getModels(): JSONResponse {
        return new JSONResponse($this->openClaw->get('/api/v1/models'));
    }

    /**
     * Admin only — returns OpenClaw config which may contain sensitive data.
     */
    public function getConfig(): JSONResponse {
        return new JSONResponse($this->openClaw->get('/api/v1/config'));
    }

    /**
     * Admin only — returns OpenClaw session data.
     */
    public function getSessions(): JSONResponse {
        return new JSONResponse($this->openClaw->get('/api/v1/sessions'));
    }
}
