<?php

declare(strict_types=1);

namespace OCA\JadaAgent\Controller;

use OCA\JadaAgent\Service\OpenClawService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;

/**
 * Proxy controller for OpenClaw Gateway API.
 */
class AgentController extends Controller {
    private OpenClawService $openClaw;

    public function __construct(
        string $appName,
        IRequest $request,
        OpenClawService $openClaw
    ) {
        parent::__construct($appName, $request);
        $this->openClaw = $openClaw;
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
        $sessionId = $this->request->getParam('session_id', 'main');

        // OpenClaw uses OpenAI-compatible /v1/chat/completions
        $result = $this->openClaw->post('/v1/chat/completions', [
            'model' => 'openclaw:main',
            'messages' => [
                ['role' => 'user', 'content' => $message],
            ],
            'user' => $sessionId,
        ]);

        // Extract the assistant response from OpenAI format
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

    /**
     * @NoAdminRequired
     *
     * Stream a message to OpenClaw via SSE Chat Completions (buffered fallback).
     */
    public function chatStream(): DataResponse {
        $message = $this->request->getParam('message', '');
        $sessionId = $this->request->getParam('session_id', 'main');

        $result = $this->openClaw->postStream('/v1/chat/completions', [
            'model' => 'openclaw:main',
            'stream' => true,
            'messages' => [
                ['role' => 'user', 'content' => $message],
            ],
            'user' => $sessionId,
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
        $sessionId = $this->request->getParam('session_id', 'main');

        // Disable output buffering for real-time streaming
        while (ob_get_level()) {
            ob_end_clean();
        }

        header('Content-Type: text/event-stream');
        header('Cache-Control: no-cache');
        header('Connection: keep-alive');
        header('X-Accel-Buffering: no');

        $url = $this->openClaw->getBaseUrl() . '/v1/chat/completions';
        $token = $this->openClaw->getApiToken();

        $payload = json_encode([
            'model' => 'openclaw:main',
            'stream' => true,
            'messages' => [
                ['role' => 'user', 'content' => $message],
            ],
            'user' => $sessionId,
        ]);

        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_RETURNTRANSFER => false,
            CURLOPT_TIMEOUT => 180,
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
        return new JSONResponse($this->openClaw->get('/api/v1/conversations'));
    }

    /**
     * @NoAdminRequired
     */
    public function getConversation(string $id): JSONResponse {
        return new JSONResponse($this->openClaw->get('/api/v1/conversations/' . urlencode($id)));
    }

    /**
     * @NoAdminRequired
     */
    public function deleteConversation(string $id): JSONResponse {
        return new JSONResponse($this->openClaw->delete('/api/v1/conversations/' . urlencode($id)));
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
