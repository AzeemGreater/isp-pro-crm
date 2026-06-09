import axios from 'axios'
import toast from 'react-hot-toast'

const TOAST_DEDUPE_MS = 5000
const toastSeenAt = new Map<string, number>()

function showApiErrorToast(message: string) {
  const now = Date.now()
  const key = message.trim().toLowerCase()
  const last = toastSeenAt.get(key) || 0
  if (now - last < TOAST_DEDUPE_MS) return
  toastSeenAt.set(key, now)
  toast.error(message)
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 15000,
})

// Attach JWT to all requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('crm_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Handle 401 → redirect to login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('crm_token')
      localStorage.removeItem('crm_admin')
      window.location.href = '/login'
    } else {
      const status = err.response?.status
      const endpoint = err.config?.url || 'request'
      const serverMsg = err.response?.data?.error

      // Mock traffic is optional telemetry fallback; suppress user-facing noise.
      if (endpoint.includes('/nas/mock-traffic')) {
        return Promise.reject(err)
      }

      let msg = serverMsg || err.message || 'An unexpected error occurred'

      // Replace noisy generic Axios message with endpoint-specific context.
      if (!serverMsg && status === 500) {
        msg = `Server error (500) on ${endpoint}`
      }

      showApiErrorToast(msg)
    }
    return Promise.reject(err)
  }
)

export default api
