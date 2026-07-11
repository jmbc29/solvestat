import { useState, useEffect } from 'react'
import axios from 'axios'
import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip, Legend
} from 'chart.js'
import annotationPlugin from 'chartjs-plugin-annotation'

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend, annotationPlugin)

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const EVENT_LABELS = {
  '333': '3x3', '222': '2x2', '444': '4x4', '555': '5x5',
  '666': '6x6', '777': '7x7', '333bf': '3x3 BLD', '333fm': 'FMC',
  '333oh': '3x3 OH', 'clock': 'Clock', 'minx': 'Megaminx',
  'pyram': 'Pyraminx', 'skewb': 'Skewb', 'sq1': 'Square-1',
  '444bf': '4x4 BLD', '555bf': '5x5 BLD', '333mbf': 'Multi-BLD',
}

const EVENT_SOLVE_COUNTS = {
  '333': 5, '222': 5, '444': 5, '555': 5, '666': 3, '777': 3,
  '333bf': 3, '333fm': 3, '333oh': 5, 'clock': 5, 'minx': 5,
  'pyram': 5, 'skewb': 5, 'sq1': 5, '444bf': 3, '555bf': 3, '333mbf': 3,
}

function StatRow({ label, value, highlight }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-400">{label}</span>
      <span className={highlight ? 'text-yellow-400 font-bold' : 'text-white'}>{value}</span>
    </div>
  )
}

function Banner({ tone, title, text }) {
  const styles = {
    good: ['border-green-500', 'text-green-400'],
    warn: ['border-yellow-500', 'text-yellow-400'],
    info: ['border-blue-500', 'text-blue-400'],
  }[tone]
  return (
    <div className={`border-l-4 ${styles[0]} bg-gray-900 rounded-lg p-4 mt-4 flex flex-col gap-2`}>
      <p className={`text-sm font-semibold ${styles[1]}`}>{title}</p>
      <p className="text-white text-sm whitespace-pre-wrap">{text}</p>
    </div>
  )
}

function DataToggle({ isAoXMode, useRawSingles, setUseRawSingles, rawCount, currentCount, currentLabel }) {
  if (!isAoXMode) return null
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => setUseRawSingles(!useRawSingles)}
        className={`text-xs px-3 py-1 rounded-lg transition ${
          useRawSingles ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
        }`}
      >
        {useRawSingles ? '✓ Using raw singles' : `Using ${currentLabel}`}
      </button>
      <span className="text-gray-500 text-xs">
        {useRawSingles
          ? `${rawCount.toLocaleString()} raw singles`
          : `${currentCount.toLocaleString()} ${currentLabel}`}
      </span>
    </div>
  )
}

function CompetitionTab({ session, rawSolves }) {
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [recentComps, setRecentComps] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [recentLoading, setRecentLoading] = useState(true)
  const [searchError, setSearchError] = useState(null)
  const [selectedComp, setSelectedComp] = useState(null)
  const [selectedEvent, setSelectedEvent] = useState('333')
  const [selectedRound, setSelectedRound] = useState(null)
  const [compResults, setCompResults] = useState(null)
  const [compLoading, setCompLoading] = useState(false)
  const [compError, setCompError] = useState(null)
  const [recentN, setRecentN] = useState('')
  const [simResult, setSimResult] = useState(null)
  const [simLoading, setSimLoading] = useState(false)
  const [simError, setSimError] = useState(null)
  const [useRawSingles, setUseRawSingles] = useState(false)
  const [includeDnf, setIncludeDnf] = useState(false)

  const isAoXMode = session.solves.some((s) => s.windowSolves !== undefined && s.windowSolves !== null)

  const rawValidTimes = (includeDnf ? rawSolves : rawSolves.filter((s) => s.penalty !== 'dnf'))
    .filter((s) => s.time !== null).map((s) => s.time)
  const currentValidTimes = (includeDnf ? session.solves : session.solves.filter((s) => s.penalty !== 'dnf'))
    .filter((s) => s.time !== null).map((s) => s.time)
  const validTimes = useRawSingles ? rawValidTimes : currentValidTimes
  const currentLabel = isAoXMode ? 'averages' : 'singles'

  useEffect(() => {
    const loadRecent = async () => {
      try {
        const res = await axios.get(`${API}/wca/competitions/search`)
        setRecentComps(res.data)
      } catch { }
      setRecentLoading(false)
    }
    loadRecent()
  }, [])

  const searchComps = async () => {
    if (!query.trim()) return
    setSearchLoading(true)
    setSearchError(null)
    setSearchResults([])
    setSelectedComp(null)
    setCompResults(null)
    setSimResult(null)
    try {
      const res = await axios.get(`${API}/wca/competitions/search`, { params: { query } })
      setSearchResults(res.data)
      if (res.data.length === 0) setSearchError('No competitions found.')
    } catch {
      setSearchError('Failed to search competitions.')
    }
    setSearchLoading(false)
  }

  const selectComp = (comp) => {
    setSelectedComp(comp)
    setCompResults(null)
    setSimResult(null)
    setSelectedRound(null)
    const available = comp.events.filter((e) => EVENT_LABELS[e])
    if (available.length > 0) setSelectedEvent(available.includes('333') ? '333' : available[0])
  }

  const fetchResults = async (roundId = null) => {
    if (!selectedComp) return
    setCompLoading(true)
    setCompError(null)
    setCompResults(null)
    setSimResult(null)
    try {
      const params = roundId ? { round_id: roundId } : {}
      const res = await axios.get(
        `${API}/wca/competitions/${selectedComp.id}/results/${selectedEvent}`,
        { params }
      )
      setCompResults(res.data)
      setSelectedRound(res.data.round)
    } catch (err) {
      setCompError(err.response?.data?.detail ?? 'Failed to fetch competition results.')
    }
    setCompLoading(false)
  }

  const runSimulation = async () => {
    if (!compResults) return
    setSimLoading(true)
    setSimError(null)
    setSimResult(null)
    const times = recentN && parseInt(recentN) > 0 ? validTimes.slice(-parseInt(recentN)) : validTimes
    try {
      const res = await axios.post(`${API}/wca/simulate`, {
        times,
        competitor_averages: compResults.competitors.map((c) => c.average),
        n_simulations: 10000,
        solve_count: EVENT_SOLVE_COUNTS[selectedEvent] ?? 5,
        next_round_count: compResults.next_round_count ?? null,
      })
      setSimResult(res.data)
    } catch (err) {
      setSimError(err.response?.data?.detail ?? 'Simulation failed.')
    }
    setSimLoading(false)
  }

  const buildPlacementChart = (simResult) => {
    if (!simResult) return null
    const dist = simResult.placement_distribution
    const maxPlace = simResult.n_competitors
    const bucketSize = Math.max(1, Math.floor(maxPlace / 20))
    const buckets = {}
    for (const [place, count] of Object.entries(dist)) {
      const bucket = Math.floor((parseInt(place) - 1) / bucketSize) * bucketSize + 1
      buckets[bucket] = (buckets[bucket] || 0) + count
    }
    const sortedBuckets = Object.entries(buckets).sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
    const labels = sortedBuckets.map(([place]) =>
      bucketSize > 1 ? `${place}–${Math.min(parseInt(place) + bucketSize - 1, maxPlace)}` : place
    )
    const data = sortedBuckets.map(([, count]) => count)
    const medianBucketIdx = sortedBuckets.findIndex(([place]) => {
      const p = parseInt(place)
      return p <= simResult.median_place && simResult.median_place < p + bucketSize
    })
    return {
      labels,
      datasets: [{
        data,
        backgroundColor: data.map((_, i) =>
          i === medianBucketIdx ? 'rgba(250,204,21,0.8)' : 'rgba(96,165,250,0.5)'
        ),
        borderWidth: 0,
        barPercentage: 0.95,
        categoryPercentage: 1.0,
      }]
    }
  }

  const chartData = buildPlacementChart(simResult)
  const availableEvents = selectedComp ? selectedComp.events.filter((e) => EVENT_LABELS[e]) : []
  const displayResults = searchResults.length > 0 ? searchResults : recentComps

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <h3 className="text-xs text-gray-400 uppercase tracking-widest">1. Find a Competition</h3>
        <div className="flex gap-2">
          <input
            type="text" value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchComps()}
            placeholder="Search competitions... (or scroll for recent)"
            className="bg-gray-700 text-white text-sm px-3 py-2 rounded-lg outline-none flex-1"
          />
          <button onClick={searchComps} disabled={searchLoading || !query.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded-lg transition">
            {searchLoading ? 'Searching...' : 'Search'}
          </button>
        </div>
        {searchError && <p className="text-red-400 text-xs">{searchError}</p>}
        <div className="flex flex-col gap-1 max-h-56 overflow-y-auto border border-gray-700 rounded-lg p-1">
          {recentLoading && searchResults.length === 0 ? (
            <p className="text-gray-500 text-xs px-3 py-2">Loading recent competitions...</p>
          ) : displayResults.length === 0 ? (
            <p className="text-gray-500 text-xs px-3 py-2">No competitions found.</p>
          ) : (
            <>
              <p className="text-xs text-gray-500 px-2 py-1">
                {searchResults.length > 0 ? 'Search results' : 'Recent past competitions'}
              </p>
              {displayResults.map((comp) => (
                <button key={comp.id} onClick={() => selectComp(comp)}
                  className={`text-left text-sm px-3 py-2 rounded-lg transition ${
                    selectedComp?.id === comp.id ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}>
                  <div className="font-medium">{comp.name}</div>
                  <div className="text-xs text-gray-400">
                    {comp.city}, {comp.country} · {comp.start_date}
                    {comp.competitor_count ? ` · ${comp.competitor_count} competitors` : ''}
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {selectedComp && (
        <div className="flex flex-col gap-3">
          <h3 className="text-xs text-gray-400 uppercase tracking-widest">2. Select Event</h3>
          <div className="flex flex-wrap gap-2">
            {availableEvents.map((e) => (
              <button key={e} onClick={() => { setSelectedEvent(e); setCompResults(null); setSimResult(null); setSelectedRound(null) }}
                className={`text-xs px-3 py-1.5 rounded-lg transition ${
                  selectedEvent === e ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}>
                {EVENT_LABELS[e] ?? e}
              </button>
            ))}
          </div>
          <button onClick={() => fetchResults(null)} disabled={compLoading}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded-lg transition w-fit">
            {compLoading ? 'Loading results...' : 'Load Competition Results'}
          </button>
          {compError && <p className="text-red-400 text-xs">{compError}</p>}
        </div>
      )}

      {compResults && compResults.rounds && compResults.rounds.length > 1 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs text-gray-400 uppercase tracking-widest">3. Select Round</h3>
          <div className="flex flex-wrap gap-2">
            {compResults.rounds.map((r) => (
              <button key={r.id} onClick={() => fetchResults(r.id)}
                className={`text-xs px-3 py-1.5 rounded-lg transition ${
                  selectedRound === r.id ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}>
                {r.label} <span className="opacity-70">({r.competitor_count})</span>
              </button>
            ))}
          </div>
          {compResults.next_round_count && (
            <p className="text-xs text-gray-500">Top {compResults.next_round_count} advance to next round</p>
          )}
        </div>
      )}

      {compResults && (
        <div className="flex flex-col gap-3">
          <h3 className="text-xs text-gray-400 uppercase tracking-widest">
            {compResults.rounds && compResults.rounds.length > 1 ? '4.' : '3.'} Simulate Placement
          </h3>
          <div className="bg-gray-900 rounded-lg p-3 flex flex-col gap-1">
            <p className="text-sm text-white font-medium">{selectedComp.name}</p>
            <p className="text-xs text-gray-400">
              {EVENT_LABELS[selectedEvent]} · {compResults.rounds?.find(r => r.id === selectedRound)?.label ?? 'Final'} ·
              {compResults.competitor_count} competitors ·
              Winner: {compResults.competitors[0]?.name} ({compResults.competitors[0]?.average}s)
            </p>
          </div>
          <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
            <p className="text-xs text-gray-500 mb-1">All {compResults.competitors.length} results:</p>
            {compResults.competitors.map((c, i) => (
              <div key={i} className="flex justify-between items-center bg-gray-900 rounded px-3 py-1.5 text-xs">
                <span className="text-gray-400 w-6">{i + 1}.</span>
                <span className="text-white flex-1">{c.name}</span>
                <span className="text-gray-400 mr-3">{c.country}</span>
                <span className="text-white font-mono">{c.average}s</span>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <DataToggle
              isAoXMode={isAoXMode}
              useRawSingles={useRawSingles}
              setUseRawSingles={setUseRawSingles}
              rawCount={rawValidTimes.length}
              currentCount={currentValidTimes.length}
              currentLabel={currentLabel}
            />
            <button
              onClick={() => setIncludeDnf(!includeDnf)}
              className={`text-xs px-3 py-1 rounded-lg transition ${
                includeDnf ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {includeDnf ? '✓ DNF times included' : 'Include DNF times'}
            </button>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-gray-400 text-sm shrink-0">Use last N solves</label>
            <input type="number" min="5" value={recentN} onChange={(e) => setRecentN(e.target.value)}
              placeholder="all"
              className="bg-gray-700 text-white text-sm px-3 py-2 rounded-lg outline-none w-24" />
            <span className="text-gray-500 text-xs">
              ({recentN && parseInt(recentN) > 0
                ? `using ${Math.min(parseInt(recentN), validTimes.length)} solves`
                : `using all ${validTimes.length} solves`})
            </span>
          </div>
          <button onClick={runSimulation} disabled={simLoading}
            className="px-5 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm rounded-lg transition w-fit">
            {simLoading ? 'Simulating...' : '🎲 Run Simulation (10,000 trials)'}
          </button>
          {simError && <p className="text-red-400 text-xs">{simError}</p>}
        </div>
      )}

      {simResult && (
        <>
          <Banner
            tone={simResult.median_place <= 3 ? 'good' : simResult.percentile_in_field >= 75 ? 'info' : 'warn'}
            title={simResult.median_place === 1 ? '🥇 Projected Winner!'
              : simResult.median_place <= 3 ? `🥇 Projected Podium — Place ${simResult.median_place}`
              : `📊 Projected Place ${simResult.median_place} of ${simResult.n_competitors}`}
            text={simResult.interpretation}
          />
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 mt-2">
            <StatRow label="Median place" value={`${simResult.median_place} / ${simResult.n_competitors}`} highlight />
            <StatRow label="Mean place" value={`${simResult.mean_place} / ${simResult.n_competitors}`} />
            <StatRow label="95% CI" value={`${simResult.ci_low}–${simResult.ci_high}`} />
            <StatRow label="Field percentile" value={`Top ${(100 - simResult.percentile_in_field).toFixed(0)}%`} />
            <StatRow label="Top 3 probability" value={`${simResult.top3_prob}%`} />
            <StatRow label="Top 10 probability" value={`${simResult.top10_prob}%`} />
            <StatRow label="Top half probability" value={`${simResult.top_half_prob}%`} />
            {simResult.advance_prob !== null && simResult.advance_prob !== undefined && (
              <StatRow label="Advancement probability" value={`${simResult.advance_prob}%`} highlight />
            )}
            <StatRow label="Simulations run" value={simResult.n_simulations.toLocaleString()} />
          </div>
          {chartData && (
            <div className="mt-4" style={{ height: '260px' }}>
              <p className="text-xs text-gray-400 mb-2">Placement distribution (yellow = median)</p>
              <Bar data={chartData} options={{
                maintainAspectRatio: false, responsive: true,
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    callbacks: {
                      title: (items) => `Place ${items[0].label}`,
                      label: (ctx) => `${ctx.parsed.y} simulations (${(ctx.parsed.y / simResult.n_simulations * 100).toFixed(1)}%)`,
                    }
                  }
                },
                scales: {
                  x: { ticks: { color: '#9ca3af', maxTicksLimit: 15 }, grid: { display: false }, title: { display: true, text: 'Place', color: '#9ca3af' } },
                  y: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.05)' }, title: { display: true, text: 'Simulations', color: '#9ca3af' } },
                },
              }} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ProfileTab({ session, rawSolves }) {
  const [yourWcaId, setYourWcaId] = useState('')
  const [yourProfile, setYourProfile] = useState(null)
  const [yourLoading, setYourLoading] = useState(false)
  const [yourError, setYourError] = useState(null)
  const [selectedEvent, setSelectedEvent] = useState('333')
  const [pbSimResult, setPbSimResult] = useState(null)
  const [pbSimLoading, setPbSimLoading] = useState(false)
  const [pbSimError, setPbSimError] = useState(null)
  const [opponentId, setOpponentId] = useState('')
  const [opponentProfile, setOpponentProfile] = useState(null)
  const [opponentLoading, setOpponentLoading] = useState(false)
  const [opponentError, setOpponentError] = useState(null)
  const [opponentResults, setOpponentResults] = useState(null)
  const [h2hRecentN, setH2hRecentN] = useState('')
  const [h2hResult, setH2hResult] = useState(null)
  const [h2hLoading, setH2hLoading] = useState(false)
  const [h2hError, setH2hError] = useState(null)
  const [pbRecentN, setPbRecentN] = useState('')
  const [useRawSingles, setUseRawSingles] = useState(false)
  const [includeDnf, setIncludeDnf] = useState(false)

  const isAoXMode = session.solves.some((s) => s.windowSolves !== undefined && s.windowSolves !== null)

  const rawValidTimes = (includeDnf ? rawSolves : rawSolves.filter((s) => s.penalty !== 'dnf'))
    .filter((s) => s.time !== null).map((s) => s.time)
  const currentValidTimes = (includeDnf ? session.solves : session.solves.filter((s) => s.penalty !== 'dnf'))
    .filter((s) => s.time !== null).map((s) => s.time)
  const validTimes = useRawSingles ? rawValidTimes : currentValidTimes
  const currentLabel = isAoXMode ? 'averages' : 'singles'

  const fetchYourProfile = async () => {
    if (!yourWcaId.trim()) return
    setYourLoading(true)
    setYourError(null)
    setYourProfile(null)
    setPbSimResult(null)
    try {
      const res = await axios.get(`${API}/wca/profile/${yourWcaId.trim().toUpperCase()}`)
      setYourProfile(res.data)
      const events = Object.keys(res.data.personal_bests)
      if (events.includes('333')) setSelectedEvent('333')
      else if (events.length > 0) setSelectedEvent(events[0])
    } catch (err) {
      setYourError(err.response?.data?.detail ?? 'Profile not found. Check your WCA ID.')
    }
    setYourLoading(false)
  }

  const runPbSim = async () => {
    if (!yourProfile) return
    const pb = yourProfile.personal_bests[selectedEvent]
    if (!pb) return
    setPbSimLoading(true)
    setPbSimError(null)
    setPbSimResult(null)
    const times = pbRecentN && parseInt(pbRecentN) > 0 ? validTimes.slice(-parseInt(pbRecentN)) : validTimes
    try {
      const res = await axios.post(`${API}/wca/simulate-pb`, {
        times,
        pb_single: pb.single,
        pb_average: pb.average ?? null,
        solve_count: EVENT_SOLVE_COUNTS[selectedEvent] ?? 5,
        n_simulations: 10000,
      })
      setPbSimResult(res.data)
    } catch (err) {
      setPbSimError(err.response?.data?.detail ?? 'Simulation failed.')
    }
    setPbSimLoading(false)
  }

  const fetchOpponent = async () => {
    if (!opponentId.trim()) return
    setOpponentLoading(true)
    setOpponentError(null)
    setOpponentProfile(null)
    setOpponentResults(null)
    setH2hResult(null)
    try {
      const [profileRes, resultsRes] = await Promise.all([
        axios.get(`${API}/wca/profile/${opponentId.trim().toUpperCase()}`),
        axios.get(`${API}/wca/profile/${opponentId.trim().toUpperCase()}/results/${selectedEvent}`),
      ])
      setOpponentProfile(profileRes.data)
      setOpponentResults(resultsRes.data)
    } catch (err) {
      setOpponentError(err.response?.data?.detail ?? 'Profile not found. Check the WCA ID.')
    }
    setOpponentLoading(false)
  }

  const runH2H = async () => {
    if (!opponentResults || opponentResults.averages.length === 0) return
    setH2hLoading(true)
    setH2hError(null)
    setH2hResult(null)
    const times = h2hRecentN && parseInt(h2hRecentN) > 0 ? validTimes.slice(-parseInt(h2hRecentN)) : validTimes
    try {
      const res = await axios.post(`${API}/wca/head-to-head`, {
        your_times: times,
        their_comp_averages: opponentResults.averages.map((r) => r.average),
        their_name: opponentProfile?.name ?? opponentId,
        solve_count: EVENT_SOLVE_COUNTS[selectedEvent] ?? 5,
        n_simulations: 10000,
      })
      setH2hResult(res.data)
    } catch (err) {
      setH2hError(err.response?.data?.detail ?? 'Simulation failed.')
    }
    setH2hLoading(false)
  }

  const yourPb = yourProfile?.personal_bests?.[selectedEvent]
  const availableEvents = yourProfile ? Object.keys(yourProfile.personal_bests).filter((e) => EVENT_LABELS[e]) : []

  return (
    <div className="flex flex-col gap-5">

      {/* Data controls */}
      <div className="flex flex-wrap gap-2">
        <DataToggle
          isAoXMode={isAoXMode}
          useRawSingles={useRawSingles}
          setUseRawSingles={setUseRawSingles}
          rawCount={rawValidTimes.length}
          currentCount={currentValidTimes.length}
          currentLabel={currentLabel}
        />
        <button
          onClick={() => setIncludeDnf(!includeDnf)}
          className={`text-xs px-3 py-1 rounded-lg transition ${
            includeDnf ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          {includeDnf ? '✓ DNF times included' : 'Include DNF times'}
        </button>
        <span className="text-gray-500 text-xs self-center">
          {validTimes.length.toLocaleString()} data points
        </span>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-xs text-gray-400 uppercase tracking-widest">Your WCA Profile</h3>
        <div className="flex gap-2">
          <input type="text" value={yourWcaId} onChange={(e) => setYourWcaId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchYourProfile()}
            placeholder="e.g. 2023CAIJ01"
            className="bg-gray-700 text-white text-sm px-3 py-2 rounded-lg outline-none flex-1" />
          <button onClick={fetchYourProfile} disabled={yourLoading || !yourWcaId.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded-lg transition">
            {yourLoading ? 'Loading...' : 'Fetch'}
          </button>
        </div>
        {yourError && <p className="text-red-400 text-xs">{yourError}</p>}
        {yourProfile && (
          <div className="bg-gray-900 rounded-lg p-4 flex flex-col gap-2">
            <p className="text-white font-semibold">{yourProfile.name}</p>
            <p className="text-gray-400 text-xs">{yourProfile.wca_id} · {yourProfile.country} · {yourProfile.competitions_count} competitions</p>
          </div>
        )}
      </div>

      {yourProfile && availableEvents.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-xs text-gray-400 uppercase tracking-widest">Select Event</h3>
          <div className="flex flex-wrap gap-2">
            {availableEvents.map((e) => (
              <button key={e}
                onClick={() => { setSelectedEvent(e); setPbSimResult(null); setOpponentResults(null); setH2hResult(null) }}
                className={`text-xs px-3 py-1.5 rounded-lg transition ${
                  selectedEvent === e ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}>
                {EVENT_LABELS[e] ?? e}
              </button>
            ))}
          </div>
          {yourPb && (
            <div className="bg-gray-900 rounded-lg p-3 flex flex-col gap-1">
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Your {EVENT_LABELS[selectedEvent]} PBs</p>
              <div className="grid grid-cols-2 gap-x-6">
                {yourPb.single && <StatRow label="PB Single" value={`${yourPb.single}s`} highlight />}
                {yourPb.single_world_rank && <StatRow label="Single WR" value={`#${yourPb.single_world_rank.toLocaleString()}`} />}
                {yourPb.average && <StatRow label="PB Average" value={`${yourPb.average}s`} highlight />}
                {yourPb.average_world_rank && <StatRow label="Average WR" value={`#${yourPb.average_world_rank.toLocaleString()}`} />}
              </div>
            </div>
          )}
        </div>
      )}

      {yourProfile && yourPb && (
        <div className="flex flex-col gap-3">
          <h3 className="text-xs text-gray-400 uppercase tracking-widest">PB Break Probability</h3>
          <div className="flex items-center gap-3">
            <label className="text-gray-400 text-sm shrink-0">Use last N solves</label>
            <input type="number" min="5" value={pbRecentN} onChange={(e) => setPbRecentN(e.target.value)}
              placeholder="all"
              className="bg-gray-700 text-white text-sm px-3 py-2 rounded-lg outline-none w-24" />
            <span className="text-gray-500 text-xs">
              ({pbRecentN && parseInt(pbRecentN) > 0
                ? `using ${Math.min(parseInt(pbRecentN), validTimes.length)} solves`
                : `using all ${validTimes.length} solves`})
            </span>
          </div>
          <button onClick={runPbSim} disabled={pbSimLoading}
            className="px-5 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm rounded-lg transition w-fit">
            {pbSimLoading ? 'Simulating...' : '🎲 Simulate PB Probability'}
          </button>
          {pbSimError && <p className="text-red-400 text-xs">{pbSimError}</p>}
          {pbSimResult && (
            <>
              <Banner
                tone={pbSimResult.pb_single_prob > 25 ? 'good' : pbSimResult.pb_single_prob > 5 ? 'info' : 'warn'}
                title="PB Break Analysis"
                text={pbSimResult.single_interpretation}
              />
              <div className="grid grid-cols-2 gap-x-8 gap-y-2 mt-2">
                <StatRow label="PB single" value={`${pbSimResult.pb_single}s`} />
                <StatRow label="Training best" value={`${pbSimResult.current_training_best}s`} />
                <StatRow label="Single break prob" value={`${pbSimResult.pb_single_prob}%`} highlight />
                {pbSimResult.pb_average && <StatRow label="PB average" value={`${pbSimResult.pb_average}s`} />}
                {pbSimResult.pb_average_prob !== null && (
                  <StatRow label="Average break prob" value={`${pbSimResult.pb_average_prob}%`} highlight />
                )}
                <StatRow label="Training mean" value={`${pbSimResult.current_training_mean}s`} />
                {pbSimResult.gap_single !== undefined && (
                  <StatRow label="Gap to PB single" value={`${pbSimResult.gap_single > 0 ? '+' : ''}${pbSimResult.gap_single}s`} />
                )}
              </div>
            </>
          )}
        </div>
      )}

      {yourProfile && <div className="border-t border-gray-700" />}

      {yourProfile && (
        <div className="flex flex-col gap-3">
          <h3 className="text-xs text-gray-400 uppercase tracking-widest">Head-to-Head vs Another Competitor</h3>
          <p className="text-gray-500 text-xs">Enter their WCA ID to simulate how often you'd beat them at a competition, based on their competition history.</p>
          <div className="flex gap-2">
            <input type="text" value={opponentId} onChange={(e) => setOpponentId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchOpponent()}
              placeholder="e.g. 2023CAIJ01"
              className="bg-gray-700 text-white text-sm px-3 py-2 rounded-lg outline-none flex-1" />
            <button onClick={fetchOpponent} disabled={opponentLoading || !opponentId.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded-lg transition">
              {opponentLoading ? 'Loading...' : 'Fetch'}
            </button>
          </div>
          {opponentError && <p className="text-red-400 text-xs">{opponentError}</p>}

          {opponentProfile && opponentResults && (
            <div className="bg-gray-900 rounded-lg p-3 flex flex-col gap-2">
              <p className="text-white text-sm font-medium">{opponentProfile.name}</p>
              <p className="text-gray-400 text-xs">{opponentProfile.wca_id} · {opponentProfile.country}</p>
              {opponentProfile.personal_bests[selectedEvent] && (
                <div className="grid grid-cols-2 gap-x-6 mt-1">
                  {opponentProfile.personal_bests[selectedEvent].single && (
                    <StatRow label="Their PB single" value={`${opponentProfile.personal_bests[selectedEvent].single}s`} />
                  )}
                  {opponentProfile.personal_bests[selectedEvent].average && (
                    <StatRow label="Their PB average" value={`${opponentProfile.personal_bests[selectedEvent].average}s`} />
                  )}
                </div>
              )}
              {opponentResults.n_results > 0 ? (
                <p className="text-gray-400 text-xs mt-1">
                  {opponentResults.n_results} competition result{opponentResults.n_results !== 1 ? 's' : ''} for {EVENT_LABELS[selectedEvent]} ·
                  Best avg: {opponentResults.best_average}s · Mean avg: {opponentResults.mean_average}s
                </p>
              ) : (
                <p className="text-yellow-400 text-xs mt-1">No {EVENT_LABELS[selectedEvent]} competition results found for this competitor.</p>
              )}
            </div>
          )}

          {opponentResults && opponentResults.n_results > 0 && (
            <>
              <div className="flex items-center gap-3">
                <label className="text-gray-400 text-sm shrink-0">Use last N of your solves</label>
                <input type="number" min="5" value={h2hRecentN} onChange={(e) => setH2hRecentN(e.target.value)}
                  placeholder="all"
                  className="bg-gray-700 text-white text-sm px-3 py-2 rounded-lg outline-none w-24" />
              </div>
              <button onClick={runH2H} disabled={h2hLoading}
                className="px-5 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm rounded-lg transition w-fit">
                {h2hLoading ? 'Simulating...' : '🎲 Run Head-to-Head (10,000 trials)'}
              </button>
              {h2hError && <p className="text-red-400 text-xs">{h2hError}</p>}
            </>
          )}

          {h2hResult && (
            <>
              <Banner
                tone={h2hResult.tone}
                title={h2hResult.your_win_probability >= 50
                  ? `You win ${h2hResult.your_win_probability}% of the time`
                  : `${opponentProfile?.name ?? 'Opponent'} wins ${h2hResult.their_win_probability}% of the time`}
                text={h2hResult.interpretation}
              />
              <div className="mt-2">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>You</span>
                  <span>{opponentProfile?.name ?? 'Opponent'}</span>
                </div>
                <div className="flex h-5 rounded-full overflow-hidden">
                  <div className="bg-blue-500 transition-all" style={{ width: `${h2hResult.your_win_probability}%` }} />
                  <div className="bg-orange-500 transition-all" style={{ width: `${h2hResult.their_win_probability}%` }} />
                </div>
                <div className="flex justify-between text-xs mt-1">
                  <span className="text-blue-400 font-bold">{h2hResult.your_win_probability}%</span>
                  <span className="text-orange-400 font-bold">{h2hResult.their_win_probability}%</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-8 gap-y-2 mt-2">
                <StatRow label="Your expected avg" value={`${h2hResult.your_expected_average}s`} />
                <StatRow label="Their expected avg" value={`${h2hResult.their_expected_average}s`} />
                <StatRow label="Expected diff" value={`${h2hResult.expected_diff > 0 ? '+' : ''}${h2hResult.expected_diff}s`} />
                <StatRow label="Their comp results used" value={h2hResult.their_n_comps} />
                <StatRow label="Simulations run" value={h2hResult.n_simulations.toLocaleString()} />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Note: their averages are sampled from competition history, which may be sparser and noisier than your training data.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function WCAPanel({ session, rawSolves = [] }) {
  const [activeTab, setActiveTab] = useState('competition')

  return (
    <div className="bg-gray-800 rounded-xl p-6 mt-4">
      <h2 className="text-lg font-semibold text-white mb-1">🏆 WCA Comparison</h2>
      <p className="text-gray-500 text-xs mb-4">
        Compare your training data against real WCA competitions and competitors.
      </p>
      <div className="flex gap-2 mb-6">
        {[
          { id: 'competition', label: '🏅 Competition' },
          { id: 'profile', label: '👤 Profile' },
        ].map(({ id, label }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`px-4 py-2 text-sm rounded-lg transition ${
              activeTab === id ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}>
            {label}
          </button>
        ))}
      </div>
      {activeTab === 'competition' && <CompetitionTab session={session} rawSolves={rawSolves} />}
      {activeTab === 'profile' && <ProfileTab session={session} rawSolves={rawSolves} />}
    </div>
  )
}