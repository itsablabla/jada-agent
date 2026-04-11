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
     * Admin only — read OpenClaw connection settings.
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
            // Validate URL: must be HTTP(S) and not point to private/metadata IPs
            if (!filter_var($url, FILTER_VALIDATE_URL) || !preg_match('#^https?://#i', $url)) {
                return new JSONResponse(['status' => 'error', 'message' => 'Invalid URL: must be a valid HTTP or HTTPS URL'], 400);
            }
            $host = parse_url($url, PHP_URL_HOST);
            if ($host) {
                $ip = gethostbyname($host);
                if ($ip && (
                    str_starts_with($ip, '169.254.') ||   // link-local / cloud metadata
                    str_starts_with($ip, '127.') ||        // loopback
                    str_starts_with($ip, '10.') ||         // RFC 1918 Class A
                    str_starts_with($ip, '192.168.') ||    // RFC 1918 Class C
                    preg_match('/^172\.(1[6-9]|2[0-9]|3[01])\./', $ip) || // RFC 1918 Class B
                    $ip === '0.0.0.0' ||
                    $ip === '::1'                          // IPv6 loopback
                )) {
                    return new JSONResponse(['status' => 'error', 'message' => 'Invalid URL: blocked destination'], 400);
                }
            }
            $this->config->setAppValue('jadaagent', 'openclaw_url', rtrim($url, '/'));
        }
        if ($token !== '' && $token !== '••••••••') {
            $this->config->setAppValue('jadaagent', 'openclaw_token', $token);
        } elseif ($token === '') {
            $this->config->deleteAppValue('jadaagent', 'openclaw_token');
        }

        return new JSONResponse(['status' => 'ok']);
    }
}
