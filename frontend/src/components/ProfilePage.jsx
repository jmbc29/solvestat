import { useState } from 'react'
import { saveWcaId, saveHandle } from '../api'

function Row({ label, value }) {
  return (
    <div className="flex justify-between text-sm py-2 border-b border-gray-700/60 last:border-0">
      <span className="text-gray-400">{label}</span>
      <span className="text-white font-medium text-right">{value}</span>
    </div>
  )
}

function WcaIdCard({ me, onWcaIdSaved }) {
  const [wcaId, setWcaId] = useState(me?.wca_id || '')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  const save = async () => {
    setBusy(true); setError(null); setSaved(false)
    try {
      const res = await saveWcaId(wcaId.trim().toUpperCase())
      setWcaId(res.wca_id)
      onWcaIdSaved?.(res.wca_id)
      setSaved(true)
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not save WCA ID.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-gray-800 rounded-xl p-6 flex flex-col gap-3">
      <h3 className="text-xs text-gray-400 uppercase tracking-widest">WCA ID</h3>
      <div className="flex gap-2">
        <input
          type="text"
          value={wcaId}
          onChange={(e) => { setWcaId(e.target.value); setSaved(false) }}
          placeholder="e.g. 2023CAIJ01"
          className="bg-gray-700 text-white text-sm px-3 py-2 rounded-lg outline-none flex-1 uppercase"
        />
        <button
          onClick={save}
          disabled={busy}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded-lg transition"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
      {saved && <p className="text-green-400 text-xs">Saved. It pre-fills the WCA panel and shows on your public profile.</p>}
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  )
}

function PublicProfileCard({ me, cloudSessions, onHandleSaved, onToggleSessionPublic }) {
  const [handle, setHandle] = useState(me?.handle || '')
  const [publicName, setPublicName] = useState(me?.public_name || me?.name || '')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  const publicCount = cloudSessions.filter((s) => s.isPublic).length
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const url = handle ? `${origin}/u/${handle}` : null

  const save = async () => {
    setBusy(true); setError(null); setSaved(false)
    try {
      const res = await saveHandle(handle.trim().toLowerCase(), publicName.trim())
      setHandle(res.handle)
      onHandleSaved?.(res.handle, res.public_name)
      setSaved(true)
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  const copy = () => { if (url) navigator.clipboard?.writeText(url) }

  return (
    <div className="bg-gray-800 rounded-xl p-6 flex flex-col gap-4">
      <div>
        <h3 className="text-xs text-gray-400 uppercase tracking-widest">Public profile</h3>
        <p className="text-gray-500 text-xs mt-1">
          Pick a handle, then flip individual sessions public below. Only aggregate stats and
          charts are shown — scrambles and comments stay private.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex gap-2 items-center">
          <span className="text-gray-500 text-sm">{origin}/u/</span>
          <input
            type="text"
            value={handle}
            onChange={(e) => { setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); setSaved(false) }}
            placeholder="your-handle"
            className="bg-gray-700 text-white text-sm px-3 py-2 rounded-lg outline-none flex-1"
          />
        </div>
        <input
          type="text"
          value={publicName}
          onChange={(e) => { setPublicName(e.target.value); setSaved(false) }}
          placeholder="Display name (optional)"
          className="bg-gray-700 text-white text-sm px-3 py-2 rounded-lg outline-none"
        />
        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={busy}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded-lg transition"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
          {url && (
            <>
              <a href={url} target="_blank" rel="noreferrer"
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition">
                View
              </a>
              <button onClick={copy}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition">
                Copy link
              </button>
            </>
          )}
        </div>
        {saved && <p className="text-green-400 text-xs">Saved.</p>}
        {error && <p className="text-red-400 text-xs">{error}</p>}
        {handle && publicCount === 0 && (
          <p className="text-yellow-400 text-xs">Your profile is empty until you make at least one session public.</p>
        )}
      </div>

      {cloudSessions.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-gray-700 pt-3">
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Sessions ({publicCount} public)</p>
          {cloudSessions.map((s) => (
            <label key={s.cloudId} className="flex items-center justify-between text-sm py-1 cursor-pointer">
              <span className="text-gray-200 truncate mr-3">{s.name}</span>
              <input
                type="checkbox"
                checked={!!s.isPublic}
                onChange={(e) => onToggleSessionPublic(s.cloudId, e.target.checked)}
                className="accent-blue-600 w-4 h-4 shrink-0"
              />
            </label>
          ))}
        </div>
      )}
      {cloudSessions.length === 0 && (
        <p className="text-gray-500 text-xs border-t border-gray-700 pt-3">
          Upload a session while signed in to make it shareable.
        </p>
      )}
    </div>
  )
}

export default function ProfilePage({
  me, cloudSessions = [], onBack, onWcaIdSaved, onHandleSaved, onToggleSessionPublic, onLogout,
}) {
  const created = me?.created_at ? new Date(me.created_at).toLocaleDateString() : '—'

  return (
    <div className="max-w-xl mx-auto flex flex-col gap-6 py-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-sm text-blue-400 hover:text-blue-300">← Back to dashboard</button>
        <button onClick={onLogout} className="text-sm text-gray-400 hover:text-red-400">Sign out</button>
      </div>

      <div className="flex items-center gap-4">
        {me?.picture
          ? <img src={me.picture} alt="" className="w-14 h-14 rounded-full" referrerPolicy="no-referrer" />
          : <div className="w-14 h-14 rounded-full bg-blue-600 flex items-center justify-center text-xl font-bold">
              {(me?.name || me?.email || '?').slice(0, 1).toUpperCase()}
            </div>}
        <div>
          <p className="text-lg font-semibold text-white">{me?.name || me?.email || 'Your account'}</p>
          <p className="text-gray-400 text-sm">{me?.email}</p>
        </div>
      </div>

      <WcaIdCard me={me} onWcaIdSaved={onWcaIdSaved} />

      <PublicProfileCard
        me={me}
        cloudSessions={cloudSessions}
        onHandleSaved={onHandleSaved}
        onToggleSessionPublic={onToggleSessionPublic}
      />

      <div className="bg-gray-800 rounded-xl p-6">
        <h3 className="text-xs text-gray-400 uppercase tracking-widest mb-2">Account</h3>
        <Row label="Total solves (cloud)" value={(me?.total_solves ?? 0).toLocaleString()} />
        <Row label="Saved sessions" value={me?.session_count ?? 0} />
        <Row label="Sign-in method" value={me?.provider === 'google.com' ? 'Google' : me?.provider === 'password' ? 'Email / password' : (me?.provider || '—')} />
        <Row label="Member since" value={created} />
      </div>
    </div>
  )
}
