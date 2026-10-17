import { createContext, useContext } from 'react'

// { user, loading, isAuthenticated, error, refreshUser }
export const AuthContext = createContext(null)

export function useAuth() {
  const value = useContext(AuthContext)
  if (value === null) throw new Error('useAuth must be used inside <AuthProvider>.')
  return value
}
