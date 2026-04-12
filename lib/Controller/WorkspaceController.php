<?php

declare(strict_types=1);

namespace OCA\JadaAgent\Controller;

use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IConfig;
use OCP\IRequest;
use OCP\IUserSession;

/**
 * Controller for workspace CRUD and user profile endpoints.
 * Workspace data is stored per-user in Nextcloud app config.
 */
class WorkspaceController extends Controller {
    private IConfig $config;
    private IUserSession $userSession;

    /** Default workspaces — Nextcloud is always root */
    private const DEFAULT_WORKSPACES = [
        [
            'id' => 'nextcloud',
            'name' => 'Nextcloud',
            'color' => '#0082c9',
            'isRoot' => true,
            'description' => 'Your home workspace — general Nextcloud operations, file management, calendar, contacts, email, and system administration.',
            'tags' => ['files', 'calendar', 'contacts', 'admin'],
            'chatCount' => 0,
            'toolCalls' => 0,
            'lastActive' => null,
        ],
        [
            'id' => 'kuse',
            'name' => 'Kuse',
            'color' => '#e94560',
            'isRoot' => false,
            'description' => 'Kuse platform development — API integrations, MCP tool deployment, document management.',
            'tags' => ['api', 'mcp', 'webhooks'],
            'chatCount' => 0,
            'toolCalls' => 0,
            'lastActive' => null,
        ],
        [
            'id' => 'nomad-internet',
            'name' => 'Nomad Internet',
            'color' => '#008061',
            'isRoot' => false,
            'description' => 'Customer support, billing, FreeScout helpdesk management, and Verizon integration.',
            'tags' => ['support', 'billing', 'email'],
            'chatCount' => 0,
            'toolCalls' => 0,
            'lastActive' => null,
        ],
        [
            'id' => 'garza-os',
            'name' => 'GARZA OS',
            'color' => '#8b5cf6',
            'isRoot' => false,
            'description' => 'Infrastructure management — VPS, Docker containers, MCP servers, Railway deployments.',
            'tags' => ['infra', 'docker', 'mcp', 'vps'],
            'chatCount' => 0,
            'toolCalls' => 0,
            'lastActive' => null,
        ],
        [
            'id' => 'development',
            'name' => 'Development',
            'color' => '#22c55e',
            'isRoot' => false,
            'description' => 'General software development — code reviews, debugging, Paperclip, Sim Studio.',
            'tags' => ['code', 'review', 'deploy'],
            'chatCount' => 0,
            'toolCalls' => 0,
            'lastActive' => null,
        ],
        [
            'id' => 'finance',
            'name' => 'Finance',
            'color' => '#f59e0b',
            'isRoot' => false,
            'description' => 'Akaunting, Chargebee, invoicing, payment tracking, and financial reporting.',
            'tags' => ['invoices', 'payments'],
            'chatCount' => 0,
            'toolCalls' => 0,
            'lastActive' => null,
        ],
        [
            'id' => 'personal',
            'name' => 'Personal',
            'color' => '#ec4899',
            'isRoot' => false,
            'description' => 'Personal tasks, notes, and miscellaneous items.',
            'tags' => ['notes', 'tasks'],
            'chatCount' => 0,
            'toolCalls' => 0,
            'lastActive' => null,
        ],
    ];

    public function __construct(
        string $appName,
        IRequest $request,
        IConfig $config,
        IUserSession $userSession
    ) {
        parent::__construct($appName, $request);
        $this->config = $config;
        $this->userSession = $userSession;
    }

    private function getUserId(): string {
        $user = $this->userSession->getUser();
        return $user ? $user->getUID() : 'anonymous';
    }

    private function getWorkspacesForUser(): array {
        $uid = $this->getUserId();
        $raw = $this->config->getUserValue($uid, 'jadaagent', 'workspaces', '');
        if ($raw !== '') {
            $decoded = json_decode($raw, true);
            if (is_array($decoded) && count($decoded) > 0) {
                // Always ensure nextcloud root exists
                $hasRoot = false;
                foreach ($decoded as $ws) {
                    if (($ws['id'] ?? '') === 'nextcloud') {
                        $hasRoot = true;
                        break;
                    }
                }
                if (!$hasRoot) {
                    array_unshift($decoded, self::DEFAULT_WORKSPACES[0]);
                }
                return $decoded;
            }
        }
        return self::DEFAULT_WORKSPACES;
    }

    private function saveWorkspacesForUser(array $workspaces): void {
        $uid = $this->getUserId();
        $this->config->setUserValue($uid, 'jadaagent', 'workspaces', json_encode($workspaces));
    }

    /**
     * @NoAdminRequired
     */
    public function getWorkspaces(): JSONResponse {
        return new JSONResponse($this->getWorkspacesForUser());
    }

    /**
     * @NoAdminRequired
     */
    public function getWorkspace(string $id): JSONResponse {
        $workspaces = $this->getWorkspacesForUser();
        foreach ($workspaces as $ws) {
            if ($ws['id'] === $id) {
                return new JSONResponse($ws);
            }
        }
        return new JSONResponse(['error' => 'Workspace not found'], 404);
    }

    /**
     * @NoAdminRequired
     */
    public function createWorkspace(): JSONResponse {
        $workspaces = $this->getWorkspacesForUser();

        $id = $this->request->getParam('id', 'ws-' . time());
        $name = $this->request->getParam('name', '');
        if (!$name) {
            return new JSONResponse(['error' => 'Name is required'], 400);
        }

        $newWs = [
            'id' => $id,
            'name' => $name,
            'color' => $this->request->getParam('color', '#e94560'),
            'isRoot' => false,
            'description' => $this->request->getParam('description', ''),
            'tags' => $this->request->getParam('tags', []),
            'chatCount' => 0,
            'toolCalls' => 0,
            'lastActive' => null,
        ];

        $workspaces[] = $newWs;
        $this->saveWorkspacesForUser($workspaces);

        return new JSONResponse($newWs);
    }

    /**
     * @NoAdminRequired
     */
    public function updateWorkspace(string $id): JSONResponse {
        if ($id === 'nextcloud') {
            return new JSONResponse(['error' => 'Cannot modify root workspace'], 403);
        }

        $workspaces = $this->getWorkspacesForUser();
        $found = false;
        foreach ($workspaces as &$ws) {
            if ($ws['id'] === $id) {
                $name = $this->request->getParam('name', '');
                if ($name) $ws['name'] = $name;

                $color = $this->request->getParam('color', '');
                if ($color) $ws['color'] = $color;

                $description = $this->request->getParam('description', null);
                if ($description !== null) $ws['description'] = $description;

                $tags = $this->request->getParam('tags', null);
                if ($tags !== null) $ws['tags'] = $tags;

                $found = true;
                $result = $ws;
                break;
            }
        }
        unset($ws);

        if (!$found) {
            return new JSONResponse(['error' => 'Workspace not found'], 404);
        }

        $this->saveWorkspacesForUser($workspaces);
        return new JSONResponse($result);
    }

    /**
     * @NoAdminRequired
     */
    public function deleteWorkspace(string $id): JSONResponse {
        if ($id === 'nextcloud') {
            return new JSONResponse(['error' => 'Cannot delete root workspace'], 403);
        }

        $workspaces = $this->getWorkspacesForUser();
        $workspaces = array_values(array_filter($workspaces, fn($ws) => $ws['id'] !== $id));
        $this->saveWorkspacesForUser($workspaces);

        return new JSONResponse(['status' => 'ok']);
    }

    /**
     * @NoAdminRequired
     *
     * Returns the current user's profile information.
     */
    public function getProfile(): JSONResponse {
        $user = $this->userSession->getUser();
        if (!$user) {
            return new JSONResponse(['error' => 'Not authenticated'], 401);
        }

        return new JSONResponse([
            'uid' => $user->getUID(),
            'displayName' => $user->getDisplayName(),
            'email' => $user->getEMailAddress() ?? '',
            'lastLogin' => $user->getLastLogin(),
        ]);
    }
}
