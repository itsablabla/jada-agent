import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'

const baseUrl = generateUrl('/apps/jadaagent')

export default {
    async getHealth() {
        const res = await axios.get(`${baseUrl}/api/health`)
        return res.data
    },

    async getHealthDetail() {
        const res = await axios.get(`${baseUrl}/api/health/detail`)
        return res.data
    },

    async sendMessage(message, sessionId = 'main') {
        const res = await axios.post(`${baseUrl}/api/chat`, { message, session_id: sessionId })
        return res.data
    },

    async getConversations() {
        const res = await axios.get(`${baseUrl}/api/conversations`)
        return res.data
    },

    async getConversation(id) {
        const res = await axios.get(`${baseUrl}/api/conversations/${encodeURIComponent(id)}`)
        return res.data
    },

    async deleteConversation(id) {
        const res = await axios.delete(`${baseUrl}/api/conversations/${encodeURIComponent(id)}`)
        return res.data
    },

    async getSkills() {
        const res = await axios.get(`${baseUrl}/api/skills`)
        return res.data
    },

    async getModels() {
        const res = await axios.get(`${baseUrl}/api/models`)
        return res.data
    },

    async getSessions() {
        const res = await axios.get(`${baseUrl}/api/sessions`)
        return res.data
    },

    async getSettings() {
        const res = await axios.get(`${baseUrl}/api/settings`)
        return res.data
    },

    async saveSettings(settings) {
        const res = await axios.put(`${baseUrl}/api/settings`, settings)
        return res.data
    },
}
