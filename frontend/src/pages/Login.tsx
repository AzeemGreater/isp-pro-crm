import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Globe, Lock, User, Eye, EyeOff, Loader } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import api from '../lib/api'
import { getStoredBranding, loadCurrentBranding } from '../lib/branding'

export function LoginPage() {
  const { login }     = useAuth()
  const navigate      = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [branding, setBranding] = useState(() => getStoredBranding())

  useEffect(() => {
    loadCurrentBranding().then((data) => {
      if (data) setBranding(data)
    }).catch(() => undefined)
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const res = await api.post<{ token: string; admin: { id: string; username: string; fullName: string; role: string; walletBalance: number; permissions: Record<string, boolean> } }>('/auth/login', { username, password })
      login(res.data.token, res.data.admin)
      const landing = res.data.admin.role === 'Agent' ? '/subdealer/dashboard' : '/'
      navigate(landing, { replace: true })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg || 'Invalid username or password')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent-cyan/5 rounded-full blur-3xl animate-pulse-slow pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent-violet/5 rounded-full blur-3xl animate-pulse-slow pointer-events-none" style={{ animationDelay: '1s' }} />

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-cyan flex items-center justify-center mx-auto mb-4 shadow-glow-cyan">
            <Globe size={30} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary">{branding?.app_name || 'ISP CRM Pro'}</h1>
          <p className="text-sm text-text-muted mt-1">{branding?.app_tagline || 'Network Command Center'}</p>
        </div>

        {/* Login card */}
        <div className="card p-6 space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Welcome back</h2>
            <p className="text-xs text-text-muted mt-0.5">Sign in to your admin account</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="input-label" htmlFor="login-username">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={15} />
                <input id="login-username" type="text" value={username} onChange={e => setUsername(e.target.value)}
                  className="input pl-9" placeholder="superadmin" autoComplete="username" required />
              </div>
            </div>

            <div>
              <label className="input-label" htmlFor="login-password">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={15} />
                <input id="login-password" type={showPass ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)} className="input pl-9 pr-9"
                  placeholder="••••••••" autoComplete="current-password" required />
                <button type="button" onClick={() => setShowPass(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors">
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {error && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="text-xs text-status-expired bg-status-expired/10 border border-status-expired/20 rounded-lg px-3 py-2">
                {error}
              </motion.p>
            )}

            <button type="submit" id="login-submit" disabled={loading || !username || !password} className="btn-primary w-full justify-center h-10">
              {loading ? <Loader size={16} className="animate-spin" /> : 'Sign In'}
            </button>
          </form>

          <div className="border-t border-border pt-3">
            <p className="text-xs text-text-muted text-center">
              Default credentials: <span className="font-mono text-accent-cyan">superadmin</span> / <span className="font-mono text-accent-cyan">Admin@12345</span>
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-text-muted mt-4">
          {(branding?.app_name || 'ISP CRM Pro')} v1.0 · Secured with JWT + AES-256
        </p>
      </motion.div>
    </div>
  )
}
