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
     * Stream a message to OpenClaw via SSE Chat Completions.
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
     * @NoAdminRequired
     */
    public function getConfig(): JSONResponse {
        return new JSONResponse($this->openClaw->get('/api/v1/config'));
    }

    /**
     * @NoAdminRequired
     */
    public function getSessions(): JSONResponse {
        return new JSONResponse($this->openClaw->get('/api/v1/sessions'));
    }
}
