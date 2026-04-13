/**
 * Jada Agent — Admin Settings Script
 * Handles saving OpenClaw URL and API token from Nextcloud admin settings page.
 */
document.addEventListener('DOMContentLoaded', () => {
	const saveBtn = document.getElementById('save-openclaw-settings')
	const msgEl = document.getElementById('openclaw-settings-msg')
	const urlInput = document.getElementById('openclaw-url')
	const tokenInput = document.getElementById('openclaw-token')
	const serviceEmailInput = document.getElementById('librechat-service-email')
	const servicePasswordInput = document.getElementById('librechat-service-password')

	if (!saveBtn) return

	saveBtn.addEventListener('click', async () => {
		saveBtn.disabled = true
		msgEl.textContent = 'Saving…'
		msgEl.style.color = ''

		try {
			const response = await fetch(
				OC.generateUrl('/apps/jadaagent/api/settings'),
				{
					method: 'PUT',
					headers: {
						'Content-Type': 'application/json',
						requesttoken: OC.requestToken,
					},
					body: JSON.stringify({
						openclaw_url: urlInput.value.trim(),
						openclaw_token: tokenInput.value.trim(),
						librechat_service_email: serviceEmailInput.value.trim(),
						librechat_service_password: servicePasswordInput.value.trim(),
					}),
				},
			)

			if (response.ok) {
				msgEl.textContent = 'Saved'
				msgEl.style.color = '#2d8644'
			} else {
				const data = await response.json().catch(() => ({}))
				msgEl.textContent = 'Error: ' + (data.message || response.statusText)
				msgEl.style.color = '#c9302c'
			}
		} catch (err) {
			msgEl.textContent = 'Error: ' + err.message
			msgEl.style.color = '#c9302c'
		} finally {
			saveBtn.disabled = false
		}
	})
})
