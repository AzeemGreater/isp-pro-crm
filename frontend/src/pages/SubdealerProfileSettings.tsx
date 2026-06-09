import { useEffect, useState } from 'react'
import { Save, CheckCircle, Loader2, Palette, UserCircle2 } from 'lucide-react'
import { motion } from 'framer-motion'
import api from '../lib/api'
import { applyBranding } from '../lib/branding'
import { ThemeMode, applyTheme, getStoredThemeMode, setThemeMode } from '../lib/theme'
import { useAuth } from '../hooks/useAuth'

type BrandingSetting = {
  role: string
  role_label?: string
  app_name: string
  app_tagline: string
  logo_text: string
  primary_color: string
  accent_color: string
}

type SystemSettings = {
  branding?: BrandingSetting[]
}

export function SubdealerProfileSettings() {
  const { admin } = useAuth()
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [themeMode, setLocalThemeMode] = useState<ThemeMode>('system')
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
    const initialMode = getStoredThemeMode()
    setLocalThemeMode(initialMode)
    applyTheme(initialMode)

    api.get<SystemSettings>('/agents/settings').then((res) => {
      const own = res.data.branding?.find((b) => b.role === 'Agent') || res.data.branding?.[0]
      if (own) setBrandingForm(own)
    }).catch(() => undefined)
  }, [])

  function handleThemeChange(mode: ThemeMode) {
    setLocalThemeMode(mode)
    setThemeMode(mode)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await api.put('/agents/settings/branding/Agent', {
        app_name: brandingForm.app_name,
        app_tagline: brandingForm.app_tagline,
        logo_text: brandingForm.logo_text,
        primary_color: brandingForm.primary_color,
        accent_color: brandingForm.accent_color,
      })

      applyBranding(brandingForm)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Profile Settings</h1>
        <p className="text-sm text-text-muted">Manage your subdealer profile appearance and preferences</p>
      </div>

      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-border">
          <UserCircle2 size={18} className="text-accent-cyan" />
          <h3 className="font-semibold text-text-primary">Account</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="input-label">Full Name</label>
            <input className="input" value={admin?.fullName || ''} readOnly />
          </div>
          <div>
            <label className="input-label">Username</label>
            <input className="input" value={admin?.username || ''} readOnly />
          </div>
        </div>
        <p className="text-xs text-text-muted">Account identity fields are managed by administrator.</p>
      </div>

      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-border">
          <Palette size={18} className="text-accent-cyan" />
          <h3 className="font-semibold text-text-primary">Branding</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

        <div className="pt-2 border-t border-border">
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
        </div>
      </div>

      <motion.button onClick={handleSave} className="btn-primary w-full justify-center" disabled={saving} whileTap={{ scale: 0.98 }}>
        {saved ? <><CheckCircle size={16} /> Saved!</> : <>{saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Profile Settings</>}
      </motion.button>
    </div>
  )
}
