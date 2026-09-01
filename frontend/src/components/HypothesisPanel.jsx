import { useState, useMemo } from 'react'
import axios from 'axios'
import { computeAoXTimes } from '../lib/aox'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

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

export default function HypothesisPanel({ rawSolves = [], allSessions = [], activeTest }) {
  const [inputTime, setInputTime] = useState('')
  const [bootstrapTarget, setBootstrapTarget] = useState('')
  const [sessionA, setSessionA] = useState(0)
  const [sessionB, setSessionB] = useState(1)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [includeDnf, setIncludeDnf] = useState(false)
  const [analysisMode, setAnalysisMode] = useState('single')
  const [analysisAoX, setAnalysisAoX] = useState(5)
  const [analysisAoXInput, setAnalysisAoXInput] = useState('5')

  // Base raw solves — with or without DNF
  const baseSolves = includeDnf
    ? rawSolves.filter((s) => s.time !== null)
    : rawSolves.filter((s) => s.penalty !== 'dnf' && s.time !== null)

  // Compute validTimes based on analysisMode
  const validTimes = useMemo(() => {
    if (analysisMode === 'single') {
      return baseSolves.map((s) => s.time).filter(Boolean)
    }
    const x = analysisMode === 'ao5' ? 5 : analysisMode === 'ao12' ? 12 : analysisAoX
    return computeAoXTimes(baseSolves, x).filter((v) => v !== null)
  }, [analysisMode, analysisAoX, baseSolves])

  const solveCount = analysisMode === 'ao5' ? 5 : analysisMode === 'ao12' ? 12 : analysisMode === 'single' ? 1 : analysisAoX
  const modeLabel = analysisMode === 'single' ? 'single times'
    : analysisMode === 'ao5' ? 'Ao5 averages'
    : analysisMode === 'ao12' ? 'Ao12 averages'
    : `Ao${analysisAoX} averages`

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
    if (activeTest === 'outlier') post(`${API}/hypothesis/outlier/?time=${inputTime}`, validTimes)
    else if (activeTest === 'changepoints') {
      post(`${API}/analysis/changepoints/`, validTimes)
    }
    else if (activeTest === 'bootstrap') {
      if (analysisMode === 'single') {
        post(`${API}/analysis/bootstrap/?target=${bootstrapTarget}`, validTimes)
      } else {
        post(`${API}/analysis/bootstrap-average/`, {
          times: baseSolves.map((s) => s.time).filter(Boolean),
          target: parseFloat(bootstrapTarget),
          solve_count: solveCount,
          n_resamples: 10000,
        })
      }
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
    if (activeTest === 'outlier') return !!inputTime
    if (activeTest === 'bootstrap') return !!bootstrapTarget
    if (activeTest === 'abtest') return allSessions.length >= 2 && sessionA !== sessionB
    return true
  }

  return (
    <div className="bg-gray-800 rounded-xl p-6 mt-4">
      <h2 className="text-lg font-semibold text-white mb-1">Statistical Analysis</h2>

      {/* Data mode selector */}
      <div className="flex flex-col gap-2 mb-4">
        <div className="flex items-center justify-between">
          <p className="text-gray-500 text-xs">
            Analyzing: <span className="text-gray-300">{modeLabel}</span>
            {' '}· {validTimes.length.toLocaleString()} data points
          </p>
          <button
            onClick={() => { setIncludeDnf(!includeDnf); setResult(null) }}
            className={`text-xs px-3 py-1 rounded-lg transition shrink-0 ml-3 ${
              includeDnf ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {includeDnf ? '✓ DNF included' : 'Include DNF'}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'single', label: 'Single' },
            { id: 'ao5', label: 'Ao5' },
            { id: 'ao12', label: 'Ao12' },
            { id: 'custom', label: 'AoX' },
          ].map(({ id, label }) => (
            <button key={id}
              onClick={() => { setAnalysisMode(id); setResult(null) }}
              className={`text-xs px-3 py-1.5 rounded-lg transition ${
                analysisMode === id ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}>
              {label}
            </button>
          ))}
          {analysisMode === 'custom' && (
            <input
              type="number" min="3" max="1000"
              value={analysisAoXInput}
              onChange={(e) => {
                setAnalysisAoXInput(e.target.value)
                const val = parseInt(e.target.value)
                if (val >= 3) setAnalysisAoX(val)
              }}
              className="bg-gray-700 text-white text-xs px-2 py-1.5 rounded-lg outline-none w-16"
            />
          )}
        </div>
      </div>

      {/* Forms */}
      {activeTest === 'outlier' && (
        <div className="flex flex-col gap-3">
          <p className="text-gray-400 text-sm">
            Test whether a specific time is statistically unusual given your {modeLabel}.
          </p>
          <ReadMore>
  <p className="mb-2"><strong className="text-gray-300">What it does:</strong> Compares the time you enter against your whole solve history and computes exactly what fraction of your solves are at least that extreme.</p>
  <p className="mb-2"><strong className="text-gray-300">The p-value:</strong> Two-tailed. If p &lt; 0.05, the time is a statistical outlier — it would rarely happen given your normal performance. If p is large, it's within your normal range.</p>
  <p className="mb-2"><strong className="text-gray-300">One-tail p:</strong> Only tests the relevant direction — use it if you specifically want "is this unusually fast?"</p>
  <p className="mb-2"><strong className="text-gray-300">Percentile:</strong> Fraction of your solves at or below this time. A PB sits near 0%, a disaster near 100%.</p>
  <p><strong className="text-gray-300">Example:</strong> You enter your PB of 5.22s. 0.1% of your solves are that fast → two-tailed p = 0.002 → a genuine statistical outlier.</p>
</ReadMore>
          <div className="flex items-center gap-3">
            <label className="text-gray-400 text-sm shrink-0">Time (s)</label>
            <input type="number" step="0.01" value={inputTime} onChange={(e) => setInputTime(e.target.value)}
              placeholder="e.g. 7.5"
              className="bg-gray-700 text-white text-sm px-3 py-2 rounded-lg outline-none w-32" />
          </div>
        </div>
      )}

      {activeTest === 'changepoints' && (
        <div className="flex flex-col gap-3">
          <p className="text-gray-400 text-sm">
            Automatically detect when your {modeLabel} significantly shifted over time.
          </p>
          <ReadMore>
  <p className="mb-2"><strong className="text-gray-300">What it does:</strong> Uses the PELT algorithm (Pruned Exact Linear Time) to find points in your solve history where your performance level genuinely shifted — learning a new method, ramping up practice, hitting a plateau.</p>
  <p className="mb-2"><strong className="text-gray-300">How PELT works:</strong> It searches over every way to divide your solves into segments and picks the one minimizing total within-segment variance. Each extra breakpoint costs a penalty, so one is only added when the shift is large enough to justify it.</p>
  <p className="mb-2"><strong className="text-gray-300">The penalty:</strong> Scales with log(n) and the estimated solve-to-solve noise (measured from successive differences, which isn't inflated by the shifts themselves). This is a BIC-style criterion — it flags genuine phase changes, not random noise.</p>
  <p className="mb-2"><strong className="text-gray-300">In Ao5 mode:</strong> Changepoints on Ao5 data are cleaner — they smooth out individual lucky/unlucky solves and reveal shifts in your average level.</p>
  <p><strong className="text-gray-300">Caveat:</strong> Breakpoints are statistical, not guaranteed to match real events. The most meaningful result is when a boundary lines up with something you actually remember.</p>
</ReadMore>
        </div>
      )}

      {activeTest === 'bootstrap' && (
        <div className="flex flex-col gap-3">
          <p className="text-gray-400 text-sm">
            Estimate your true probability of going sub-X on your {modeLabel}, with a 95% confidence interval.
          </p>
          <ReadMore>
  <p className="mb-2"><strong className="text-gray-300">Single mode:</strong> Counts what fraction of your individual solves are under the target, then puts a <strong className="text-gray-300">Wilson score interval</strong> around that rate. Wilson stays sensible even when the rate is near 0% or 100% — with 0 sub-8 solves it still gives a real upper bound instead of claiming "exactly 0%".</p>
  <p className="mb-2"><strong className="text-gray-300">Average mode (Ao5/Ao12/AoX):</strong> Simulates full averages by sampling the right number of solves 10,000 times, applying WCA trimming (drop best and worst for Ao5/Ao12), and checking how often the result beats the target. More realistic for competition prep — "how often would I get a sub-10s Ao5?"</p>
  <p className="mb-2"><strong className="text-gray-300">Why not just count?</strong> The raw rate has uncertainty, especially with fewer solves. The interval quantifies it: a CI of [22%, 28%] means you can be 95% confident your true rate is in that range.</p>
  <p><strong className="text-gray-300">Example:</strong> Sub-8.9 rate is 25.5%, CI [24.8%, 26.3%] — tight, because 13,000 solves give a precise estimate. With 200 solves it might be [18%, 33%].</p>
</ReadMore>
          <div className="flex items-center gap-3">
            <label className="text-gray-400 text-sm shrink-0">Target time (s)</label>
            <input type="number" step="0.01" value={bootstrapTarget}
              onChange={(e) => setBootstrapTarget(e.target.value)}
              placeholder={analysisMode === 'single' ? 'e.g. 8.9' : 'e.g. 10.5'}
              className="bg-gray-700 text-white text-sm px-3 py-2 rounded-lg outline-none w-32" />
          </div>
          {analysisMode !== 'single' && (
            <p className="text-gray-500 text-xs">
              Simulating {modeLabel} from {baseSolves.length.toLocaleString()} raw singles
            </p>
          )}
        </div>
      )}

      {activeTest === 'abtest' && (
        <div className="flex flex-col gap-3">
          <p className="text-gray-400 text-sm">
            Compare two uploaded sessions statistically — Welch's t-test, Mann-Whitney U, Cohen's d effect size, and bootstrap CI on the difference in means.
          </p>
          <ReadMore>
  <p className="mb-2"><strong className="text-gray-300">When to use it:</strong> You have two different sessions — maybe before and after changing your method, or two different practice styles — and want to know if the difference in means is real or just random variation.</p>
  <p className="mb-2"><strong className="text-gray-300">Welch's t-test:</strong> Tests whether the means of the two sessions are significantly different. Unlike the standard t-test, Welch's accounts for different sample sizes and variances between sessions — important since your sessions likely have different numbers of solves.</p>
  <p className="mb-2"><strong className="text-gray-300">Mann-Whitney U:</strong> A non-parametric alternative that doesn't assume normal distribution. It tests whether one session's times tend to be faster than the other. More robust when solve times are skewed, which they usually are.</p>
  <p className="mb-2"><strong className="text-gray-300">Cohen's d:</strong> Effect size — even if the difference is statistically significant, is it practically meaningful? Small (d &lt; 0.2) means barely noticeable, medium (0.2–0.8) means clearly different, large (d &gt; 0.8) means a very substantial difference in performance.</p>
  <p className="mb-2"><strong className="text-gray-300">Bootstrap CI:</strong> 10,000 resamples to estimate the true difference in means with a 95% confidence interval. If the CI doesn't include 0, the difference is statistically significant.</p>
  <p><strong className="text-gray-300">Example:</strong> Session A mean 9.8s vs Session B mean 9.2s, p = 0.003, Cohen's d = 0.4 (medium). The 0.6s difference is both statistically significant and practically meaningful — Session B represents a real improvement.</p>
</ReadMore>
          {allSessions.length < 2 ? (
            <p className="text-yellow-400 text-sm">Upload at least 2 sessions to use A/B testing.</p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <label className="text-gray-400 text-sm shrink-0 w-24">Session A</label>
                <select value={sessionA} onChange={(e) => setSessionA(Number(e.target.value))}
                  className="bg-gray-700 text-white text-sm px-3 py-2 rounded-lg outline-none flex-1">
                  {allSessions.map((s, i) => <option key={i} value={i}>{s.name}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-gray-400 text-sm shrink-0 w-24">Session B</label>
                <select value={sessionB} onChange={(e) => setSessionB(Number(e.target.value))}
                  className="bg-gray-700 text-white text-sm px-3 py-2 rounded-lg outline-none flex-1">
                  {allSessions.map((s, i) => <option key={i} value={i}>{s.name}</option>)}
                </select>
              </div>
              {sessionA === sessionB && <p className="text-yellow-400 text-xs">Select two different sessions.</p>}
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
          <Banner tone="info"
            title={result.ao_label
              ? `Sub-${result.target}s ${result.ao_label} Probability`
              : `Sub-${result.target}s Probability`}
            text={result.interpretation}
          />
          <div className="mt-4 mb-2">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Unlikely</span><span>Possible</span><span>Likely</span><span>Very Likely</span>
            </div>
            <div className="relative h-4 rounded-full overflow-hidden" style={{
              background: 'linear-gradient(to right, #ef4444, #f97316, #eab308, #84cc16, #22c55e)'
            }}>
              <div className="absolute top-0 w-3 h-4 rounded-full border-2 border-white shadow-lg"
                style={{
                  left: `calc(${Math.min(result.empirical_rate * 100 * 2, 100)}% - 6px)`,
                  backgroundColor: '#fff',
                  transition: 'left 0.3s ease',
                }} />
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
            <StatRow label="Sub-X rate" value={`${(result.empirical_rate * 100).toFixed(1)}%`} />
            <StatRow label="Sub-X count" value={`${result.empirical_count.toLocaleString()} / ${(result.n_resamples ?? result.n_solves).toLocaleString()}`} />
            {result.ao_label ? (
              <>
                <StatRow label="95% CI lower" value={`${result.ci_low}s`} />
                <StatRow label="95% CI upper" value={`${result.ci_high}s`} />
                <StatRow label="Mean simulated avg" value={`${result.mean_simulated_avg}s`} />
                <StatRow label="Std dev of avgs" value={`${result.bootstrap_std}s`} />
              </>
            ) : (
              <>
                <StatRow label="95% CI lower (Wilson)" value={`${(result.ci_low * 100).toFixed(1)}%`} />
                <StatRow label="95% CI upper (Wilson)" value={`${(result.ci_high * 100).toFixed(1)}%`} />
                <StatRow label="Standard error" value={`${(result.bootstrap_std * 100).toFixed(2)}%`} />
              </>
            )}
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
            <StatRow label="Mean" value={`${result.session_mean}s`} />
            <StatRow label="Percentile" value={`${result.percentile}%`} />
            <StatRow label="Std dev" value={`${result.session_std}s`} />
            <StatRow label="P-value (two-tailed)" value={result.p_value} />
            <StatRow label="One-tail p" value={result.one_tail_p} />
            <StatRow label="Solves compared" value={result.n_solves.toLocaleString()} />
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
