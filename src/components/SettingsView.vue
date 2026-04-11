<template>
	<div class="jada-settings">
		<div class="jada-settings-header">
			<h1>Settings</h1>
		</div>

		<div class="jada-section">
			<h2>OpenClaw Connection</h2>
			<p class="jada-hint">Configure how Jada Agent connects to your OpenClaw instance.</p>

			<div class="jada-form-group">
				<label>OpenClaw Gateway URL</label>
				<input v-model="settings.openclaw_url" placeholder="http://localhost:18789" />
				<span class="jada-form-hint">The HTTP endpoint of your OpenClaw gateway</span>
			</div>

			<div class="jada-form-group">
				<label>API Token</label>
				<input v-model="settings.openclaw_token" type="password" placeholder="Your gateway auth token" />
				<span class="jada-form-hint">Set via gateway.auth.token in openclaw.json</span>
			</div>

			<div class="jada-form-actions">
				<button class="jada-btn jada-btn-primary" @click="saveSettings" :disabled="saving">
					{{ saving ? 'Saving...' : 'Save Settings' }}
				</button>
				<button class="jada-btn jada-btn-secondary" @click="testConnection" :disabled="testing">
					{{ testing ? 'Testing...' : 'Test Connection' }}
				</button>
				<span v-if="statusMsg" :class="['jada-status-msg', statusOk ? 'success' : 'error']">
					{{ statusMsg }}
				</span>
			</div>
		</div>

		<div class="jada-section">
			<h2>OpenClaw Control UI</h2>
			<p class="jada-hint">For advanced configuration, use the OpenClaw Control UI directly.</p>
			<a :href="settings.openclaw_url || 'http://localhost:18789'" target="_blank" rel="noopener" class="jada-btn jada-btn-secondary">
				Open Control UI &rarr;
			</a>
		</div>

		<div class="jada-section">
			<h2>About</h2>
			<div class="jada-about">
				<div class="jada-about-row">
					<span class="jada-about-label">App Version</span>
					<span class="jada-about-value">0.1.0</span>
				</div>
				<div class="jada-about-row">
					<span class="jada-about-label">OpenClaw</span>
					<span class="jada-about-value">
						<a href="https://openclaw.ai" target="_blank" rel="noopener">openclaw.ai</a>
					</span>
				</div>
				<div class="jada-about-row">
					<span class="jada-about-label">Documentation</span>
					<span class="jada-about-value">
						<a href="https://docs.openclaw.ai" target="_blank" rel="noopener">docs.openclaw.ai</a>
					</span>
				</div>
			</div>
		</div>
	</div>
</template>

<script>
import api from '../api.js'

export default {
	name: 'SettingsView',
	data() {
		return {
			settings: {
				openclaw_url: 'http://localhost:18789',
				openclaw_token: '',
			},
			saving: false,
			testing: false,
			statusMsg: '',
			statusOk: false,
		}
	},
	async mounted() {
		try {
			const s = await api.getSettings()
			this.settings = { ...this.settings, ...s }
		} catch { /* ignore */ }
	},
	methods: {
		async saveSettings() {
			this.saving = true
			this.statusMsg = ''
			try {
				await api.saveSettings(this.settings)
				this.statusMsg = 'Settings saved'
				this.statusOk = true
			} catch (err) {
				this.statusMsg = 'Failed to save: ' + (err.message || 'Unknown error')
				this.statusOk = false
			} finally {
				this.saving = false
			}
		},
		async testConnection() {
			this.testing = true
			this.statusMsg = ''
			try {
				const result = await api.getHealth()
				if (result?.ok) {
					this.statusMsg = 'Connection successful — agent is online'
					this.statusOk = true
				} else {
					this.statusMsg = 'Agent responded but status is not OK'
					this.statusOk = false
				}
			} catch (err) {
				this.statusMsg = 'Connection failed: ' + (err.message || 'Cannot reach OpenClaw')
				this.statusOk = false
			} finally {
				this.testing = false
			}
		},
	},
}
</script>

<style scoped>
.jada-settings {
	padding: 32px;
	max-width: 800px;
}

.jada-settings-header {
	margin-bottom: 28px;
}

.jada-settings-header h1 {
	font-size: 28px;
	font-weight: 700;
}

.jada-section {
	margin-bottom: 36px;
	padding-bottom: 28px;
	border-bottom: 1px solid var(--color-border);
}

.jada-section:last-child {
	border-bottom: none;
}

.jada-section h2 {
	font-size: 18px;
	font-weight: 600;
	margin-bottom: 4px;
}

.jada-hint {
	font-size: 13px;
	color: var(--color-text-maxcontrast);
	margin-bottom: 20px;
}

.jada-form-group {
	margin-bottom: 16px;
}

.jada-form-group label {
	display: block;
	font-size: 13px;
	font-weight: 600;
	color: var(--color-main-text);
	margin-bottom: 6px;
}

.jada-form-group input {
	width: 100%;
	padding: 10px 14px;
	border: 1px solid var(--color-border);
	border-radius: 10px;
	background: var(--color-background-dark);
	color: var(--color-main-text);
	font-size: 14px;
	box-sizing: border-box;
}

.jada-form-group input:focus {
	outline: none;
	border-color: #e94560;
	box-shadow: 0 0 0 2px rgba(233, 69, 96, 0.15);
}

.jada-form-hint {
	font-size: 12px;
	color: var(--color-text-maxcontrast);
	margin-top: 4px;
	display: block;
}

.jada-form-actions {
	display: flex;
	align-items: center;
	gap: 12px;
	margin-top: 20px;
}

.jada-status-msg {
	font-size: 13px;
	font-weight: 600;
}

.jada-status-msg.success {
	color: #4ade80;
}

.jada-status-msg.error {
	color: #f87171;
}

.jada-about {
	background: var(--color-background-dark);
	border: 1px solid var(--color-border);
	border-radius: 14px;
	overflow: hidden;
}

.jada-about-row {
	display: flex;
	padding: 12px 16px;
	border-bottom: 1px solid var(--color-border);
}

.jada-about-row:last-child {
	border-bottom: none;
}

.jada-about-label {
	flex: 0 0 160px;
	font-size: 13px;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.jada-about-value {
	font-size: 13px;
	color: var(--color-main-text);
}

.jada-about-value a {
	color: #e94560;
	text-decoration: none;
}

.jada-about-value a:hover {
	text-decoration: underline;
}

.jada-btn {
	padding: 10px 20px;
	border-radius: 10px;
	border: none;
	font-size: 14px;
	font-weight: 600;
	cursor: pointer;
	transition: all 0.2s;
	text-decoration: none;
	display: inline-block;
}

.jada-btn-primary {
	background: linear-gradient(135deg, #e94560, #c23152);
	color: #fff;
}

.jada-btn-primary:hover:not(:disabled) {
	box-shadow: 0 4px 16px rgba(233, 69, 96, 0.4);
}

.jada-btn-primary:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.jada-btn-secondary {
	background: var(--color-background-dark);
	color: var(--color-main-text);
	border: 1px solid var(--color-border);
}

.jada-btn-secondary:hover {
	background: var(--color-background-hover);
}
</style>
