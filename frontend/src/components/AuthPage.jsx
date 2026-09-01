import { useState } from 'react'
import {
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
} from '../firebase'

const FRIENDLY = {
  'auth/invalid-email': 'That email address looks invalid.',
  'auth/user-not-found': 'No account with that email. Try signing up.',
  'auth/wrong-password': 'Incorrect password.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/email-already-in-use': 'An account with that email already exists. Sign in instead.',
  'auth/weak-password': 'Password should be at least 6 characters.',
  'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
  'auth/popup-blocked': 'Your browser blocked the Google sign-in popup.',
}

export default function AuthPage({ onClose, onSuccess }) {
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const handle = async (fn) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      onSuccess?.()
    } catch (err) {
      setError(FRIENDLY[err.code] || err.message || 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  const submitEmail = (e) => {
    e.preventDefault()
    if (!email.trim() || !password) return
    handle(() =>
      mode === 'signin'
        ? signInWithEmail(email.trim(), password)
        : signUpWithEmail(email.trim(), password)
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-gray-900/90 flex items-center justify-center px-4">
      <div className="bg-gray-800 rounded-xl p-8 w-full max-w-sm flex flex-col gap-5 relative">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-3 right-4 text-gray-500 hover:text-white text-lg"
          >
            ✕
          </button>
        )}

        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-white">SolveStat</h1>
          <p className="text-gray-400 text-sm">
            {mode === 'signin' ? 'Sign in to sync your sessions' : 'Create an account to sync your sessions'}
          </p>
        </div>

        <button
          onClick={() => handle(signInWithGoogle)}
          disabled={busy}
          className="flex items-center justify-center gap-2 bg-white text-gray-800 text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition"
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
          </svg>
          Continue with Google
        </button>

        <div className="flex items-center gap-3 text-gray-600 text-xs">
          <div className="flex-1 h-px bg-gray-700" /> or <div className="flex-1 h-px bg-gray-700" />
        </div>

        <form onSubmit={submitEmail} className="flex flex-col gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoComplete="email"
            className="bg-gray-700 text-white text-sm px-3 py-2.5 rounded-lg outline-none focus:ring-1 focus:ring-blue-500"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            className="bg-gray-700 text-white text-sm px-3 py-2.5 rounded-lg outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={busy || !email.trim() || !password}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition"
          >
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
          </button>
        </form>

        {error && <p className="text-red-400 text-xs">{error}</p>}

        <p className="text-gray-400 text-xs text-center">
          {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <button
            onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null) }}
            className="text-blue-400 hover:text-blue-300"
          >
            {mode === 'signin' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}
