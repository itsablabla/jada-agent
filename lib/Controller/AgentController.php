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
 * Thin proxy controller for LibreChat backend.
 *
 * Uses two auth modes:
 * - API key auth for Agents API (chat completions, models)
 * - JWT auth for internal APIs (conversations, messages, search, tags, etc.)
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

    private function getUserHeaders(): array {
        $user = $this->userSession->getUser();
        $uid = $user ? $user->getUID() : 'anonymous';
        $name = $user ? ($user->getDisplayName() ?: $uid) : 'Anonymous';
        return [
            'X-Nextcloud-User' => $uid,
            'X-Nextcloud-Name' => $name,
        ];
    }

    // ─── Health ──────────────────────────────────────────────────────────

    /**
     * @NoAdminRequired
     */
    public function health(): JSONResponse {
        $apiPath = $this->openClaw->getApiPath();
        $result = $this->openClaw->get($apiPath . '/models', $this->getUserHeaders());
        $models = $result['data'] ?? [];
        $isOk = !isset($result['error']) && count($models) > 0;

        $agentName = $models[0]['name'] ?? 'Jada';
        $provider = $models[0]['provider'] ?? 'Gemini';

        $mcpServers = [
            'nextcloud' => ['tools' => 118, 'status' => 'connected'],
        ];

        return new JSONResponse([
            'ok' => $isOk,
            'status' => $isOk ? 'ok' : 'error',
            'engine' => 'librechat',
            'model_name' => $provider . ' (via LibreChat)',
            'models' => count($models),
            'servers' => $mcpServers,
            'tool_count' => 118,
        ]);
    }

    /** @NoAdminRequired */
    public function healthDetail(): JSONResponse {
        return $this->health();
    }

    // ─── Chat ────────────────────────────────────────────────────────────

    /** @NoAdminRequired */
    public function chat(): JSONResponse {
        $message = $this->request->getParam('message', '');
        $messages = $this->request->getParam('messages', null);

        $chatMessages = (is_array($messages) && count($messages) > 0)
            ? $this->sanitizeMessages($messages)
            : [['role' => 'user', 'content' => $message]];

        $apiPath = $this->openClaw->getApiPath();
        $result = $this->openClaw->post($apiPath . '/chat/completions', [
            'model' => 'agent_jada_nextcloud',
            'messages' => $chatMessages,
            'stream' => false,
        ], $this->getUserHeaders());

        $response = '';
        if (isset($result['choices'][0]['message']['content'])) {
            $response = $result['choices'][0]['message']['content'];
        } elseif (isset($result['error'])) {
            $response = 'Error: ' . ($result['error']['message'] ?? json_encode($result['error']));
        }

        return new JSONResponse([
            'response' => $response,
            'model' => $result['model'] ?? '',
            'usage' => $result['usage'] ?? null,
        ]);
    }

    /** @NoAdminRequired */
    public function chatSSE(): void {
        $message = $this->request->getParam('message', '');
        $messages = $this->request->getParam('messages', null);
        $conversationId = $this->request->getParam('conversationId', null);

        $chatMessages = (is_array($messages) && count($messages) > 0)
            ? $this->sanitizeMessages($messages)
            : [['role' => 'user', 'content' => $message]];

        while (ob_get_level()) {
            ob_end_clean();
        }
        session_write_close();

        header('Content-Type: text/event-stream');
        header('Cache-Control: no-cache');
        header('Connection: keep-alive');
        header('X-Accel-Buffering: no');

        $apiPath = $this->openClaw->getApiPath();
        $url = $this->openClaw->getBaseUrl() . $apiPath . '/chat/completions';
        $token = $this->openClaw->getApiToken();
        $userHeaders = $this->getUserHeaders();

        $payloadData = [
            'model' => 'agent_jada_nextcloud',
            'messages' => $chatMessages,
            'stream' => true,
        ];
        if ($conversationId !== null) {
            $payloadData['conversationId'] = $conversationId;
        }
        $payload = json_encode($payloadData);

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

    // ─── Conversations (LibreChat /api/convos) ───────────────────────────

    /** @NoAdminRequired */
    public function getConversations(): JSONResponse {
        $limit = (int) $this->request->getParam('limit', '25');
        $cursor = $this->request->getParam('cursor', '');
        $isArchived = $this->request->getParam('isArchived', '');
        $tags = $this->request->getParam('tags', '');
        $search = $this->request->getParam('search', '');
        $sortBy = $this->request->getParam('sortBy', 'updatedAt');
        $sortDirection = $this->request->getParam('sortDirection', 'desc');

        $params = http_build_query(array_filter([
            'limit' => $limit,
            'cursor' => $cursor,
            'isArchived' => $isArchived,
            'tags' => $tags,
            'search' => $search,
            'sortBy' => $sortBy,
            'sortDirection' => $sortDirection,
        ], fn($v) => $v !== '' && $v !== 0));

        $result = $this->openClaw->jwtGet('/api/convos?' . $params);
        return new JSONResponse($result);
    }

    /** @NoAdminRequired */
    public function getConversation(string $id): JSONResponse {
        $result = $this->openClaw->jwtGet('/api/convos/' . urlencode($id));
        return new JSONResponse($result);
    }

    /** @NoAdminRequired */
    public function deleteConversation(string $id): JSONResponse {
        $result = $this->openClaw->jwtPost('/api/convos/clear', [
            'arg' => ['conversationId' => $id],
        ]);
        return new JSONResponse($result);
    }

    /** @NoAdminRequired */
    public function updateConversation(): JSONResponse {
        $conversationId = $this->request->getParam('conversationId', '');
        $title = $this->request->getParam('title', '');
        $result = $this->openClaw->jwtPost('/api/convos/update', [
            'arg' => ['conversationId' => $conversationId, 'title' => $title],
        ]);
        return new JSONResponse($result);
    }

    /** @NoAdminRequired */
    public function archiveConversation(): JSONResponse {
        $conversationId = $this->request->getParam('conversationId', '');
        $isArchived = $this->request->getParam('isArchived', true);
        $result = $this->openClaw->jwtPost('/api/convos/archive', [
            'arg' => ['conversationId' => $conversationId, 'isArchived' => $isArchived],
        ]);
        return new JSONResponse($result);
    }

    /** @NoAdminRequired */
    public function genTitle(string $id): JSONResponse {
        $result = $this->openClaw->jwtGet('/api/convos/gen_title/' . urlencode($id));
        return new JSONResponse($result);
    }

    // ─── Messages (LibreChat /api/messages) ──────────────────────────────

    /** @NoAdminRequired */
    public function getMessages(): JSONResponse {
        $conversationId = $this->request->getParam('conversationId', '');
        $search = $this->request->getParam('search', '');
        $cursor = $this->request->getParam('cursor', '');
        $pageSize = $this->request->getParam('pageSize', '25');
        $sortBy = $this->request->getParam('sortBy', 'createdAt');
        $sortDirection = $this->request->getParam('sortDirection', 'asc');

        $params = http_build_query(array_filter([
            'conversationId' => $conversationId,
            'search' => $search,
            'cursor' => $cursor,
            'pageSize' => $pageSize,
            'sortBy' => $sortBy,
            'sortDirection' => $sortDirection,
        ], fn($v) => $v !== ''));

        $result = $this->openClaw->jwtGet('/api/messages?' . $params);
        return new JSONResponse($result);
    }

    /** @NoAdminRequired */
    public function getConversationMessages(string $id): JSONResponse {
        $result = $this->openClaw->jwtGet('/api/messages/' . urlencode($id));
        return new JSONResponse($result);
    }

    // ─── Search (via /api/messages?search=) ──────────────────────────────

    /** @NoAdminRequired */
    public function searchMessages(): JSONResponse {
        $query = $this->request->getParam('q', '');
        $cursor = $this->request->getParam('cursor', '');
        $pageSize = $this->request->getParam('pageSize', '25');

        $params = http_build_query(array_filter([
            'search' => $query,
            'cursor' => $cursor,
            'pageSize' => $pageSize,
        ], fn($v) => $v !== ''));

        $result = $this->openClaw->jwtGet('/api/messages?' . $params);
        return new JSONResponse($result);
    }

    // ─── Tags (LibreChat /api/tags) ──────────────────────────────────────

    /** @NoAdminRequired */
    public function getTags(): JSONResponse {
        $result = $this->openClaw->jwtGet('/api/tags');
        return new JSONResponse($result);
    }

    /** @NoAdminRequired */
    public function addTag(): JSONResponse {
        $conversationId = $this->request->getParam('conversationId', '');
        $tag = $this->request->getParam('tag', '');
        $result = $this->openClaw->jwtPost('/api/tags', [
            'conversationId' => $conversationId,
            'tag' => $tag,
        ]);
        return new JSONResponse($result);
    }

    /** @NoAdminRequired */
    public function removeTag(): JSONResponse {
        $conversationId = $this->request->getParam('conversationId', '');
        $tag = $this->request->getParam('tag', '');
        $result = $this->openClaw->jwtDelete('/api/tags?' . http_build_query([
            'conversationId' => $conversationId,
            'tag' => $tag,
        ]));
        return new JSONResponse($result);
    }

    // ─── Sharing (LibreChat /api/share) ──────────────────────────────────

    /** @NoAdminRequired */
    public function getSharedLinks(): JSONResponse {
        $result = $this->openClaw->jwtGet('/api/share');
        return new JSONResponse($result);
    }

    /** @NoAdminRequired */
    public function createShareLink(): JSONResponse {
        $conversationId = $this->request->getParam('conversationId', '');
        $result = $this->openClaw->jwtPost('/api/share', [
            'conversationId' => $conversationId,
        ]);
        return new JSONResponse($result);
    }

    /** @NoAdminRequired */
    public function deleteShareLink(string $id): JSONResponse {
        $result = $this->openClaw->jwtDelete('/api/share/' . urlencode($id));
        return new JSONResponse($result);
    }

    // ─── Memories (LibreChat /api/memories) ──────────────────────────────

    /** @NoAdminRequired */
    public function getMemories(): JSONResponse {
        $result = $this->openClaw->jwtGet('/api/memories');
        return new JSONResponse($result);
    }

    /** @NoAdminRequired */
    public function deleteMemory(string $id): JSONResponse {
        $result = $this->openClaw->jwtDelete('/api/memories/' . urlencode($id));
        return new JSONResponse($result);
    }

    // ─── Presets (LibreChat /api/presets) ─────────────────────────────────

    /** @NoAdminRequired */
    public function getPresets(): JSONResponse {
        $result = $this->openClaw->jwtGet('/api/presets');
        return new JSONResponse($result);
    }

    /** @NoAdminRequired */
    public function createPreset(): JSONResponse {
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $result = $this->openClaw->jwtPost('/api/presets', $data);
        return new JSONResponse($result);
    }

    /** @NoAdminRequired */
    public function deletePreset(string $id): JSONResponse {
        $result = $this->openClaw->jwtPost('/api/presets/delete', [
            'arg' => ['_id' => $id],
        ]);
        return new JSONResponse($result);
    }

    // ─── Models & Skills ─────────────────────────────────────────────────

    /** @NoAdminRequired */
    public function getModels(): JSONResponse {
        $apiPath = $this->openClaw->getApiPath();
        return new JSONResponse($this->openClaw->get($apiPath . '/models', $this->getUserHeaders()));
    }

    /** @NoAdminRequired */
    public function getSkills(): JSONResponse {
        return new JSONResponse(['skills' => []]);
    }

    /** Admin only */
    public function getConfig(): JSONResponse {
        return new JSONResponse(['engine' => 'librechat', 'message' => 'Configuration managed via LibreChat admin UI']);
    }

    /** Admin only */
    public function getSessions(): JSONResponse {
        return new JSONResponse(['sessions' => []]);
    }

    /** @NoAdminRequired */
    public function reconnect(): JSONResponse {
        return new JSONResponse(['status' => 'ok']);
    }

    // ─── Tool Calls (from conversation messages) ─────────────────────────

    /** @NoAdminRequired */
    public function getConversationToolCalls(string $id): JSONResponse {
        // Tool calls are embedded in messages — extract them
        $messages = $this->openClaw->jwtGet('/api/messages/' . urlencode($id));
        $toolCalls = [];
        if (is_array($messages)) {
            foreach ($messages as $msg) {
                if (!is_array($msg)) continue;
                $content = $msg['content'] ?? [];
                if (is_array($content)) {
                    foreach ($content as $part) {
                        if (is_array($part) && ($part['type'] ?? '') === 'tool_call') {
                            $toolCalls[] = [
                                'name' => $part['name'] ?? 'unknown',
                                'status' => ($part['error'] ?? false) ? 'error' : 'success',
                                'timestamp' => $msg['createdAt'] ?? null,
                            ];
                        }
                    }
                }
            }
        }
        return new JSONResponse(['toolCalls' => $toolCalls]);
    }

    /** @NoAdminRequired */
    public function getRecentToolCalls(): JSONResponse {
        return new JSONResponse(['toolCalls' => []]);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────

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
