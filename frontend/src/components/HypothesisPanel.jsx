import { useState } from 'react'
import axios from 'axios'
import {
  Chart as ChartJS,
  LineElement,
  BarElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { Bar, Line } from 'react-chartjs-2'

ChartJS.register(LineElement, BarElement, CategoryScale, LinearScale, PointElement, Tooltip, Legend, Filler)

const API = 'http://localhost:8000'

function StatRow({ label, value }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-400">{label}</span>
      <span className="text-white">{value}</span>
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

export default function HypothesisPanel({ session }) {
  const [activeTest, setActiveTest] = useState('onesample')
  const [target, setTarget] = useState('')
  const [inputTime, setInputTime] = useState('')
  const [subX, setSubX] = useState('')
  const [trendTarget, setTrendTarget] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Exclude DNFs from statistical analysis (invalid solves)
  const validSolves = session.solves.filter((s) => s.penalty !== 'dnf')
  const validTimes = validSolves.map((s) => s.time)

  const post = async (url, body) => {
    setLoading(true)
    setResult(null)
    setError(null)
    try {
      const res = await axios.post(url, body, { headers: { 'Content-Type': 'application/json' } })
      setResult(res.data)
    } catch (err) {
      setError(err.response?.data?.detail ?? 'Something went wrong. Check your input and try again.')
    }
    setLoading(false)
  }

  const runTest = () => {
    if (activeTest === 'onesample') post(`${API}/hypothesis/one-sample/?target=${target}`, validTimes)
    else if (activeTest === 'outlier') post(`${API}/hypothesis/outlier/?time=${inputTime}`, validTimes)
    else if (activeTest === 'distribution') {
      const q = subX ? `?sub_x=${subX}` : ''
      post(`${API}/analysis/distribution/${q}`, validTimes)
    }
    else if (activeTest === 'trend') {
      const q = trendTarget ? `?target=${trendTarget}` : ''
      post(`${API}/analysis/trend/${q}`, validTimes)
    }
    else if (activeTest === 'changepoints') {
      post(`${API}/analysis/changepoints/`, validTimes)
    }
    else if (activeTest === 'scramble') {
      post(`${API}/analysis/scramble-model/`, validSolves.map((s) => ({ scramble: s.scramble, time: s.time })))
    }
    else if (activeTest === 'insights') {
      post(`${API}/analysis/insights/`, {
        name: session.name,
        times: validTimes,
        penalties: session.solves.map((s) => s.penalty),
      })
    }
  }

  const canRun = () => {
    if (activeTest === 'onesample') return !!target
    if (activeTest === 'outlier') return !!inputTime
    return true // other analyses have optional/no inputs
  }

  const tabs = [
    { id: 'onesample', label: 'Sub-X Test' },
    { id: 'outlier', label: 'Outlier Test' },
    { id: 'distribution', label: 'Distribution Fit' },
    { id: 'trend', label: 'Trend & Forecast' },
    { id: 'changepoints', label: 'Phase Detection' },
    { id: 'scramble', label: 'Scramble Model' },
    { id: 'insights', label: '✨ AI Coach' },
  ]

  return (
    <div className="bg-gray-800 rounded-xl p-6 mt-4">
      <h2 className="text-lg font-semibold text-white mb-1">Statistical Analysis</h2>
      <p className="text-gray-500 text-xs mb-4">DNF solves are excluded from analysis</p>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => { setActiveTest(t.id); setResult(null); setError(null) }}
            className={`px-4 py-2 text-sm rounded-lg transition ${
              activeTest === t.id ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Forms */}
      {activeTest === 'onesample' && (
        <div className="flex flex-col gap-3">
          <p className="text-gray-400 text-sm">
            One-sample t-test: is your mean significantly under a target? Includes a power analysis
            estimating how many solves you need for a conclusive answer.
          </p>
          <div className="flex items-center gap-3">
            <label className="text-gray-400 text-sm shrink-0">Target time (s)</label>
            <input type="number" step="0.01" value={target} onChange={(e) => setTarget(e.target.value)}
              placeholder="e.g. 10" className="bg-gray-700 text-white text-sm px-3 py-2 rounded-lg outline-none w-32" />
          </div>
        </div>
      )}

      {activeTest === 'outlier' && (
        <div className="flex flex-col gap-3">
          <p className="text-gray-400 text-sm">
            Tests a time against a lognormal distribution fit to your solves via maximum likelihood —
            statistically sounder than a z-score, since solve times are right-skewed.
          </p>
          <div className="flex items-center gap-3">
            <label className="text-gray-400 text-sm shrink-0">Solve time (s)</label>
            <input type="number" step="0.01" value={inputTime} onChange={(e) => setInputTime(e.target.value)}
              placeholder="e.g. 7.5" className="bg-gray-700 text-white text-sm px-3 py-2 rounded-lg outline-none w-32" />
          </div>
        </div>
      )}

      {activeTest === 'distribution' && (
        <div className="flex flex-col gap-3">
          <p className="text-gray-400 text-sm">
            Fits a lognormal distribution to your solve times (MLE) and overlays it on a histogram.
            Optionally estimate your probability of a sub-X solve.
          </p>
          <div className="flex items-center gap-3">
            <label className="text-gray-400 text-sm shrink-0">Sub-X probability (s, optional)</label>
            <input type="number" step="0.01" value={subX} onChange={(e) => setSubX(e.target.value)}
              placeholder="e.g. 9" className="bg-gray-700 text-white text-sm px-3 py-2 rounded-lg outline-none w-32" />
          </div>
        </div>
      )}

      {activeTest === 'trend' && (
        <div className="flex flex-col gap-3">
          <p className="text-gray-400 text-sm">
            Fits a log-linear regression to your improvement over time, with a 95% confidence band.
            Optionally forecast when you'll reach a target time.
          </p>
          <div className="flex items-center gap-3">
            <label className="text-gray-400 text-sm shrink-0">Forecast target (s, optional)</label>
            <input type="number" step="0.01" value={trendTarget} onChange={(e) => setTrendTarget(e.target.value)}
              placeholder="e.g. 9" className="bg-gray-700 text-white text-sm px-3 py-2 rounded-lg outline-none w-32" />
          </div>
        </div>
      )}

      {activeTest === 'changepoints' && (
        <p className="text-gray-400 text-sm">
          Automatically detects when your performance shifted using PELT changepoint detection —
          e.g. "you got noticeably faster around solve 2,400."
        </p>
      )}

      {activeTest === 'scramble' && (
        <p className="text-gray-400 text-sm">
          Trains ML models (Ridge regression, Random Forest) with 5-fold cross-validation to test
          whether scramble features predict your solve time — i.e. "was that PB just an easy scramble?"
        </p>
      )}

      {activeTest === 'insights' && (
        <p className="text-gray-400 text-sm">
          Sends your session statistics (mean, trend, consistency, penalty rates) to Claude and
          returns a natural-language coaching summary. Only summary stats are sent, not your raw solves.
        </p>
      )}

      <button onClick={runTest} disabled={loading || !canRun()}
        className="mt-4 px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded-lg transition">
        {loading ? (activeTest === 'insights' ? 'Thinking...' : 'Running...') : 'Run Analysis'}
      </button>

      {error && <p className="text-red-400 text-sm mt-3">{error}</p>}

      {/* ---------- Results ---------- */}

      {result && activeTest === 'onesample' && (
        <>
          <Banner
            tone={result.is_significant ? (result.is_under ? 'good' : 'warn') : 'info'}
            title={result.is_significant ? (result.is_under ? '✓ Significantly under target' : '⚠️ Significantly over target') : 'Inconclusive'}
            text={result.interpretation}
          />
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 mt-4">
            <StatRow label="Mean" value={`${result.mean}s`} />
            <StatRow label="T-statistic" value={result.t_statistic} />
            <StatRow label="P-value" value={result.p_value} />
            <StatRow label="95% CI" value={`[${result.confidence_interval[0]}, ${result.confidence_interval[1]}]`} />
            {result.required_n && <StatRow label="Solves needed (80% power)" value={result.required_n} />}
            {result.additional_solves > 0 && <StatRow label="Additional solves" value={result.additional_solves} />}
          </div>
        </>
      )}

      {result && activeTest === 'outlier' && (
        <>
          <Banner
            tone={result.is_outlier ? 'warn' : 'good'}
            title={result.is_outlier ? '⚠️ Statistical outlier' : '✓ Within normal range'}
            text={result.interpretation}
          />
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 mt-4">
            <StatRow label="Input time" value={`${result.input_time}s`} />
            <StatRow label="Percentile (lognormal)" value={`${result.percentile}%`} />
            <StatRow label="P-value" value={result.p_value} />
            <StatRow label="Session mean" value={`${result.session_mean}s`} />
            <StatRow label="Z-score (naive normal)" value={result.z_score} />
            <StatRow label="Std dev" value={`${result.session_std}s`} />
          </div>
        </>
      )}

      {result && activeTest === 'distribution' && (
        <>
          <Banner tone="info" title={`Best fit: ${result.better_fit}`} text={result.interpretation} />
          {result.sub_x && (
            <Banner tone="good" title={`Sub-${result.sub_x.target} probability`} text={result.sub_x.interpretation} />
          )}
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 mt-4 mb-6">
            <StatRow label="μ (log-scale)" value={result.mu} />
            <StatRow label="σ (log-scale)" value={result.sigma} />
            <StatRow label="Model median" value={`${result.median}s`} />
            <StatRow label="N" value={result.n} />
          </div>
          <div className="w-full" style={{ height: '320px' }}>
            <Bar
              data={{
                labels: result.histogram.bin_centers,
                datasets: [
                  {
                    type: 'bar',
                    label: 'Solve count',
                    data: result.histogram.counts,
                    backgroundColor: 'rgba(96, 165, 250, 0.45)',
                    borderWidth: 0,
                    barPercentage: 1.0,
                    categoryPercentage: 1.0,
                  },
                  {
                    type: 'line',
                    label: 'Fitted lognormal (MLE)',
                    data: result.histogram.fitted_curve,
                    borderColor: '#f97316',
                    pointRadius: 0,
                    tension: 0.3,
                  },
                ],
              }}
              options={{
                maintainAspectRatio: false,
                responsive: true,
                plugins: { legend: { labels: { color: '#d1d5db' } } },
                scales: {
                  x: { ticks: { color: '#9ca3af', maxTicksLimit: 12 }, grid: { display: false }, title: { display: true, text: 'Time (s)', color: '#9ca3af' } },
                  y: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.05)' }, title: { display: true, text: 'Count', color: '#9ca3af' } },
                },
              }}
            />
          </div>
        </>
      )}

      {result && activeTest === 'trend' && (
        <>
          <Banner
            tone={result.is_improving ? 'good' : 'info'}
            title={result.is_improving ? '✓ Statistically significant improvement' : 'Trend'}
            text={result.interpretation}
          />
          {result.forecast && (
            <Banner tone={result.forecast.reached ? 'good' : 'info'} title="Forecast" text={result.forecast.interpretation} />
          )}
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 mt-4 mb-6">
            <StatRow label="Change per 100 solves" value={`${result.pct_change_per_100}%`} />
            <StatRow label="R²" value={result.r_squared} />
            <StatRow label="P-value" value={result.p_value} />
            {result.forecast?.solves_needed && <StatRow label="Solves to target" value={result.forecast.solves_needed} />}
          </div>
          <div className="w-full" style={{ height: '320px' }}>
            <Line
              data={{
                labels: result.curve.x,
                datasets: [
                  {
                    label: '95% CI upper',
                    data: result.curve.upper,
                    borderColor: 'transparent',
                    pointRadius: 0,
                    fill: false,
                  },
                  {
                    label: '95% CI lower',
                    data: result.curve.lower,
                    borderColor: 'transparent',
                    backgroundColor: 'rgba(52, 211, 153, 0.15)',
                    pointRadius: 0,
                    fill: '-1',
                  },
                  {
                    label: 'Fitted trend',
                    data: result.curve.trend,
                    borderColor: '#34d399',
                    pointRadius: 0,
                    tension: 0.2,
                  },
                ],
              }}
              options={{
                maintainAspectRatio: false,
                responsive: true,
                plugins: { legend: { labels: { color: '#d1d5db', filter: (item) => !item.text.includes('CI') } } },
                scales: {
                  x: { ticks: { color: '#9ca3af', maxTicksLimit: 12 }, grid: { color: 'rgba(255,255,255,0.05)' }, title: { display: true, text: 'Solve number', color: '#9ca3af' } },
                  y: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.05)' }, title: { display: true, text: 'Time (s)', color: '#9ca3af' } },
                },
              }}
            />
          </div>
        </>
      )}

      {result && activeTest === 'changepoints' && (
        <>
          <Banner
            tone="info"
            title={`${result.n_segments} performance phase${result.n_segments > 1 ? 's' : ''} detected`}
            text={result.interpretation}
          />
          <div className="flex flex-col gap-2 mt-4">
            {result.segments.map((seg, i) => (
              <div key={i} className="flex justify-between items-center bg-gray-900 rounded-lg px-4 py-3 text-sm">
                <span className="text-gray-400">Solves {seg.start_solve}–{seg.end_solve} ({seg.count})</span>
                <span className="text-white font-mono">{seg.mean}s avg</span>
              </div>
            ))}
          </div>
        </>
      )}

      {result && activeTest === 'scramble' && (
        <>
          <Banner
            tone={Math.max(result.ridge_cv_r2, result.random_forest_cv_r2) < 0.02 ? 'info' : 'good'}
            title="Scramble difficulty model"
            text={result.interpretation}
          />
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 mt-4">
            <StatRow label="Ridge CV R²" value={result.ridge_cv_r2} />
            <StatRow label="Random Forest CV R²" value={result.random_forest_cv_r2} />
            <StatRow label="Solves used" value={result.n_solves} />
          </div>
          <p className="text-gray-400 text-xs uppercase tracking-widest mt-4 mb-2">Top features</p>
          <div className="flex flex-col gap-2">
            {result.top_features.map((f) => (
              <div key={f.name} className="flex items-center gap-3 text-sm">
                <span className="text-gray-400 w-36 shrink-0">{f.name}</span>
                <div className="flex-1 bg-gray-900 rounded h-2">
                  <div className="bg-blue-500 h-2 rounded" style={{ width: `${Math.max(f.importance * 100, 2)}%` }} />
                </div>
                <span className="text-white w-14 text-right">{f.importance}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {result && activeTest === 'insights' && (
        <Banner tone="good" title="✨ AI Coaching Summary" text={result.insights} />
      )}
    </div>
  )
}