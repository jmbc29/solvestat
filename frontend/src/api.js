import axios from 'axios'
import { auth } from './firebase'

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// Axios instance. A request interceptor attaches the current user's Firebase
// ID token (auto-refreshed by the SDK) as a bearer token when signed in.
const api = axios.create({ baseURL })

api.interceptors.request.use(async (config) => {
  const user = auth?.currentUser
  if (user) {
    try {
      const token = await user.getIdToken()
      config.headers.Authorization = `Bearer ${token}`
    } catch {
      // fall through unauthenticated
    }
  }
  return config
})

export default api

// ─── Cloud account + session helpers ─────────────────────────────────────────

export async function fetchConfig() {
  const { data } = await api.get('/config')
  return data
}

export async function fetchMe() {
  const { data } = await api.get('/me')
  return data
}

export async function saveWcaId(wcaId) {
  const { data } = await api.put('/me/wca-id', { wca_id: wcaId })
  return data
}

export async function saveHandle(handle, publicName) {
  const { data } = await api.put('/me/handle', { handle, public_name: publicName })
  return data
}

export async function setSessionVisibility(id, isPublic) {
  const { data } = await api.patch(`/sessions/${id}`, { is_public: isPublic })
  return data
}

export async function fetchPublicProfile(handle) {
  const { data } = await api.get(`/public/${encodeURIComponent(handle)}`)
  return data
}

export async function listSessions() {
  const { data } = await api.get('/sessions')
  return data
}

export async function saveSession({ name, solves, stats }) {
  const { data } = await api.post('/sessions', { name, solves, stats })
  return data
}

export async function renameSession(id, name) {
  const { data } = await api.patch(`/sessions/${id}`, { name })
  return data
}

export async function deleteSession(id) {
  const { data } = await api.delete(`/sessions/${id}`)
  return data
}
