import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import PublicProfile from './components/PublicProfile'
import { AuthProvider } from './auth/AuthContext'
import './index.css'

const publicMatch = window.location.pathname.match(/^\/u\/([A-Za-z0-9_-]+)\/?$/)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {publicMatch ? (
      <PublicProfile handle={publicMatch[1].toLowerCase()} />
    ) : (
      <AuthProvider>
        <App />
      </AuthProvider>
    )}
  </React.StrictMode>
)
