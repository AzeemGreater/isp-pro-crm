import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Settings2, Server, Wifi, Bell, Shield, Save, CheckCircle, Loader2 } from 'lucide-react'
import api from '../lib/api'
import { ThemeMode, applyTheme, getStoredThemeMode, setThemeMode } from '../lib/theme'
import { applyBranding } from '../lib/branding'

interface SystemSettings {
  mikrotik: { default_port: number; use_tls: boolean; available_ports: number[] }
  radius:   { auth_port: number; acct_port: number }
  whatsapp: { provider: string; safe_mode_default_min: number; safe_mode_default_max: number }
  system:   { jwt_expires: string; timezone: string }
  branding?: BrandingSetting[]
}

interface BrandingSetting {
  role: string
  role_label?: string
  app_name: string
  app_tagline: string
  logo_text: string
  primary_color: string
  accent_color: string
}

export function Settings() {
  const [settings, setSettings] = useState<SystemSettings | null>(null)
  const [mikrotikPort, setMikrotikPort] = useState(8729)
  const [useTLS, setUseTLS] = useState(true)
  const [safeModeMin, setSafeModeMin] = useState(10)
  const [safeModeMax, setSafeModeMax] = useState(20)
  const [jwtExpires, setJwtExpires] = useState('8h')
  const [timezone, setTimezone] = useState('Asia/Karachi')
  const [saved, setSaved] = useState(false)
  const [themeMode, setLocalThemeMode] = useState<ThemeMode>('system')
  const [brandingRole, setBrandingRole] = useState('Agent')
  const [currentRole, setCurrentRole] = useState('Agent')
  const [saving, setSaving] = useState(false)
  const [brandingForm, setBrandingForm] = useState<BrandingSetting>({
    role: 'Agent',
    role_label: 'Subdealer',
    app_name: 'ISP CRM Pro',
    app_tagline: 'Network Command Center',
    logo_text: 'ISP',
    primary_color: '#4285F4',
    accent_color: '#34A853',
  })

  useEffect(() => {
    const adminRaw = localStorage.getItem('crm_admin')
    let preferredRole = 'Agent'
    if (adminRaw) {
      try {
        const admin = JSON.parse(adminRaw) as { role?: string }
        if (admin?.role) {
          preferredRole = admin.role
          setCurrentRole(admin.role)
        }
      } catch {
        // ignore malformed local storage
      }
    }

    const initialMode = getStoredThemeMode()
    setLocalThemeMode(initialMode)
    applyTheme(initialMode)

    api.get<SystemSettings>('/agents/settings').then(res => {
      setSettings(res.data)
      setMikrotikPort(res.data.mikrotik.default_port)
      setUseTLS(res.data.mikrotik.use_tls)
      setSafeModeMin(res.data.whatsapp.safe_mode_default_min)
      setSafeModeMax(res.data.whatsapp.safe_mode_default_max)
      setJwtExpires(res.data.system.jwt_expires)
      setTimezone(res.data.system.timezone)
      const initialBrand = res.data.branding?.find((b) => b.role === preferredRole)
        || res.data.branding?.find((b) => b.role === 'Agent')
        || res.data.branding?.[0]
      if (initialBrand) {
        setBrandingRole(initialBrand.role)
        setBrandingForm(initialBrand)
      }
    }).catch(() => {})
  }, [])

  function onBrandRoleChange(role: string) {
    setBrandingRole(role)
    const target = settings?.branding?.find((b) => b.role === role)
    if (target) setBrandingForm(target)
  }

  function handleThemeChange(mode: ThemeMode) {
    setLocalThemeMode(mode)
    setThemeMode(mode)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const isPrivileged = currentRole === 'SuperAdmin' || currentRole === 'Admin'

      if (isPrivileged) {
        await api.put('/agents/settings', {
          mikrotik: {
            default_port: mikrotikPort,
            use_tls: useTLS,
          },
          whatsapp: {
            safe_mode_default_min: safeModeMin,
            safe_mode_default_max: safeModeMax,
          },
          system: {
            jwt_expires: jwtExpires,
            timezone,
          },
        })
      }

      await api.put(`/agents/settings/branding/${brandingRole}`, {
        app_name: brandingForm.app_name,
        app_tagline: brandingForm.app_tagline,
        logo_text: brandingForm.logo_text,
        primary_color: brandingForm.primary_color,
        accent_color: brandingForm.accent_color,
      })

      if (brandingRole === currentRole) {
        applyBranding(brandingForm)
      }

      const refreshed = await api.get<SystemSettings>('/agents/settings')
      setSettings(refreshed.data)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      // error toast handled by interceptor
    } finally {
      setSaving(false)
    }
  }

  const isPrivileged = currentRole === 'SuperAdmin' || currentRole === 'Admin'
  const visibleBranding = (settings?.branding || []).filter((b) => isPrivileged || b.role === currentRole)

  const Section = ({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) => (
    <div className="card p-5 space-y-4">
      <div className="flex items-center gap-2 pb-3 border-b border-border">
        <Icon size={18} className="text-accent-cyan"/>
        <h3 className="font-semibold text-text-primary">{title}</h3>
      </div>
      {children}
    </div>
  )

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">System Settings</h1>
        <p className="text-sm text-text-muted">Configure network ports, integrations, and system behavior</p>
      </div>

      <Section title="MikroTik API" icon={Server}>
        <div className="space-y-3">
          <div>
            <label className="input-label">API Port</label>
            <div className="flex gap-2">
              {settings?.mikrotik.available_ports.map(p => (
                <button key={p} onClick={() => setMikrotikPort(p)} disabled={!isPrivileged}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${mikrotikPort === p ? 'bg-accent-cyan/10 border-accent-cyan text-accent-cyan' : 'border-border text-text-muted hover:border-text-muted'}`}>
                  {p} {p === 8729 ? '(TLS)' : '(Plain)'}
                </button>
              ))}
            </div>
            <p className="text-xs text-text-muted mt-1.5">Port 8728 = unencrypted, Port 8729 = TLS encrypted (recommended)</p>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-text-primary">Use TLS Encryption</p>
              <p className="text-xs text-text-muted">Secure connection to MikroTik RouterOS API</p>
            </div>
            <button onClick={() => setUseTLS(t => !t)} disabled={!isPrivileged} className={`relative w-12 h-6 rounded-full transition-colors ${useTLS ? 'bg-status-active' : 'bg-border'}`}>
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform shadow ${useTLS ? 'translate-x-7' : 'translate-x-1'}`}/>
            </button>
          </div>
          {!isPrivileged && <p className="text-xs text-text-muted">Only Admin and SuperAdmin can change MikroTik connection settings.</p>}
        </div>
      </Section>

      <Section title="FreeRADIUS Ports" icon={Wifi}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="input-label">Auth Port (UDP)</label>
            <input className="input" value={settings?.radius.auth_port ?? 1812} readOnly />
            <p className="text-xs text-text-muted mt-1">Standard RADIUS auth port</p>
          </div>
          <div>
            <label className="input-label">Accounting Port (UDP)</label>
            <input className="input" value={settings?.radius.acct_port ?? 1813} readOnly />
            <p className="text-xs text-text-muted mt-1">Standard RADIUS acct port</p>
          </div>
        </div>
        <p className="text-xs text-status-warning flex items-center gap-1.5">
          <Shield size={12}/> RADIUS ports are configured in docker-compose.yml and UFW firewall
        </p>
      </Section>

      <Section title="WhatsApp (Baileys)" icon={Bell}>
        <div className="space-y-3">
          <div className="bg-bg-base rounded-lg px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-text-primary">Provider</p>
              <p className="text-xs text-text-muted">Open-source Baileys library (QR scan)</p>
            </div>
            <span className="badge badge-active">Baileys</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="input-label">Safe Mode Min Delay (sec)</label>
              <input type="number" className="input" value={safeModeMin} onChange={(e) => setSafeModeMin(Number(e.target.value || 0))} disabled={!isPrivileged} />
            </div>
            <div>
              <label className="input-label">Safe Mode Max Delay (sec)</label>
              <input type="number" className="input" value={safeModeMax} onChange={(e) => setSafeModeMax(Number(e.target.value || 0))} disabled={!isPrivileged} />
            </div>
          </div>
          {!isPrivileged && <p className="text-xs text-text-muted">Only Admin and SuperAdmin can change WhatsApp system delays.</p>}
        </div>
      </Section>

      <Section title="System" icon={Settings2}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="input-label">Session Timeout</label>
            <input className="input" value={jwtExpires} onChange={(e) => setJwtExpires(e.target.value)} disabled={!isPrivileged} />
          </div>
          <div>
            <label className="input-label">Timezone</label>
            <select className="select" value={timezone} onChange={(e) => setTimezone(e.target.value)} disabled={!isPrivileged}>
              <option value="Asia/Karachi">Asia/Karachi (PKT +05:00)</option>
              <option value="UTC">UTC</option>
              <option value="Asia/Dubai">Asia/Dubai (+04:00)</option>
            </select>
          </div>
        </div>
        {!isPrivileged && <p className="text-xs text-text-muted">Only Admin and SuperAdmin can change system runtime settings.</p>}

        <div className="pt-2">
          <label className="input-label">Appearance</label>
          <div className="grid grid-cols-3 gap-2">
            {(['light', 'dark', 'system'] as ThemeMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => handleThemeChange(mode)}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${themeMode === mode
                  ? 'bg-accent-cyan/10 border-accent-cyan text-accent-cyan'
                  : 'border-border text-text-secondary hover:bg-bg-hover'}`}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
          <p className="text-xs text-text-muted mt-1.5">
            Brand palette applied: Blue #4285F4, Red #EA4335, Yellow #FBBC05, Green #34A853.
          </p>
        </div>

        <div className="pt-2 border-t border-border">
          <label className="input-label">Role Branding</label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="input-label">Role</label>
              <select className="select" value={brandingRole} onChange={(e) => onBrandRoleChange(e.target.value)}>
                {visibleBranding.map((b) => (
                  <option key={b.role} value={b.role}>{b.role_label || b.role}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="input-label">App Name</label>
              <input className="input" value={brandingForm.app_name} onChange={(e) => setBrandingForm({ ...brandingForm, app_name: e.target.value })} />
            </div>
            <div>
              <label className="input-label">Tagline</label>
              <input className="input" value={brandingForm.app_tagline} onChange={(e) => setBrandingForm({ ...brandingForm, app_tagline: e.target.value })} />
            </div>
            <div>
              <label className="input-label">Logo Text</label>
              <input className="input" value={brandingForm.logo_text} onChange={(e) => setBrandingForm({ ...brandingForm, logo_text: e.target.value })} />
            </div>
            <div>
              <label className="input-label">Primary Color</label>
              <input className="input" value={brandingForm.primary_color} onChange={(e) => setBrandingForm({ ...brandingForm, primary_color: e.target.value })} />
            </div>
            <div>
              <label className="input-label">Accent Color</label>
              <input className="input" value={brandingForm.accent_color} onChange={(e) => setBrandingForm({ ...brandingForm, accent_color: e.target.value })} />
            </div>
          </div>
        </div>
      </Section>

      {/* Save button */}
      <motion.button onClick={handleSave} className="btn-primary w-full justify-center" disabled={saving}
        whileTap={{ scale: 0.98 }}>
        {saved ? <><CheckCircle size={16}/> Saved!</> : <>{saving ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>} Save Settings</>}
      </motion.button>
    </div>
  )
}
