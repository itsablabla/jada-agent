<?php

declare(strict_types=1);

namespace OCA\JadaAgent\Settings;

use OCP\AppFramework\Http\TemplateResponse;
use OCP\IConfig;
use OCP\Settings\ISettings;

class AdminSettings implements ISettings {
    private IConfig $config;

    public function __construct(IConfig $config) {
        $this->config = $config;
    }

    public function getForm(): TemplateResponse {
        $params = [
            'openclaw_url' => $this->config->getAppValue('jadaagent', 'openclaw_url', 'http://LibreChat:3080'),
            'openclaw_token' => $this->config->getAppValue('jadaagent', 'openclaw_token', '') ? '••••••••' : '',
            'librechat_service_email' => $this->config->getAppValue('jadaagent', 'librechat_service_email', 'jada@nextcloud.local'),
            'librechat_service_password' => $this->config->getAppValue('jadaagent', 'librechat_service_password', '') ? '••••••••' : '',
        ];
        return new TemplateResponse('jadaagent', 'admin', $params);
    }

    public function getSection(): string {
        return 'jadaagent';
    }

    public function getPriority(): int {
        return 50;
    }
}
