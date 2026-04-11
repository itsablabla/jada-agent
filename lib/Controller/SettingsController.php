<?php

declare(strict_types=1);

namespace OCA\JadaAgent\Controller;

use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IConfig;
use OCP\IRequest;

class SettingsController extends Controller {
    private IConfig $config;

    public function __construct(
        string $appName,
        IRequest $request,
        IConfig $config
    ) {
        parent::__construct($appName, $request);
        $this->config = $config;
    }

    /**
     * @NoAdminRequired
     */
    public function getSettings(): JSONResponse {
        return new JSONResponse([
            'openclaw_url' => $this->config->getAppValue('jadaagent', 'openclaw_url', 'http://localhost:18789'),
            'openclaw_token' => $this->config->getAppValue('jadaagent', 'openclaw_token', '') ? '••••••••' : '',
        ]);
    }

    /**
     * Admin only — save OpenClaw connection settings.
     */
    public function saveSettings(): JSONResponse {
        $url = $this->request->getParam('openclaw_url', '');
        $token = $this->request->getParam('openclaw_token', '');

        if ($url) {
            $this->config->setAppValue('jadaagent', 'openclaw_url', rtrim($url, '/'));
        }
        if ($token && $token !== '••••••••') {
            $this->config->setAppValue('jadaagent', 'openclaw_token', $token);
        }

        return new JSONResponse(['status' => 'ok']);
    }
}
