import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Settings2, Server, Wifi, Bell, Shield, Save, CheckCircle, Loader2, Palette } from 'lucide-react'
import api from '../lib/api'
import { ThemeMode, applyTheme, getStoredThemeMode, setThemeMode } from '../lib/theme'
import { applyBranding } from '../lib/branding'

const PRESETS = {
  vanilla: {
    bgColor: '#ffffff',
    textColor: '#000000',
    accentColor: '#000000',
    borderRadius: 0,
    fontFamily: 'system-ui, -apple-system, sans-serif'
  },
  flat: {
    bgColor: '#f3f4f6',
    textColor: '#1f2937',
    accentColor: '#4f46e5',
    borderRadius: 4,
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif"
  },
  tailwind: {
    bgColor: '#f9fafb',
    textColor: '#111827',
    accentColor: '#2563eb',
    borderRadius: 12,
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif"
  },
  dark: {
    bgColor: '#000000',
    textColor: '#f3f4f6',
    accentColor: '#10b981',
    borderRadius: 16,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
  }
}

function hexToRgb(hex: string): string {
  const cleaned = hex.replace('#', '').trim()
  const r = parseInt(cleaned.substring(0, 2), 16)
  const g = parseInt(cleaned.substring(2, 4), 16)
  const b = parseInt(cleaned.substring(4, 6), 16)
  return `${r} ${g} ${b}`
}

function getSurface(bgHex: string): string {
  const cleaned = bgHex.replace('#', '').trim()
  const r = parseInt(cleaned.substring(0, 2), 16)
  const g = parseInt(cleaned.substring(2, 4), 16)
  const b = parseInt(cleaned.substring(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  if (luminance < 0.3) {
    const mixR = Math.min(255, Math.round(r + (255 - r) * 0.08))
    const mixG = Math.min(255, Math.round(g + (255 - g) * 0.08))
    const mixB = Math.min(255, Math.round(b + (255 - b) * 0.08))
    return `${mixR} ${mixG} ${mixB}`
  }
  return '255 255 255'
}

function applyCustomUiConfig(config: {
  bgColor: string
  textColor: string
  accentColor: string
  borderRadius: number
  fontFamily: string
}) {
  const root = document.documentElement
  root.style.setProperty('--bg-base', hexToRgb(config.bgColor))
  root.style.setProperty('--bg-surface', getSurface(config.bgColor))
  root.style.setProperty('--bg-card', getSurface(config.bgColor))
  
  const textRgb = hexToRgb(config.textColor)
  root.style.setProperty('--text-primary', textRgb)
  root.style.setProperty('--text-secondary', textRgb)
  root.style.setProperty('--text-muted', textRgb)
  
  const accentRgb = hexToRgb(config.accentColor)
  root.style.setProperty('--accent-cyan', accentRgb)
  root.style.setProperty('--brand-blue', accentRgb)
  
  root.style.setProperty('--border-radius-override', config.borderRadius + 'px')
  root.style.setProperty('--font-family-override', config.fontFamily)

  localStorage.setItem('custom-ui-config', JSON.stringify(config))
}

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

const Section = ({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) => (
  <div className="card p-5 space-y-4">
    <div className="flex items-center gap-2 pb-3 border-b border-border">
      <Icon size={18} className="text-accent-cyan"/>
      <h3 className="font-semibold text-text-primary">{title}</h3>
    </div>
    {children}
  </div>
)

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
  const [customTheme, setCustomTheme] = useState({
    preset: 'tailwind',
    bgColor: '#f9fafb',
    textColor: '#111827',
    accentColor: '#2563eb',
    borderRadius: 12,
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif"
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

    try {
      const savedConfig = localStorage.getItem('custom-ui-config')
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig)
        let matchedPreset = 'custom'
        for (const [key, preset] of Object.entries(PRESETS)) {
          if (preset.bgColor === parsed.bgColor &&
              preset.textColor === parsed.textColor &&
              preset.accentColor === parsed.accentColor &&
              preset.borderRadius === parsed.borderRadius &&
              preset.fontFamily === parsed.fontFamily) {
            matchedPreset = key
            break
          }
        }
        setCustomTheme({
          preset: matchedPreset,
          ...parsed
        })
      } else {
        applyCustomUiConfig(PRESETS.tailwind)
      }
    } catch (e) {}

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

  function handleConfigChange(key: string, value: any) {
    const updated = {
      ...customTheme,
      [key]: value,
      preset: 'custom'
    }
    setCustomTheme(updated)
    applyCustomUiConfig(updated)
  }

  function handlePresetChange(presetKey: string) {
    if (presetKey === 'custom') {
      setCustomTheme(prev => ({ ...prev, preset: 'custom' }))
      return
    }
    const preset = PRESETS[presetKey as keyof typeof PRESETS]
    if (preset) {
      const updated = {
        preset: presetKey,
        ...preset
      }
      setCustomTheme(updated)
      applyCustomUiConfig(updated)
    }
  }

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

      <Section title="UI Theme Customization" icon={Palette}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div>
                <label className="input-label">Theme Preset</label>
                <select 
                  className="select" 
                  value={customTheme.preset} 
                  onChange={(e) => handlePresetChange(e.target.value)}
                >
                  <option value="custom">Custom (Fine-tuned)</option>
                  <option value="vanilla">The Vanilla Minimalist</option>
                  <option value="flat">Flat Vector 2.0</option>
                  <option value="tailwind">Tailwind Skeleton</option>
                  <option value="dark">Edge-First Dark Mode</option>
                </select>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="input-label">Background</label>
                  <input 
                    type="color" 
                    className="w-full h-10 border border-border rounded-lg cursor-pointer p-0 bg-transparent" 
                    value={customTheme.bgColor} 
                    onChange={(e) => handleConfigChange('bgColor', e.target.value)}
                  />
                </div>
                <div>
                  <label className="input-label">Text Color</label>
                  <input 
                    type="color" 
                    className="w-full h-10 border border-border rounded-lg cursor-pointer p-0 bg-transparent" 
                    value={customTheme.textColor} 
                    onChange={(e) => handleConfigChange('textColor', e.target.value)}
                  />
                </div>
                <div>
                  <label className="input-label">Accent / Button</label>
                  <input 
                    type="color" 
                    className="w-full h-10 border border-border rounded-lg cursor-pointer p-0 bg-transparent" 
                    value={customTheme.accentColor} 
                    onChange={(e) => handleConfigChange('accentColor', e.target.value)}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="input-label mb-0">Border Radius</label>
                  <span className="text-xs text-text-muted">{customTheme.borderRadius}px</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="24" 
                  className="w-full accent-accent-cyan cursor-pointer" 
                  value={customTheme.borderRadius} 
                  onChange={(e) => handleConfigChange('borderRadius', Number(e.target.value))}
                />
              </div>

              <div>
                <label className="input-label">Font Style</label>
                <select 
                  className="select" 
                  value={customTheme.fontFamily} 
                  onChange={(e) => handleConfigChange('fontFamily', e.target.value)}
                >
                  <option value="system-ui, -apple-system, sans-serif">System Sans</option>
                  <option value="Georgia, Cambria, 'Times New Roman', Times, serif">Serif</option>
                  <option value="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace">Monospace</option>
                  <option value="'Inter', system-ui, -apple-system, sans-serif">Modern Inter</option>
                </select>
              </div>
            </div>

            <div className="border border-border rounded-xl p-4 flex flex-col justify-between" style={{
              backgroundColor: customTheme.bgColor,
              color: customTheme.textColor,
              borderRadius: `${customTheme.borderRadius}px`,
              fontFamily: customTheme.fontFamily
            }}>
              <div>
                <h4 className="font-bold text-sm mb-2" style={{ color: customTheme.textColor }}>Live Preview Card</h4>
                <p className="text-xs leading-relaxed opacity-85 mb-3">
                  This card updates instantly to demonstrate your visual customizations, matching background, text color, accent, and borders.
                </p>
                <div className="border border-dashed p-3 text-xs mb-3" style={{
                  borderColor: customTheme.accentColor,
                  borderRadius: `${Math.max(0, customTheme.borderRadius - 4)}px`,
                  backgroundColor: `${customTheme.accentColor}1A`
                }}>
                  <span className="font-semibold">Illustrative Outline Box</span>
                  <div className="opacity-75 mt-1">Nested content inherits custom styles.</div>
                </div>
              </div>
              <button 
                className="w-full text-white text-xs font-semibold py-2 px-4 transition-opacity hover:opacity-95 active:scale-[0.98]" 
                style={{
                  backgroundColor: customTheme.accentColor,
                  borderRadius: `${customTheme.borderRadius / 1.5}px`
                }}
              >
                Active Primary Button
              </button>
            </div>
          </div>
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
