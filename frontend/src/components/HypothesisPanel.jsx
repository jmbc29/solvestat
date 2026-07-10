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

function ReadMore({ children }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="text-xs text-blue-400 hover:text-blue-300 transition"
      >
        {open ? '▲ Hide explanation' : '▼ How does this work?'}
      </button>
      {open && (
        <div className="mt-2 text-xs text-gray-400 bg-gray-900 rounded-lg p-3 leading-relaxed">
          {children}
        </div>
      )}
    </div>
  )
}

export default function HypothesisPanel({ session, allSessions = [], activeTest }) {
  const [target, setTarget] = useState('')
  const [inputTime, setInputTime] = useState('')
  const [subX, setSubX] = useState('')
  const [trendTarget, setTrendTarget] = useState('')
  const [bootstrapTarget, setBootstrapTarget] = useState('')
  const [sessionA, setSessionA] = useState(0)
  const [sessionB, setSessionB] = useState(1)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [includeDnf, setIncludeDnf] = useState(false)

  const validSolves = includeDnf
    ? session.solves
    : session.solves.filter((s) => s.penalty !== 'dnf')
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
    else if (activeTest === 'bootstrap') {
      post(`${API}/analysis/bootstrap/?target=${bootstrapTarget}`, validTimes)
    }
    else if (activeTest === 'abtest') {
      const sA = allSessions[sessionA]
      const sB = allSessions[sessionB]
      if (!sA || !sB) return
      const timesA = sA.solves.filter((s) => s.penalty !== 'dnf').map((s) => s.time)
      const timesB = sB.solves.filter((s) => s.penalty !== 'dnf').map((s) => s.time)
      post(`${API}/analysis/ab-test/`, {
        times_a: timesA,
        times_b: timesB,
        name_a: sA.name,
        name_b: sB.name,
      })
    }
  }

  const canRun = () => {
    if (activeTest === 'onesample') return !!target
    if (activeTest === 'outlier') return !!inputTime
    if (activeTest === 'bootstrap') return !!bootstrapTarget
    if (activeTest === 'abtest') return allSessions.length >= 2 && sessionA !== sessionB
    return true
  }

  return (
    <div className="bg-gray-800 rounded-xl p-6 mt-4">
      <h2 className="text-lg font-semibold text-white mb-1">Statistical Analysis</h2>
      <div className="flex items-center justify-between mb-4">
        <p className="text-gray-500 text-xs">
          {includeDnf ? 'DNF times included in analysis' : 'DNF solves are excluded from analysis'}
        </p>
        <button
          onClick={() => setIncludeDnf(!includeDnf)}
          className={`text-xs px-3 py-1 rounded-lg transition ${
            includeDnf ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          {includeDnf ? '✓ DNF solves included' : 'Include DNF solves'}
        </button>
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
            Test whether a specific solve time is statistically unusual given your history.
          </p>
          <ReadMore>
            <p className="mb-2"><strong className="text-gray-300">What it does:</strong> Takes your solve history and randomly draws 10,000 times from it. It then asks: how often does a random draw land as extreme as the time you entered?</p>
            <p className="mb-2"><strong className="text-gray-300">The p-value:</strong> If p is small (under 0.05), the time is a statistical outlier — it would rarely happen by chance given your normal performance. If p is large, the time is within your normal range.</p>
            <p className="mb-2"><strong className="text-gray-300">Two-tailed vs one-tail:</strong> Two-tailed tests both directions (unusually fast OR slow). One-tail only tests the relevant direction (fast if the time is below your mean, slow if above).</p>
            <p><strong className="text-gray-300">Example:</strong> You enter your PB of 5.22s. Only 0.1% of random draws from your history are that fast → p = 0.002 → this is a genuine statistical outlier, not a typical solve.</p>
          </ReadMore>
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
        <div className="flex flex-col gap-3">
          <p className="text-gray-400 text-sm">
            Automatically detect when your performance significantly shifted over time.
          </p>
          <ReadMore>
            <p className="mb-2"><strong className="text-gray-300">What it does:</strong> Uses the PELT algorithm (Pruned Exact Linear Time) to find points in your solve history where your performance level genuinely changed — e.g. when you learned a new method or hit a breakthrough.</p>
            <p className="mb-2"><strong className="text-gray-300">How PELT works:</strong> It divides your solves into segments and finds the segmentation that minimizes total variance within each segment. Every new breakpoint costs a penalty, so it only adds one if the performance shift is large enough to justify it.</p>
            <p className="mb-2"><strong className="text-gray-300">Different from clustering:</strong> PELT respects time order — segments are always consecutive solves. It's asking "when did you become a different solver?" not "which solves are similar?"</p>
            <p><strong className="text-gray-300">Caveat:</strong> The breakpoints are statistical, not guaranteed to match real events. The most meaningful result is when a detected phase boundary lines up with something you actually remember — learning F2L, practicing more consistently, etc.</p>
          </ReadMore>
        </div>
      )}

      {activeTest === 'bootstrap' && (
        <div className="flex flex-col gap-3">
          <p className="text-gray-400 text-sm">
            Estimate your true probability of going sub-X, with a 95% confidence interval.
          </p>
          <ReadMore>
            <p className="mb-2"><strong className="text-gray-300">What it does:</strong> Takes your solve history and resamples it 10,000 times (with replacement) to estimate how often you go sub-X.</p>
            <p className="mb-2"><strong className="text-gray-300">Why not just count?</strong> You could simply count what fraction of your solves are sub-X — that's the empirical rate. But that number has uncertainty. Bootstrap quantifies that uncertainty as a 95% confidence interval.</p>
            <p className="mb-2"><strong className="text-gray-300">Example:</strong> Your sub-8.9 rate is 25.5%. The bootstrap CI is [24.8%, 26.3%] — meaning you're 95% confident your true rate is in that range.</p>
            <p><strong className="text-gray-300">Bootstrap SE:</strong> The standard error — how much your rate would typically vary across different sets of solves. Smaller SE = more precise estimate.</p>
          </ReadMore>
          <div className="flex items-center gap-3">
            <label className="text-gray-400 text-sm shrink-0">Target time (s)</label>
            <input type="number" step="0.01" value={bootstrapTarget}
              onChange={(e) => setBootstrapTarget(e.target.value)}
              placeholder="e.g. 8.9"
              className="bg-gray-700 text-white text-sm px-3 py-2 rounded-lg outline-none w-32" />
          </div>
        </div>
      )}

      {activeTest === 'abtest' && (
        <div className="flex flex-col gap-3">
          <p className="text-gray-400 text-sm">
            Compare two uploaded sessions statistically — Welch's t-test, Mann-Whitney U, Cohen's d effect size, and bootstrap CI on the difference in means.
          </p>
          <ReadMore>
            <p className="mb-2"><strong className="text-gray-300">Welch's t-test:</strong> Tests whether the means of the two sessions are significantly different, accounting for different sample sizes and variances.</p>
            <p className="mb-2"><strong className="text-gray-300">Mann-Whitney U:</strong> A non-parametric test that doesn't assume normal distribution — more robust to skewed solve time distributions.</p>
            <p className="mb-2"><strong className="text-gray-300">Cohen's d:</strong> Effect size — even if the difference is significant, is it practically meaningful? Small (&lt;0.2), medium (0.2–0.8), or large (&gt;0.8).</p>
            <p><strong className="text-gray-300">Bootstrap CI:</strong> 10,000 resamples to estimate the true difference in means with a 95% confidence interval.</p>
          </ReadMore>
          {allSessions.length < 2 ? (
            <p className="text-yellow-400 text-sm">Upload at least 2 sessions to use A/B testing.</p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <label className="text-gray-400 text-sm shrink-0 w-24">Session A</label>
                <select
                  value={sessionA}
                  onChange={(e) => setSessionA(Number(e.target.value))}
                  className="bg-gray-700 text-white text-sm px-3 py-2 rounded-lg outline-none flex-1"
                >
                  {allSessions.map((s, i) => (
                    <option key={i} value={i}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-gray-400 text-sm shrink-0 w-24">Session B</label>
                <select
                  value={sessionB}
                  onChange={(e) => setSessionB(Number(e.target.value))}
                  className="bg-gray-700 text-white text-sm px-3 py-2 rounded-lg outline-none flex-1"
                >
                  {allSessions.map((s, i) => (
                    <option key={i} value={i}>{s.name}</option>
                  ))}
                </select>
              </div>
              {sessionA === sessionB && (
                <p className="text-yellow-400 text-xs">Select two different sessions.</p>
              )}
            </div>
          )}
        </div>
      )}

      <button onClick={runTest} disabled={loading || !canRun()}
        className="mt-4 px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded-lg transition">
        {loading ? 'Running...' : 'Run Analysis'}
      </button>

      {error && <p className="text-red-400 text-sm mt-3">{error}</p>}

      {/* ---------- Results ---------- */}

      {result && activeTest === 'abtest' && (
        <>
          <Banner
            tone={result.is_significant ? 'good' : 'info'}
            title={result.is_significant
              ? `✓ ${result.a_faster ? result.name_a : result.name_b} is significantly faster`
              : 'No significant difference'}
            text={result.interpretation}
          />

          {/* Side by side comparison */}
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="bg-gray-900 rounded-lg p-4 flex flex-col gap-2">
              <p className="text-blue-400 text-sm font-semibold truncate">{result.name_a}</p>
              <StatRow label="Mean" value={`${result.mean_a}s`} />
              <StatRow label="Std dev" value={`${result.std_a}s`} />
              <StatRow label="Solves" value={result.n_a.toLocaleString()} />
            </div>
            <div className="bg-gray-900 rounded-lg p-4 flex flex-col gap-2">
              <p className="text-orange-400 text-sm font-semibold truncate">{result.name_b}</p>
              <StatRow label="Mean" value={`${result.mean_b}s`} />
              <StatRow label="Std dev" value={`${result.std_b}s`} />
              <StatRow label="Solves" value={result.n_b.toLocaleString()} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-2 mt-4">
            <StatRow label="Mean difference" value={`${result.observed_diff > 0 ? '+' : ''}${result.observed_diff}s`} />
            <StatRow label="Effect size (Cohen's d)" value={`${result.cohens_d} (${result.effect_label})`} />
            <StatRow label="Welch's t p-value" value={result.p_welch} />
            <StatRow label="Mann-Whitney p-value" value={result.p_mann_whitney} />
            <StatRow label="95% CI lower" value={`${result.ci_low}s`} />
            <StatRow label="95% CI upper" value={`${result.ci_high}s`} />
          </div>
        </>
      )}

      {result && activeTest === 'bootstrap' && (
        <>
          <Banner tone="info" title="Bootstrap Sub-X Probability" text={result.interpretation} />

          <div className="mt-4 mb-2">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Unlikely</span>
              <span>Possible</span>
              <span>Likely</span>
              <span>Very Likely</span>
            </div>
            <div className="relative h-4 rounded-full overflow-hidden" style={{
              background: 'linear-gradient(to right, #ef4444, #f97316, #eab308, #84cc16, #22c55e)'
            }}>
              <div
                className="absolute top-0 w-3 h-4 rounded-full border-2 border-white shadow-lg"
                style={{
                  left: `calc(${Math.min(result.empirical_rate * 100 * 2, 100)}% - 6px)`,
                  backgroundColor: '#fff',
                  transition: 'left 0.3s ease',
                }}
              />
            </div>
            <div className="text-center mt-2">
              <span className="text-lg font-bold" style={{
                color: result.empirical_rate < 0.1 ? '#ef4444'
                  : result.empirical_rate < 0.25 ? '#f97316'
                  : result.empirical_rate < 0.4 ? '#eab308'
                  : result.empirical_rate < 0.6 ? '#84cc16'
                  : '#22c55e'
              }}>
                {result.empirical_rate < 0.1 ? 'Unlikely'
                  : result.empirical_rate < 0.25 ? 'Possible'
                  : result.empirical_rate < 0.4 ? 'Likely!'
                  : result.empirical_rate < 0.6 ? 'Very Likely!'
                  : 'Almost Certain!'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-2 mt-4">
            <StatRow label="Empirical rate" value={`${(result.empirical_rate * 100).toFixed(1)}%`} />
            <StatRow label="Sub-X count" value={`${result.empirical_count} / ${result.n_solves}`} />
            <StatRow label="95% CI lower" value={`${(result.ci_low * 100).toFixed(1)}%`} />
            <StatRow label="95% CI upper" value={`${(result.ci_high * 100).toFixed(1)}%`} />
            <StatRow label="Bootstrap SE" value={`${(result.bootstrap_std * 100).toFixed(2)}%`} />
          </div>
        </>
      )}

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
            title={result.is_outlier
              ? `⚠️ Statistically unusual (${result.direction === 'fast' ? 'unusually fast' : 'unusually slow'})`
              : '✓ Within normal range'}
            text={result.interpretation}
          />
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 mt-4">
            <StatRow label="Input time" value={`${result.input_time}s`} />
            <StatRow label="Session mean" value={`${result.session_mean}s`} />
            <StatRow label="Percentile" value={`${result.percentile}%`} />
            <StatRow label="Std dev" value={`${result.session_std}s`} />
            <StatRow label="P-value (two-tailed)" value={result.p_value} />
            <StatRow label="One-tail p" value={result.one_tail_p} />
            <StatRow label="Permutations" value={result.n_permutations.toLocaleString()} />
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
    </div>
  )
}