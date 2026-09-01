import { useEffect, useMemo, useState } from 'react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS, LineElement, PointElement, LinearScale, CategoryScale, Tooltip,
} from 'chart.js'
import { fetchPublicProfile } from '../api'
import { computeAoXTimes } from '../lib/aox'

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip)

const fmt = (v) => (v == null ? '—' : `${v.toFixed(2)}s`)

function Tile({ label, value }) {
  return (
    <div className="bg-gray-800 rounded-xl p-4 flex flex-col gap-1">
      <span className="text-xs text-gray-400 uppercase tracking-widest">{label}</span>
      <span className="text-xl font-bold text-white">{value}</span>
    </div>
  )
}

function SessionCard({ session }) {
  const { singles, bestAo5, bestAo12 } = useMemo(() => {
    const objs = session.solves.map((s) => ({ time: s.t, penalty: s.p }))
    const best = (x) => {
      const v = computeAoXTimes(objs, x).filter((n) => n != null)
      return v.length ? Math.min(...v) : null
    }
    return {
      singles: objs.filter((s) => s.penalty !== 'dnf').map((s) => s.time),
      bestAo5: best(5),
      bestAo12: best(12),
    }
  }, [session])

  const chart = {
    labels: singles.map((_, i) => i + 1),
    datasets: [{
      data: singles,
      borderColor: '#93c5fd',
      borderWidth: 1,
      pointRadius: 0,
      tension: 0,
    }],
  }
  const opts = {
    maintainAspectRatio: false,
    responsive: true,
    plugins: { legend: { display: false }, tooltip: { intersect: false, mode: 'index' } },
    scales: {
      x: { ticks: { color: '#6b7280', maxTicksLimit: 8 }, grid: { display: false } },
      y: { ticks: { color: '#6b7280' }, grid: { color: 'rgba(255,255,255,0.05)' } },
    },
  }

  return (
    <div className="bg-gray-800 rounded-xl p-6 flex flex-col gap-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h3 className="text-lg font-semibold text-white">{session.name}</h3>
        <span className="text-sm text-gray-400">{session.count.toLocaleString()} solves</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div><span className="text-gray-400 block text-xs">Mean</span><span className="text-white">{fmt(session.mean)}</span></div>
        <div><span className="text-gray-400 block text-xs">Best</span><span className="text-white">{fmt(session.best)}</span></div>
        <div><span className="text-gray-400 block text-xs">Best Ao5</span><span className="text-white">{fmt(bestAo5)}</span></div>
        <div><span className="text-gray-400 block text-xs">Best Ao12</span><span className="text-white">{fmt(bestAo12)}</span></div>
      </div>
      {singles.length > 1 && (
        <div style={{ height: '180px' }}>
          <Line data={chart} options={opts} />
        </div>
      )}
    </div>
  )
}

export default function PublicProfile({ handle }) {
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    document.title = `${handle} · SolveStat`
    fetchPublicProfile(handle)
      .then(setProfile)
      .catch((e) => setError(e.response?.status === 404
        ? 'This profile doesn’t exist or has no public sessions.'
        : 'Could not load this profile.'))
      .finally(() => setLoading(false))
  }, [handle])

  const overall = useMemo(() => {
    if (!profile) return null
    let single = null, ao5 = null, ao12 = null
    for (const s of profile.sessions) {
      const objs = s.solves.map((x) => ({ time: x.t, penalty: x.p }))
      const nd = objs.filter((x) => x.penalty !== 'dnf').map((x) => x.time)
      if (nd.length) single = single == null ? Math.min(...nd) : Math.min(single, ...nd)
      const a5 = computeAoXTimes(objs, 5).filter((x) => x != null)
      if (a5.length) ao5 = ao5 == null ? Math.min(...a5) : Math.min(ao5, ...a5)
      const a12 = computeAoXTimes(objs, 12).filter((x) => x != null)
      if (a12.length) ao12 = ao12 == null ? Math.min(...a12) : Math.min(ao12, ...a12)
    }
    return { single, ao5, ao12 }
  }, [profile])

  if (loading) {
    return <div className="min-h-screen bg-gray-900 text-gray-400 flex items-center justify-center">Loading…</div>
  }
  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-gray-300">{error}</p>
        <a href="/" className="text-blue-400 hover:text-blue-300 text-sm">← SolveStat</a>
      </div>
    )
  }

  const since = profile.member_since ? new Date(profile.member_since).toLocaleDateString() : null

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-4xl mx-auto px-4 py-10 flex flex-col gap-8">
        <header className="flex flex-col gap-1">
          <a href="/" className="text-xs text-gray-500 hover:text-gray-300">SolveStat</a>
          <h1 className="text-3xl font-bold">{profile.display_name}</h1>
          <p className="text-gray-400 text-sm">
            @{profile.handle}
            {since && <> · member since {since}</>}
            {profile.wca_id && (
              <> · <a
                href={`https://www.worldcubeassociation.org/persons/${profile.wca_id}`}
                target="_blank" rel="noreferrer"
                className="text-blue-400 hover:text-blue-300"
              >{profile.wca_id}</a></>
            )}
          </p>
        </header>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <Tile label="Total solves" value={profile.total_solves.toLocaleString()} />
          <Tile label="Public sessions" value={profile.session_count} />
          <Tile label="PB single" value={fmt(overall.single)} />
          <Tile label="Best Ao5" value={fmt(overall.ao5)} />
          <Tile label="Best Ao12" value={fmt(overall.ao12)} />
        </div>

        <div className="flex flex-col gap-6">
          {profile.sessions.map((s, i) => <SessionCard key={i} session={s} />)}
        </div>

        <footer className="text-xs text-gray-600 text-center pt-4">
          <a href="/" className="hover:text-gray-400">Made with SolveStat</a>
        </footer>
      </div>
    </div>
  )
}
