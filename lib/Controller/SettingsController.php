<?php

declare(strict_types=1);

namespace OCA\JadaAgent\Controller;

use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IConfig;
use OCP\IRequest;
use OCP\Security\ICredentialsManager;

class SettingsController extends Controller {
    private IConfig $config;
    private ICredentialsManager $credentials;

    public function __construct(
        string $appName,
        IRequest $request,
        IConfig $config,
        ICredentialsManager $credentials
    ) {
        parent::__construct($appName, $request);
        $this->config = $config;
        $this->credentials = $credentials;
    }

    /**
     * Admin only — read OpenClaw connection settings.
     */
    public function getSettings(): JSONResponse {
        return new JSONResponse([
            'openclaw_url' => $this->config->getAppValue('jadaagent', 'openclaw_url', 'http://LibreChat:3080'),
            'openclaw_token' => $this->config->getAppValue('jadaagent', 'openclaw_token', '') ? '••••••••' : '',
            'librechat_service_email' => $this->config->getAppValue('jadaagent', 'librechat_service_email', 'jada@nextcloud.local'),
            'librechat_service_password' => ($this->credentials->retrieve('', 'jadaagent/librechat_service_password') || $this->config->getAppValue('jadaagent', 'librechat_service_password', '')) ? '••••••••' : '',
        ]);
    }

    /**
     * Admin only — save OpenClaw connection settings.
     */
    public function saveSettings(): JSONResponse {
        $url = $this->request->getParam('openclaw_url', '');
        $token = $this->request->getParam('openclaw_token', '');

        if ($url) {
            // Validate URL: must be HTTP(S) and not point to private/metadata IPs
            if (!filter_var($url, FILTER_VALIDATE_URL) || !preg_match('#^https?://#i', $url)) {
                return new JSONResponse(['status' => 'error', 'message' => 'Invalid URL: must be a valid HTTP or HTTPS URL'], 400);
            }
            $host = parse_url($url, PHP_URL_HOST);
            if ($host) {
                // Strip brackets from IPv6 literals (e.g. [::1] → ::1)
                $bareHost = trim($host, '[]');

                // Block cloud metadata endpoints (IPv4 link-local + AWS/GCP/Azure metadata)
                $ip = gethostbyname($bareHost);
                $ipv6Addrs = array_column(@dns_get_record($bareHost, DNS_AAAA) ?: [], 'ipv6');
                $allIps = array_filter(array_merge([$ip], $ipv6Addrs));

                foreach ($allIps as $checkIp) {
                    if (
                        str_starts_with($checkIp, '169.254.') ||   // link-local / cloud metadata
                        $checkIp === '0.0.0.0' ||
                        str_starts_with($checkIp, 'fe80:')         // IPv6 link-local
                    ) {
                        return new JSONResponse(['status' => 'error', 'message' => 'Invalid URL: blocked destination (cloud metadata)'], 400);
                    }
                }
            }
            $this->config->setAppValue('jadaagent', 'openclaw_url', rtrim($url, '/'));
        }
        if ($token !== '' && $token !== '••••••••') {
            $this->config->setAppValue('jadaagent', 'openclaw_token', $token);
        } elseif ($token === '') {
            $this->config->deleteAppValue('jadaagent', 'openclaw_token');
        }

        // LibreChat service account credentials
        $serviceEmail = $this->request->getParam('librechat_service_email', '');
        $servicePassword = $this->request->getParam('librechat_service_password', '');

        if ($serviceEmail !== '' && $serviceEmail !== '••••••••') {
            $this->config->setAppValue('jadaagent', 'librechat_service_email', $serviceEmail);
        }
        if ($servicePassword !== '' && $servicePassword !== '••••••••') {
            // Store securely via ICredentialsManager (encrypted at rest)
            $this->credentials->store('', 'jadaagent/librechat_service_password', $servicePassword);
            // Remove any legacy plaintext copy
            $this->config->deleteAppValue('jadaagent', 'librechat_service_password');
            // Clear cached JWT so next request re-authenticates with new credentials
            $this->config->deleteAppValue('jadaagent', 'librechat_jwt');
            $this->config->deleteAppValue('jadaagent', 'librechat_jwt_at');
        }

        return new JSONResponse(['status' => 'ok']);
    }
}
