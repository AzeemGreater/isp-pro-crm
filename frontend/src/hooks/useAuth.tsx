import { createContext, useContext, useState, useCallback } from 'react'

interface Admin {
  id: string; username: string; fullName: string; role: string;
  walletBalance: number; permissions: Record<string, boolean>;
}

interface AuthCtx {
  token: string | null; admin: Admin | null;
  login:  (token: string, admin: Admin) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthCtx>({
  token: null, admin: null, login: () => {}, logout: () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('crm_token'))
  const [admin, setAdmin] = useState<Admin | null>(() => {
    const saved = localStorage.getItem('crm_admin')
    return saved ? JSON.parse(saved) as Admin : null
  })

  const login = useCallback((t: string, a: Admin) => {
    localStorage.setItem('crm_token', t)
    localStorage.setItem('crm_admin', JSON.stringify(a))
    setToken(t); setAdmin(a)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('crm_token')
    localStorage.removeItem('crm_admin')
    setToken(null); setAdmin(null)
  }, [])

  return <AuthContext.Provider value={{ token, admin, login, logout }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
