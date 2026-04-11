<template>
	<div class="jada-schedules">
		<div class="jada-schedules-header">
			<h1>Schedules</h1>
			<button class="jada-btn jada-btn-primary" @click="showCreate = !showCreate">
				{{ showCreate ? 'Cancel' : '+ New Schedule' }}
			</button>
		</div>

		<div v-if="showCreate" class="jada-create-schedule">
			<div class="jada-form-group">
				<label>Name</label>
				<input v-model="newSchedule.name" placeholder="e.g. Daily health check" />
			</div>
			<div class="jada-form-group">
				<label>Message / Task</label>
				<textarea v-model="newSchedule.message" placeholder="What should the agent do?" rows="3"></textarea>
			</div>
			<div class="jada-form-group">
				<label>Cron Expression</label>
				<input v-model="newSchedule.cron" placeholder="0 9 * * * (daily at 9am)" />
				<span class="jada-form-hint">Standard cron format: minute hour day month weekday</span>
			</div>
			<div class="jada-form-actions">
				<button class="jada-btn jada-btn-primary" @click="createSchedule" :disabled="!newSchedule.name || !newSchedule.message">
					Create Schedule
				</button>
			</div>
		</div>

		<div class="jada-schedules-list">
			<div v-for="schedule in schedules" :key="schedule.id" class="jada-schedule-card">
				<div class="jada-schedule-icon">&#9202;</div>
				<div class="jada-schedule-info">
					<div class="jada-schedule-name">{{ schedule.name }}</div>
					<div class="jada-schedule-details">
						<span class="jada-schedule-cron">{{ schedule.cron }}</span>
						<span class="jada-schedule-sep">&middot;</span>
						<span class="jada-schedule-message">{{ schedule.message }}</span>
					</div>
					<div class="jada-schedule-meta" v-if="schedule.lastRun">
						Last run: {{ schedule.lastRun }}
					</div>
				</div>
				<div :class="['jada-schedule-status', schedule.enabled ? 'active' : 'paused']">
					{{ schedule.enabled ? 'Active' : 'Paused' }}
				</div>
			</div>

			<div v-if="schedules.length === 0" class="jada-empty-state">
				<div class="jada-empty-icon">&#9202;</div>
				<h3>No schedules yet</h3>
				<p>Create a schedule to have your agent run tasks automatically on a recurring basis.</p>
				<p class="jada-hint">Schedules use OpenClaw's built-in cron system. You can also configure them via the OpenClaw Control UI or CLI.</p>
			</div>
		</div>
	</div>
</template>

<script>
export default {
	name: 'SchedulesView',
	data() {
		return {
			schedules: [],
			showCreate: false,
			newSchedule: {
				name: '',
				message: '',
				cron: '0 9 * * *',
			},
		}
	},
	methods: {
		async createSchedule() {
			// For now, add locally — OpenClaw cron config requires CLI/config file changes
			this.schedules.push({
				id: Date.now(),
				name: this.newSchedule.name,
				message: this.newSchedule.message,
				cron: this.newSchedule.cron,
				enabled: true,
				lastRun: null,
			})
			this.newSchedule = { name: '', message: '', cron: '0 9 * * *' }
			this.showCreate = false
		},
	},
}
</script>

<style scoped>
.jada-schedules {
	padding: 32px;
	max-width: 1200px;
}

.jada-schedules-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 28px;
}

.jada-schedules-header h1 {
	font-size: 28px;
	font-weight: 700;
}

.jada-create-schedule {
	background: var(--color-background-dark);
	border: 1px solid var(--color-border);
	border-radius: 14px;
	padding: 24px;
	margin-bottom: 24px;
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

.jada-form-group input,
.jada-form-group textarea {
	width: 100%;
	padding: 10px 14px;
	border: 1px solid var(--color-border);
	border-radius: 10px;
	background: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 14px;
	box-sizing: border-box;
}

.jada-form-group textarea {
	resize: vertical;
}

.jada-form-group input:focus,
.jada-form-group textarea:focus {
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
	justify-content: flex-end;
}

.jada-schedules-list {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.jada-schedule-card {
	display: flex;
	align-items: center;
	gap: 14px;
	padding: 16px 20px;
	background: var(--color-background-dark);
	border: 1px solid var(--color-border);
	border-radius: 12px;
	transition: all 0.2s;
}

.jada-schedule-card:hover {
	border-color: rgba(233, 69, 96, 0.3);
}

.jada-schedule-icon {
	width: 40px;
	height: 40px;
	border-radius: 10px;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 20px;
	background: rgba(233, 69, 96, 0.1);
	flex-shrink: 0;
}

.jada-schedule-info {
	flex: 1;
	min-width: 0;
}

.jada-schedule-name {
	font-size: 15px;
	font-weight: 600;
	color: var(--color-main-text);
	margin-bottom: 2px;
}

.jada-schedule-details {
	font-size: 13px;
	color: var(--color-text-maxcontrast);
	display: flex;
	align-items: center;
	gap: 6px;
}

.jada-schedule-cron {
	font-family: monospace;
	background: rgba(233, 69, 96, 0.08);
	padding: 2px 6px;
	border-radius: 4px;
	font-size: 12px;
}

.jada-schedule-message {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.jada-schedule-meta {
	font-size: 12px;
	color: var(--color-text-maxcontrast);
	margin-top: 4px;
}

.jada-schedule-status {
	padding: 4px 12px;
	border-radius: 20px;
	font-size: 12px;
	font-weight: 600;
	flex-shrink: 0;
}

.jada-schedule-status.active {
	background: rgba(74, 222, 128, 0.15);
	color: #4ade80;
}

.jada-schedule-status.paused {
	background: rgba(251, 191, 36, 0.15);
	color: #fbbf24;
}

.jada-empty-state {
	padding: 48px 32px;
	text-align: center;
	background: var(--color-background-dark);
	border: 1px dashed var(--color-border);
	border-radius: 14px;
}

.jada-empty-icon {
	font-size: 48px;
	margin-bottom: 16px;
	opacity: 0.5;
}

.jada-empty-state h3 {
	font-size: 18px;
	font-weight: 600;
	color: var(--color-main-text);
	margin-bottom: 8px;
}

.jada-empty-state p {
	font-size: 14px;
	color: var(--color-text-maxcontrast);
	max-width: 400px;
	margin: 0 auto 8px;
}

.jada-hint {
	font-size: 12px !important;
	font-style: italic;
}

.jada-btn {
	padding: 10px 20px;
	border-radius: 10px;
	border: none;
	font-size: 14px;
	font-weight: 600;
	cursor: pointer;
	transition: all 0.2s;
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
</style>
