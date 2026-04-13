<?php

declare(strict_types=1);

namespace OCA\JadaAgent\Settings;

use OCP\AppFramework\Http\TemplateResponse;
use OCP\IConfig;
use OCP\Security\ICredentialsManager;
use OCP\Settings\ISettings;

class AdminSettings implements ISettings {
    private IConfig $config;
    private ICredentialsManager $credentials;

    public function __construct(IConfig $config, ICredentialsManager $credentials) {
        $this->config = $config;
        $this->credentials = $credentials;
    }

    public function getForm(): TemplateResponse {
        $params = [
            'openclaw_url' => $this->config->getAppValue('jadaagent', 'openclaw_url', 'http://LibreChat:3080'),
            'openclaw_token' => $this->config->getAppValue('jadaagent', 'openclaw_token', '') ? '••••••••' : '',
            'librechat_service_email' => $this->config->getAppValue('jadaagent', 'librechat_service_email', 'jada@nextcloud.local'),
            'librechat_service_password' => ($this->credentials->retrieve('', 'jadaagent/librechat_service_password') || $this->config->getAppValue('jadaagent', 'librechat_service_password', '')) ? '••••••••' : '',
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
