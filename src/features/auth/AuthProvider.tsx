import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseClient } from '../../lib/supabase'

type AuthState = { client: SupabaseClient | null; session: Session | null; loading: boolean; error: string }
const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [client] = useState(getSupabaseClient)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(!!client)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!client) return
    let active = true
    let authEventReceived = false
    // Keep this callback synchronous to avoid SDK auth-lock deadlocks.
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      authEventReceived = true
      setSession(nextSession)
      setLoading(false)
      setError('')
    })
    void client.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active || authEventReceived) return
      setSession(data.session)
      setError(sessionError ? 'Unable to restore your session. Please sign in again.' : '')
      setLoading(false)
    }).catch(() => {
      if (!active || authEventReceived) return
      setError('Unable to restore your session. Check your connection and try again.')
      setLoading(false)
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [client])

  return <AuthContext.Provider value={{ client, session, loading, error }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const state = useContext(AuthContext)
  if (!state) throw new Error('AuthProvider is required')
  return state
}
