import { createContext, useContext, useEffect, useState } from 'react'
import { onIdTokenChanged } from 'firebase/auth'
import { auth, firebaseEnabled, logOut } from '../firebase'

const AuthContext = createContext({
  user: null,
  loading: true,
  enabled: false,
  logout: async () => {},
})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(firebaseEnabled)

  useEffect(() => {
    if (!firebaseEnabled) {
      setLoading(false)
      return
    }
    const unsub = onIdTokenChanged(auth, (u) => {
      setUser(u)
      setLoading(false)
    })
    return unsub
  }, [])

  const value = {
    user,
    loading,
    enabled: firebaseEnabled,
    logout: () => logOut(),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext)
}
