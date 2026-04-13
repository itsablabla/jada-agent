<?php

declare(strict_types=1);

namespace OCA\JadaAgent\Service;

use OCP\IConfig;
use Psr\Log\LoggerInterface;

/**
 * HTTP client for communicating with the LibreChat backend.
 *
 * Supports two auth modes:
 * - API key (Bearer token) for the Agents API (/api/agents/v1/*)
 * - JWT (session token) for internal APIs (/api/convos, /api/messages, etc.)
 *
 * JWT tokens are obtained via /api/auth/login and cached in Nextcloud's
 * app config with a TTL. They auto-refresh when expired.
 */
class OpenClawService {
    private const DEFAULT_URL = 'http://LibreChat:3080';
    private const DEFAULT_API_PATH = '/api/agents/v1';
    private const JWT_TTL_SECONDS = 840; // 14 minutes (JWT expires in 15)
    private const DEFAULT_SERVICE_EMAIL = 'jada@nextcloud.local';

    private IConfig $config;
    private LoggerInterface $logger;
    private ?string $jwtCache = null;

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
     * Get the LibreChat OpenAI-compatible API base path.
     */
    public function getApiPath(): string {
        return self::DEFAULT_API_PATH;
    }

    /**
     * Get a valid JWT token for LibreChat's internal APIs.
     * Caches the token in Nextcloud app config with TTL.
     */
    public function getJwtToken(): string {
        // Check in-memory cache first
        if ($this->jwtCache !== null) {
            return $this->jwtCache;
        }

        // Check persisted cache
        $cached = $this->config->getAppValue('jadaagent', 'librechat_jwt', '');
        $cachedAt = (int) $this->config->getAppValue('jadaagent', 'librechat_jwt_at', '0');
        if ($cached !== '' && (time() - $cachedAt) < self::JWT_TTL_SECONDS) {
            $this->jwtCache = $cached;
            return $cached;
        }

        // Login to get fresh token
        $token = $this->loginForJwt();
        if ($token !== '') {
            $this->jwtCache = $token;
            $this->config->setAppValue('jadaagent', 'librechat_jwt', $token);
            $this->config->setAppValue('jadaagent', 'librechat_jwt_at', (string) time());
        }

        return $token;
    }

    /**
     * Make a GET request using API key auth.
     */
    public function get(string $path, array $extraHeaders = []): array {
        return $this->request('GET', $path, null, $extraHeaders);
    }

    /**
     * Make a POST request using API key auth.
     */
    public function post(string $path, array $data = [], array $extraHeaders = []): array {
        return $this->request('POST', $path, $data, $extraHeaders);
    }

    /**
     * Make a DELETE request using API key auth.
     */
    public function delete(string $path, array $extraHeaders = []): array {
        return $this->request('DELETE', $path, null, $extraHeaders);
    }

    /**
     * Make a GET request using JWT auth (for internal LibreChat APIs).
     */
    public function jwtGet(string $path, array $extraHeaders = []): array {
        return $this->request('GET', $path, null, $extraHeaders, true);
    }

    /**
     * Make a POST request using JWT auth.
     */
    public function jwtPost(string $path, array $data = [], array $extraHeaders = []): array {
        return $this->request('POST', $path, $data, $extraHeaders, true);
    }

    /**
     * Make a DELETE request using JWT auth.
     */
    public function jwtDelete(string $path, array $extraHeaders = []): array {
        return $this->request('DELETE', $path, null, $extraHeaders, true);
    }

    /**
     * Make a PUT request using JWT auth.
     */
    public function jwtPut(string $path, array $data = [], array $extraHeaders = []): array {
        return $this->request('PUT', $path, $data, $extraHeaders, true);
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
     * Login to LibreChat and obtain a JWT token.
     * Credentials are read from Nextcloud app config (set via admin settings).
     */
    private function loginForJwt(): string {
        $email = $this->config->getAppValue('jadaagent', 'librechat_service_email', self::DEFAULT_SERVICE_EMAIL);
        $password = $this->config->getAppValue('jadaagent', 'librechat_service_password', '');
        if ($password === '') {
            $this->logger->error('LibreChat service password not configured — set it in Jada Agent admin settings');
            return '';
        }

        $url = $this->getBaseUrl() . '/api/auth/login';
        $payload = json_encode([
            'email' => $email,
            'password' => $password,
        ]);

        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Accept: application/json',
            ],
            CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($response === false || $httpCode !== 200) {
            $this->logger->error('LibreChat JWT login failed', [
                'httpCode' => $httpCode,
                'response' => substr((string) $response, 0, 200),
            ]);
            return '';
        }

        $decoded = json_decode($response, true);
        return $decoded['token'] ?? '';
    }

    /**
     * Internal HTTP request method using curl.
     *
     * @param bool $useJwt If true, use JWT auth instead of API key auth.
     */
    private function request(string $method, string $path, ?array $data = null, array $extraHeaders = [], bool $useJwt = false): array {
        $url = $this->getBaseUrl() . $path;
        $token = $useJwt ? $this->getJwtToken() : $this->getApiToken();

        $headers = array_filter([
            'Content-Type: application/json',
            'Accept: application/json',
            $token ? 'Authorization: Bearer ' . $token : null,
        ]);

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
        } elseif ($method === 'PUT') {
            $opts[CURLOPT_CUSTOMREQUEST] = 'PUT';
            if ($data !== null) {
                $opts[CURLOPT_POSTFIELDS] = json_encode($data);
            }
        }

        curl_setopt_array($ch, $opts);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($response === false) {
            $this->logger->error('LibreChat request failed', [
                'url' => $url,
                'method' => $method,
                'error' => $error,
            ]);
            return ['error' => 'Connection failed: ' . $error, 'status' => 0];
        }

        // Handle 401 with JWT — token may have expired, clear cache and retry once
        if ($httpCode === 401 && $useJwt) {
            $this->jwtCache = null;
            $this->config->deleteAppValue('jadaagent', 'librechat_jwt');
            $this->config->deleteAppValue('jadaagent', 'librechat_jwt_at');
            // Retry with fresh JWT (getJwtToken() will re-login)
            $freshToken = $this->getJwtToken();
            if ($freshToken === '') {
                return ['error' => 'JWT re-authentication failed', 'status' => 401];
            }
            // One-shot retry — don't recurse to avoid infinite loop
            $authIndex = array_search('Authorization: Bearer ' . $token, $headers);
            if ($authIndex !== false) {
                $headers[$authIndex] = 'Authorization: Bearer ' . $freshToken;
            } else {
                $headers[] = 'Authorization: Bearer ' . $freshToken;
            }
            $ch2 = curl_init();
            $opts[CURLOPT_HTTPHEADER] = $headers;
            curl_setopt_array($ch2, $opts);
            $response = curl_exec($ch2);
            $httpCode = curl_getinfo($ch2, CURLINFO_HTTP_CODE);
            curl_close($ch2);
            if ($response === false) {
                return ['error' => 'JWT retry request failed', 'status' => 0];
            }
            $decoded = json_decode($response, true);
            if ($decoded === null) {
                return ['error' => 'JWT retry failed', 'status' => $httpCode];
            }
            if (is_array($decoded) && !array_is_list($decoded)) {
                $decoded['_http_status'] = $httpCode;
            }
            return is_array($decoded) ? $decoded : ['raw' => $decoded, 'status' => $httpCode];
        }

        $decoded = json_decode($response, true);
        if ($decoded === null && $httpCode >= 200 && $httpCode < 300) {
            return ['raw' => $response, 'status' => $httpCode];
        }

        if ($decoded === null) {
            return ['error' => 'Invalid response from backend', 'raw' => substr($response, 0, 500), 'status' => $httpCode];
        }

        if (is_array($decoded) && !array_is_list($decoded)) {
            $decoded['_http_status'] = $httpCode;
        }
        return is_array($decoded) ? $decoded : ['raw' => $decoded, 'status' => $httpCode];
    }
}
