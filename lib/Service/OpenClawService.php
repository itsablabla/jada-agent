<?php

declare(strict_types=1);

namespace OCA\JadaAgent\Service;

use OCP\IConfig;
use Psr\Log\LoggerInterface;

/**
 * HTTP client for communicating with the Hermes backend.
 *
 * This is a thin transport layer — all business logic lives in Hermes.
 * Extra headers (like X-Nextcloud-User) are forwarded to every request
 * so Hermes can scope operations to the authenticated user.
 */
class OpenClawService {
    private const DEFAULT_URL = 'http://localhost:18789';

    private IConfig $config;
    private LoggerInterface $logger;

    public function __construct(IConfig $config, LoggerInterface $logger) {
        $this->config = $config;
        $this->logger = $logger;
    }

    public function getBaseUrl(): string {
        return rtrim(
            $this->config->getAppValue('jadaagent', 'openclaw_url', self::DEFAULT_URL),
            '/'
        );
    }

    public function getApiToken(): string {
        return $this->config->getAppValue('jadaagent', 'openclaw_token', '');
    }

    /**
     * Make a GET request.
     */
    public function get(string $path, array $extraHeaders = []): array {
        return $this->request('GET', $path, null, $extraHeaders);
    }

    /**
     * Make a POST request.
     */
    public function post(string $path, array $data = [], array $extraHeaders = []): array {
        return $this->request('POST', $path, $data, $extraHeaders);
    }

    /**
     * Make a DELETE request.
     */
    public function delete(string $path, array $extraHeaders = []): array {
        return $this->request('DELETE', $path, null, $extraHeaders);
    }

    /**
     * Check if the backend is reachable and healthy.
     */
    public function isHealthy(): bool {
        try {
            $result = $this->get('/health');
            return ($result['ok'] ?? false) === true || ($result['status'] ?? '') === 'ok';
        } catch (\Exception $e) {
            return false;
        }
    }

    /**
     * Internal HTTP request method using curl.
     * Forwards auth token + any extra headers (e.g. user identity) to Hermes.
     */
    private function request(string $method, string $path, ?array $data = null, array $extraHeaders = []): array {
        $url = $this->getBaseUrl() . $path;
        $token = $this->getApiToken();

        $headers = array_filter([
            'Content-Type: application/json',
            'Accept: application/json',
            $token ? 'Authorization: Bearer ' . $token : null,
        ]);

        // Append extra headers (e.g. X-Nextcloud-User, X-Nextcloud-Name)
        foreach ($extraHeaders as $name => $value) {
            $headers[] = $name . ': ' . $value;
        }

        $ch = curl_init();
        $opts = [
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 0,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
            CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
        ];

        if ($method === 'POST') {
            $opts[CURLOPT_POST] = true;
            if ($data !== null) {
                $opts[CURLOPT_POSTFIELDS] = json_encode($data);
            }
        } elseif ($method === 'DELETE') {
            $opts[CURLOPT_CUSTOMREQUEST] = 'DELETE';
        }

        curl_setopt_array($ch, $opts);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($response === false) {
            $this->logger->error('Hermes request failed', [
                'url' => $url,
                'method' => $method,
                'error' => $error,
            ]);
            return ['error' => 'Connection failed: ' . $error, 'status' => 0];
        }

        $decoded = json_decode($response, true);
        if ($decoded === null && $httpCode >= 200 && $httpCode < 300) {
            return ['raw' => $response, 'status' => $httpCode];
        }

        if ($decoded === null) {
            return ['error' => 'Invalid response from Hermes', 'raw' => substr($response, 0, 500), 'status' => $httpCode];
        }

        if (is_array($decoded) && !array_is_list($decoded)) {
            $decoded['_http_status'] = $httpCode;
        }
        return is_array($decoded) ? $decoded : ['raw' => $decoded, 'status' => $httpCode];
    }
}
