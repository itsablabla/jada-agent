<?php

declare(strict_types=1);

namespace OCA\JadaAgent\Service;

use OCP\IConfig;
use Psr\Log\LoggerInterface;

/**
 * HTTP client for communicating with the OpenClaw Gateway API.
 */
class OpenClawService {
    private const DEFAULT_URL = 'http://localhost:18789';
    private const TIMEOUT = 120;

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
     * Make a GET request to OpenClaw.
     */
    public function get(string $path): array {
        return $this->request('GET', $path);
    }

    /**
     * Make a POST request to OpenClaw.
     */
    public function post(string $path, array $data = []): array {
        return $this->request('POST', $path, $data);
    }

    /**
     * Make a DELETE request to OpenClaw.
     */
    public function delete(string $path): array {
        return $this->request('DELETE', $path);
    }

    /**
     * Stream a POST request to OpenClaw (returns raw response body).
     */
    public function postStream(string $path, array $data = []): string {
        $url = $this->getBaseUrl() . $path;
        $token = $this->getApiToken();

        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($data),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 120,
            CURLOPT_HTTPHEADER => array_filter([
                'Content-Type: application/json',
                'Accept: text/event-stream',
                $token ? 'Authorization: Bearer ' . $token : null,
            ]),
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($response === false) {
            $this->logger->error('OpenClaw stream request failed: ' . $error);
            return json_encode(['error' => 'Connection failed: ' . $error]);
        }

        return $response ?: '';
    }

    /**
     * Check if OpenClaw is reachable and healthy.
     */
    public function isHealthy(): bool {
        try {
            $result = $this->get('/health');
            return ($result['ok'] ?? false) === true;
        } catch (\Exception $e) {
            return false;
        }
    }

    /**
     * Internal HTTP request method using curl.
     */
    private function request(string $method, string $path, ?array $data = null): array {
        $url = $this->getBaseUrl() . $path;
        $token = $this->getApiToken();

        $ch = curl_init();
        $headers = array_filter([
            'Content-Type: application/json',
            'Accept: application/json',
            $token ? 'Authorization: Bearer ' . $token : null,
        ]);

        $opts = [
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => self::TIMEOUT,
            CURLOPT_HTTPHEADER => $headers,
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
            $this->logger->error('OpenClaw request failed', [
                'url' => $url,
                'method' => $method,
                'error' => $error,
            ]);
            return ['error' => 'Connection failed: ' . $error, 'status' => 0];
        }

        $decoded = json_decode($response, true);
        if ($decoded === null && $httpCode >= 200 && $httpCode < 300) {
            // Non-JSON successful response
            return ['raw' => $response, 'status' => $httpCode];
        }

        if ($decoded === null) {
            return ['error' => 'Invalid response from OpenClaw', 'raw' => substr($response, 0, 500), 'status' => $httpCode];
        }

        if (is_array($decoded) && !array_is_list($decoded)) {
            $decoded['_http_status'] = $httpCode;
        }
        return $decoded;
    }
}
