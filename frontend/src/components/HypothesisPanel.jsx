import { useState } from 'react'
import axios from 'axios'

function ResultCard({ result, type }) {
  if (!result) return null
  const isGood = type === 'onesample' ? result.is_significant : result.is_outlier
  const color = isGood ? 'border-yellow-500' : 'border-green-500'

  return (
    <div className={`border-l-4 ${color} bg-gray-900 rounded-lg p-4 mt-4 flex flex-col gap-2`}>
      <p className={`text-sm font-semibold ${isGood ? 'text-yellow-400' : 'text-green-400'}`}>
        {isGood ? '⚠️ Significant Result' : '✓ Normal Result'}
      </p>
      <p className="text-white text-sm">{result.interpretation}</p>
      <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
        {type === 'onesample' ? (
          <>
            <div className="flex justify-between"><span className="text-gray-400">Mean</span><span className="text-white">{result.mean}s</span></div>
            <div className="flex justify-between"><span className="text-gray-400">T-statistic</span><span className="text-white">{result.t_statistic}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">P-value</span><span className="text-white">{result.p_value}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">95% CI</span><span className="text-white">[{result.confidence_interval[0]}, {result.confidence_interval[1]}]</span></div>
          </>
        ) : (
          <>
            <div className="flex justify-between"><span className="text-gray-400">Input Time</span><span className="text-white">{result.input_time}s</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Session Mean</span><span className="text-white">{result.session_mean}s</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Z-score</span><span className="text-white">{result.z_score}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">P-value</span><span className="text-white">{result.p_value}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Std Dev</span><span className="text-white">{result.session_std}s</span></div>
          </>
        )}
      </div>
    </div>
  )
}

export default function HypothesisPanel({ session }) {
  const [activeTest, setActiveTest] = useState('onesample')
  const [target, setTarget] = useState('')
  const [inputTime, setInputTime] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const runTest = async () => {
    setLoading(true)
    setResult(null)
    setError(null)

    try {
      const times = session.solves.map((s) => s.time)

      if (activeTest === 'onesample') {
        const res = await axios.post(
          `http://localhost:8000/hypothesis/one-sample/?target=${target}`,
          times,
          { headers: { 'Content-Type': 'application/json' } }
        )
        setResult(res.data)
      } else {
        const res = await axios.post(
          `http://localhost:8000/hypothesis/outlier/?time=${inputTime}`,
          times,
          { headers: { 'Content-Type': 'application/json' } }
        )
        setResult(res.data)
      }
    } catch (err) {
      setError('Something went wrong. Check your input and try again.')
    }

    setLoading(false)
  }

  return (
    <div className="bg-gray-800 rounded-xl p-6 mt-4">
      <h2 className="text-lg font-semibold text-white mb-4">Hypothesis Testing</h2>

      {/* Test Tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { id: 'onesample', label: 'Sub-X Test' },
          { id: 'outlier', label: 'Outlier Test' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => { setActiveTest(t.id); setResult(null); setError(null) }}
            className={`px-4 py-2 text-sm rounded-lg transition ${
              activeTest === t.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Test Form */}
      {activeTest === 'onesample' ? (
        <div className="flex flex-col gap-3">
          <p className="text-gray-400 text-sm">Test whether your mean is significantly under a target time.</p>
          <div className="flex items-center gap-3">
            <label className="text-gray-400 text-sm shrink-0">Target time (s)</label>
            <input
              type="number"
              step="0.01"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="e.g. 10"
              className="bg-gray-700 text-white text-sm px-3 py-2 rounded-lg outline-none w-32"
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-gray-400 text-sm">Test whether a specific time is an outlier given your session data.</p>
          <div className="flex items-center gap-3">
            <label className="text-gray-400 text-sm shrink-0">Solve time (s)</label>
            <input
              type="number"
              step="0.01"
              value={inputTime}
              onChange={(e) => setInputTime(e.target.value)}
              placeholder="e.g. 7.5"
              className="bg-gray-700 text-white text-sm px-3 py-2 rounded-lg outline-none w-32"
            />
          </div>
        </div>
      )}

      <button
        onClick={runTest}
        disabled={loading || (activeTest === 'onesample' ? !target : !inputTime)}
        className="mt-4 px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded-lg transition"
      >
        {loading ? 'Running...' : 'Run Test'}
      </button>

      {error && <p className="text-red-400 text-sm mt-3">{error}</p>}

      <ResultCard result={result} type={activeTest} />
    </div>
  )
}