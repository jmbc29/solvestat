import { useState } from 'react'
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
import zoomPlugin from 'chartjs-plugin-zoom'
import annotationPlugin from 'chartjs-plugin-annotation'
import { Line, Bar } from 'react-chartjs-2'

ChartJS.register(
  LineElement, BarElement, CategoryScale, LinearScale,
  PointElement, Tooltip, Legend, Filler, zoomPlugin, annotationPlugin
)

function SolveModal({ solve, onClose }) {
  if (!solve) return null

  const penaltyColor = (p) => p === 'dnf' ? 'text-red-400' : p === 'plus2' ? 'text-yellow-400' : 'text-white'

  if (solve.windowSolves) {
    const x = solve.windowSolves.length
    const drop = Math.ceil(0.05 * x)
    const sortedTimes = [...solve.windowSolves]
      .map((s) => s.time)
      .sort((a, b) => a - b)

    const bestCount = {}
    const worstCount = {}

    const isTrimmed = (time) => {
      const key = String(time)
      const inBest = sortedTimes.slice(0, drop).filter((t) => String(t) === key).length
      const inWorst = sortedTimes.slice(sortedTimes.length - drop).filter((t) => String(t) === key).length
      if (inBest > 0) {
        bestCount[key] = (bestCount[key] || 0) + 1
        if (bestCount[key] <= inBest) return true
      }
      if (inWorst > 0) {
        worstCount[key] = (worstCount[key] || 0) + 1
        if (worstCount[key] <= inWorst) return true
      }
      return false
    }

    return (
      <div
        className="fixed inset-0 flex items-center justify-center z-50"
        style={{ backgroundColor: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      >
        <div
          className="bg-gray-800 rounded-xl p-8 shadow-xl border border-gray-700 overflow-y-auto"
          style={{ width: '70vw', maxWidth: '900px', maxHeight: '85vh' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-2xl font-bold text-white">Ao{x} — {solve.time}s</h2>
              {solve._sessionName && (
                <p className="text-sm mt-1" style={{ color: solve._sessionColor }}>
                  {solve._sessionName}
                </p>
              )}
              <p className="text-gray-400 text-sm mt-1">
                Dropping {drop} best and {drop} worst · {x - drop * 2} solves counted
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
          </div>

          <div className="flex flex-col gap-3">
            {solve.windowSolves.map((s, i) => {
              const trimmed = isTrimmed(s.time)
              return (
                <div
                  key={i}
                  className={`rounded-lg px-4 py-3 text-sm flex flex-col gap-1 bg-gray-900 ${trimmed ? 'opacity-50' : ''}`}
                >
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">#{s.solveNumber}</span>
                    <div className="flex items-center gap-3">
                      {trimmed && <span className="text-xs text-gray-500">(Excluded)</span>}
                      <span className={`font-mono font-semibold ${penaltyColor(s.penalty)}`}>
                        {s.penalty === 'dnf' ? 'DNF' : `${s.time}s`}
                        {s.penalty === 'plus2' ? ' (+2)' : ''}
                      </span>
                    </div>
                  </div>
                  {s.scramble && <p className="text-gray-500 text-xs font-mono">{s.scramble}</p>}
                  {s.comment && <p className="text-gray-400 text-xs">💬 {s.comment}</p>}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ backgroundColor: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="bg-gray-800 rounded-xl p-8 shadow-xl border border-gray-700"
        style={{ width: '60vw', maxWidth: '800px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white">Solve #{solve.solveNumber}</h2>
            {solve._sessionName && (
              <p className="text-sm mt-1" style={{ color: solve._sessionColor }}>
                {solve._sessionName}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
        </div>

        <div className="flex flex-col gap-3 text-sm">
          {[
            { label: 'Time', value: `${solve.time}s` },
            { label: 'Penalty', value: solve.penalty === 'dnf' ? 'DNF' : solve.penalty === 'plus2' ? '+2' : 'Normal', className: penaltyColor(solve.penalty) },
            ...(solve.ao5 ? [{ label: 'Ao5', value: `${solve.ao5}s` }] : []),
            ...(solve.ao12 ? [{ label: 'Ao12', value: `${solve.ao12}s` }] : []),
            ...(solve.date ? [{ label: 'Date', value: solve.date }] : []),
            ...(solve.comment ? [{ label: 'Comment', value: solve.comment }] : []),
            { label: 'Scramble', value: solve.scramble, mono: true },
          ].map(({ label, value, className, mono }) => (
            <div key={label} className="flex justify-between items-start gap-4">
              <span className="text-gray-400 shrink-0">{label}</span>
              <span className={`text-sm text-right ${mono ? 'font-mono' : ''} ${className ?? 'text-white'}`}>
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const overlayColors = [
  'rgba(147,197,253,0.9)',
  'rgba(59,130,246,0.9)',
  'rgba(29,78,216,0.9)',
  'rgba(30,58,138,0.9)',
  'rgba(96,165,250,0.9)',
  'rgba(37,99,235,0.9)',
]

const hexToRgba = (hex, alpha) => {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function SolveChart({ solves, showAo5, showAo12, chartType, distOverlays = {}, subXTarget, isAverage = false, overlaySessions = [], dataType = 'single', customAoX = 50 }) {
  const [selectedSolve, setSelectedSolve] = useState(null)
  const [binWidth, setBinWidth] = useState(0.5)
  const [binWidthInput, setBinWidthInput] = useState('0.5')

  if (chartType === 'distribution') {
    const times = solves
      .filter((s) => s.penalty !== 'dnf')
      .map((s) => s.time)

    const safeBinWidth = binWidth >= 0.01 ? binWidth : 0.5

    const allTimes = [times, ...overlaySessions.map((s) =>
      s.solves.filter((sv) => sv.penalty !== 'dnf').map((sv) => sv.time)
    )]
    const globalMin = Math.min(...allTimes.flat())
    const globalMax = Math.max(...allTimes.flat())
    const globalNBins = Math.max(1, Math.ceil((globalMax - globalMin) / safeBinWidth))
    const globalLabels = Array.from({ length: globalNBins }, (_, i) =>
      (globalMin + i * safeBinWidth + safeBinWidth / 2).toFixed(2)
    )

    const globalBins = Array(globalNBins).fill(0)
    times.forEach((t) => {
      const i = Math.min(Math.floor((t - globalMin) / safeBinWidth), globalNBins - 1)
      globalBins[i]++
    })

    const n = times.length
    const mean = times.reduce((a, b) => a + b, 0) / n
    const sorted = [...times].sort((a, b) => a - b)
    const median = n % 2 === 0
      ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
      : sorted[Math.floor(n / 2)]
    const variance = times.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)
    const sd = Math.sqrt(variance)

    const normalCurve = globalLabels.map((center) => {
      const x = parseFloat(center)
      const pdf = (1 / (sd * Math.sqrt(2 * Math.PI))) *
        Math.exp(-((x - mean) ** 2) / (2 * sd ** 2))
      return parseFloat((pdf * n * safeBinWidth).toFixed(2))
    })

    const logTimes = times.map((t) => Math.log(t))
    const mu = logTimes.reduce((a, b) => a + b, 0) / logTimes.length
    const sigma = Math.sqrt(logTimes.reduce((a, b) => a + (b - mu) ** 2, 0) / (logTimes.length - 1))
    const lognormalCurve = globalLabels.map((center) => {
      const x = parseFloat(center)
      const pdf = (1 / (x * sigma * Math.sqrt(2 * Math.PI))) *
        Math.exp(-((Math.log(x) - mu) ** 2) / (2 * sigma ** 2))
      return parseFloat((pdf * n * safeBinWidth).toFixed(2))
    })

    const timeToLabelIndex = (t) => (t - globalMin) / safeBinWidth - 0.5

    const annotations = {
      ...(distOverlays.mean ? {
        mean: {
          type: 'line', scaleID: 'x',
          value: timeToLabelIndex(mean),
          borderColor: '#a78bfa', borderWidth: 3, borderDash: [6, 3],
          label: { content: `Mean ${mean.toFixed(2)}s`, display: true, color: '#a78bfa', backgroundColor: 'transparent', font: { size: 13 }, position: 'start' },
        }
      } : {}),
      ...(distOverlays.median ? {
        median: {
          type: 'line', scaleID: 'x',
          value: timeToLabelIndex(median),
          borderColor: '#22d3ee', borderWidth: 3, borderDash: [6, 3],
          label: { content: `Median ${median.toFixed(2)}s`, display: true, color: '#22d3ee', backgroundColor: 'transparent', font: { size: 13 }, position: 'start' },
        }
      } : {}),
      ...(distOverlays.subX && subXTarget ? {
        subX: {
          type: 'line', scaleID: 'x',
          value: timeToLabelIndex(Number(subXTarget)),
          borderColor: '#f43f5e', borderWidth: 3, borderDash: [6, 3],
          label: { content: `Sub-${subXTarget}s`, display: true, color: '#f43f5e', backgroundColor: 'transparent', font: { size: 13 }, position: 'start' },
        }
      } : {}),
      ...(distOverlays.sd ? {
        sdBand: {
          type: 'box',
          xMin: timeToLabelIndex(mean - sd),
          xMax: timeToLabelIndex(mean + sd),
          backgroundColor: 'rgba(34,197,94,0.15)',
          borderColor: 'rgba(34,197,94,0)',
          borderWidth: 0,
        },
        sdLow: {
          type: 'line', scaleID: 'x',
          value: timeToLabelIndex(mean - sd),
          borderColor: 'rgba(34,197,94,0.7)', borderWidth: 2, borderDash: [3, 3],
          label: { content: `-1SD ${(mean - sd).toFixed(2)}s`, display: true, color: 'rgba(34,197,94,0.9)', backgroundColor: 'transparent', font: { size: 12 }, position: 'end' },
        },
        sdHigh: {
          type: 'line', scaleID: 'x',
          value: timeToLabelIndex(mean + sd),
          borderColor: 'rgba(34,197,94,0.7)', borderWidth: 2, borderDash: [3, 3],
          label: { content: `+1SD ${(mean + sd).toFixed(2)}s`, display: true, color: 'rgba(34,197,94,0.9)', backgroundColor: 'transparent', font: { size: 12 }, position: 'end' },
        },
      } : {}),
    }

    const datasets = [
      {
        type: 'bar',
        label: 'Solve count',
        data: globalBins,
        backgroundColor: 'rgba(96, 165, 250, 0.5)',
        borderWidth: 0,
        barPercentage: 1.0,
        categoryPercentage: 1.0,
        order: 2,
      },
      {
        type: 'line',
        label: 'Normal fit',
        data: normalCurve,
        borderColor: '#34d399',
        pointRadius: 0,
        tension: 0.3,
        order: 1,
      },
      {
        type: 'line',
        label: 'Lognormal fit',
        data: lognormalCurve,
        borderColor: '#f97316',
        pointRadius: 0,
        tension: 0.3,
        order: 1,
      },
      ...overlaySessions.map((s, idx) => {
        const color = overlayColors[idx % overlayColors.length]
        const sTimes = s.solves.filter((sv) => sv.penalty !== 'dnf').map((sv) => sv.time)
        if (sTimes.length === 0) return null
        const sBins = Array(globalNBins).fill(0)
        sTimes.forEach((t) => {
          const i = Math.min(Math.floor((t - globalMin) / safeBinWidth), globalNBins - 1)
          sBins[i]++
        })
        // Extract rgba values for hexToRgba fallback — overlayColors are already rgba strings
        return {
          type: 'bar',
          label: s.name,
          data: sBins,
          backgroundColor: color.replace('0.9)', '0.35)'),
          borderColor: color,
          borderWidth: 1,
          barPercentage: 1.0,
          categoryPercentage: 1.0,
          order: 3,
        }
      }).filter(Boolean),
    ]

    return (
      <div className="w-full" style={{ height: '70vh' }}>
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <label className="text-gray-400 text-sm shrink-0">Bin width (s)</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            max="10"
            value={binWidthInput}
            onChange={(e) => {
              setBinWidthInput(e.target.value)
              const val = Number(e.target.value)
              if (val >= 0.01) setBinWidth(val)
            }}
            className="bg-gray-700 text-white text-sm px-3 py-2 rounded-lg outline-none w-24"
          />
          {distOverlays.mean && <span className="text-xs text-purple-400">Mean: {mean.toFixed(2)}s</span>}
          {distOverlays.median && <span className="text-xs text-cyan-400">Median: {median.toFixed(2)}s</span>}
          {distOverlays.sd && <span className="text-xs text-green-400">SD: {sd.toFixed(2)}s</span>}
        </div>
        <div style={{ height: 'calc(70vh - 48px)' }}>
          <Bar
            data={{ labels: globalLabels, datasets }}
            options={{
              maintainAspectRatio: false,
              responsive: true,
              plugins: {
                legend: { labels: { color: '#d1d5db' } },
                annotation: { annotations },
                tooltip: {
                  callbacks: {
                    label: (ctx) => ctx.dataset.type === 'line'
                      ? `${ctx.dataset.label}: ${ctx.parsed.y}`
                      : `${ctx.parsed.y} solves`,
                    title: (items) => `~${items[0].label}s`,
                  },
                },
              },
              scales: {
                x: {
                  ticks: { color: '#9ca3af', maxTicksLimit: 12 },
                  grid: { display: false },
                  title: { display: true, text: 'Time (s)', color: '#9ca3af' },
                },
                y: {
                  ticks: { color: '#9ca3af' },
                  grid: { color: 'rgba(255,255,255,0.05)' },
                  title: { display: true, text: 'Count', color: '#9ca3af' },
                },
              },
            }}
          />
        </div>
      </div>
    )
  }

  // Stats for line chart overlays (exclude DNFs)
  const validTimes = solves.filter((s) => s.penalty !== 'dnf').map((s) => s.time)
  const n = validTimes.length
  const lineMean = n > 0 ? validTimes.reduce((a, b) => a + b, 0) / n : 0
  const lineSorted = [...validTimes].sort((a, b) => a - b)
  const lineMedian = n > 0
    ? n % 2 === 0 ? (lineSorted[n / 2 - 1] + lineSorted[n / 2]) / 2 : lineSorted[Math.floor(n / 2)]
    : 0
  const lineVariance = n > 1 ? validTimes.reduce((a, b) => a + (b - lineMean) ** 2, 0) / (n - 1) : 0
  const lineSd = Math.sqrt(lineVariance)

  const lineAnnotations = {
    ...(distOverlays.mean ? {
      mean: {
        type: 'line', scaleID: 'y', value: lineMean,
        borderColor: '#a78bfa', borderWidth: 3, borderDash: [6, 3],
        label: { content: `Mean ${lineMean.toFixed(2)}s`, display: true, color: '#a78bfa', backgroundColor: 'transparent', font: { size: 13 }, position: 'start' },
      }
    } : {}),
    ...(distOverlays.median ? {
      median: {
        type: 'line', scaleID: 'y', value: lineMedian,
        borderColor: '#22d3ee', borderWidth: 3, borderDash: [6, 3],
        label: { content: `Median ${lineMedian.toFixed(2)}s`, display: true, color: '#22d3ee', backgroundColor: 'transparent', font: { size: 13 }, position: 'start' },
      }
    } : {}),
    ...(distOverlays.sd ? {
      sdBand: {
        type: 'box',
        yMin: lineMean - lineSd,
        yMax: lineMean + lineSd,
        backgroundColor: 'rgba(34,197,94,0.15)',
        borderColor: 'rgba(34,197,94,0)',
        borderWidth: 0,
      },
      sdLow: {
        type: 'line', scaleID: 'y', value: lineMean - lineSd,
        borderColor: 'rgba(34,197,94,0.7)', borderWidth: 2, borderDash: [3, 3],
        label: { content: `-1SD ${(lineMean - lineSd).toFixed(2)}s`, display: true, color: 'rgba(34,197,94,0.9)', backgroundColor: 'transparent', font: { size: 12 }, position: 'end' },
      },
      sdHigh: {
        type: 'line', scaleID: 'y', value: lineMean + lineSd,
        borderColor: 'rgba(34,197,94,0.7)', borderWidth: 2, borderDash: [3, 3],
        label: { content: `+1SD ${(lineMean + lineSd).toFixed(2)}s`, display: true, color: 'rgba(34,197,94,0.9)', backgroundColor: 'transparent', font: { size: 12 }, position: 'end' },
      },
    } : {}),
    ...(distOverlays.subX && subXTarget ? {
      subX: {
        type: 'line', scaleID: 'y', value: Number(subXTarget),
        borderColor: '#f43f5e', borderWidth: 3, borderDash: [6, 3],
        label: { content: `Sub-${subXTarget}s`, display: true, color: '#f43f5e', backgroundColor: 'transparent', font: { size: 13 }, position: 'start' },
      }
    } : {}),
  }

  // Best/worst star markers (exclude DNFs)
  const nonDnfTimes = solves.filter((s) => s.penalty !== 'dnf').map((s) => s.time).filter(Boolean)
  const bestTime = nonDnfTimes.length > 0 ? Math.min(...nonDnfTimes) : null
  const worstTime = nonDnfTimes.length > 0 ? Math.max(...nonDnfTimes) : null

  const pointStyles = solves.map((s) => {
    if (s.time === bestTime || s.time === worstTime) return 'star'
    return 'circle'
  })

  const pointSizes = solves.map((s) => {
    if (s.time === bestTime || s.time === worstTime) return 10
    return chartType === 'none' ? 0 : 3
  })

  const pointColors = solves.map((s) => {
    if (s.time === bestTime) return '#22c55e'
    if (s.time === worstTime) return '#ef4444'
    if (s.penalty === 'dnf') return '#ef4444'
    if (!isAverage && s.penalty === 'plus2') return '#eab308'
    return '#93c5fd'
  })

  const anyOverlay = distOverlays.mean || distOverlays.median || distOverlays.sd || (distOverlays.subX && subXTarget)

  const baseDataset = {
    label: 'Time (s)',
    data: solves.map((s) => s.time),
    borderColor: chartType === 'none' ? 'transparent' : anyOverlay ? 'rgba(29,78,216,0.15)' : 'rgba(29,78,216,0.35)',
    backgroundColor: 'transparent',
    pointBackgroundColor: chartType === 'none' ? 'transparent' : pointColors,
    pointBorderColor: pointColors,
    pointBorderWidth: solves.map((s) =>
      s.time === bestTime || s.time === worstTime ? 2 : 0
    ),
    pointRadius: chartType === 'none' ? 0 : pointSizes,
    pointHoverRadius: pointSizes.map((s) => s + 3),
    pointHitRadius: pointSizes.map((s) => s + 5),
    pointStyle: chartType === 'none' ? 'circle' : pointStyles,
    tension: 0,
    showLine: chartType !== 'none',
  }

  const datasets = [baseDataset]

  const computeAoXTimes = (sessionSolves, x) => {
    const drop = Math.ceil(0.05 * x)
    const result = []
    for (let i = 0; i < sessionSolves.length; i++) {
      if (i < x - 1) { result.push(null); continue }
      const window = sessionSolves.slice(i - x + 1, i + 1)
      const dnfCount = window.filter((s) => s.penalty === 'dnf').length
      if (dnfCount > drop) { result.push(null); continue }
      const times = window.map((s) => s.time).sort((a, b) => a - b)
      const trimmed = times.slice(drop, times.length - drop)
      result.push(parseFloat((trimmed.reduce((a, b) => a + b, 0) / trimmed.length).toFixed(3)))
    }
    return result
  }

  overlaySessions.forEach((s, i) => {
  const color = overlayColors[i % overlayColors.length]
  let data
  let sessionSolves
  if (dataType === 'single') {
    sessionSolves = s.solves.filter((sv) => sv.penalty !== 'dnf')
    data = sessionSolves.map((sv) => sv.time)
  } else {
    const x = dataType === 'ao5' ? 5 : dataType === 'ao12' ? 12 : customAoX
    sessionSolves = s.solves.filter((sv) => sv.penalty !== 'dnf')
    data = computeAoXTimes(sessionSolves, x)
  }

  const sessionPointColors = sessionSolves.map((sv) => {
    if (sv.penalty === 'dnf') return '#ef4444'
    if (!isAverage && sv.penalty === 'plus2') return '#eab308'
    return color
  })

  datasets.push({
    label: s.name,
    data,
    borderColor: color,
    backgroundColor: 'transparent',
    pointBackgroundColor: chartType === 'none' ? 'transparent' : sessionPointColors,
    pointBorderColor: 'transparent',
    pointRadius: chartType === 'none' ? 0 : 3,
    pointHoverRadius: 6,
    pointHitRadius: 8,
    tension: 0,
    showLine: chartType !== 'none',
    borderWidth: 1.5,
  })
})

  if (showAo5) {
    datasets.push({
      label: 'Ao5',
      data: solves.map((s) => s.ao5),
      borderColor: '#34d399',
      pointRadius: 0,
      tension: 0.3,
    })
  }

  if (showAo12) {
    datasets.push({
      label: 'Ao12',
      data: solves.map((s) => s.ao12),
      borderColor: '#f97316',
      pointRadius: 0,
      tension: 0.3,
    })
  }

  const labels = solves.map((_, idx) => idx + 1)
  const data = { labels, datasets }

  const handleClick = (event, elements) => {
    if (elements.length === 0) return
    const { datasetIndex, index } = elements[0]
    if (datasetIndex === 0) {
      setSelectedSolve({ ...solves[index], _sessionColor: '#93c5fd', _sessionName: null })
      return
    }
    const overlayIdx = datasetIndex - 1
    if (overlayIdx < overlaySessions.length) {
      const s = overlaySessions[overlayIdx]
      const color = overlayColors[overlayIdx % overlayColors.length]
      const sessionSolves = s.solves.filter((sv) => sv.penalty !== 'dnf')
      const solve = sessionSolves[index]
      if (solve) setSelectedSolve({ ...solve, _sessionColor: color, _sessionName: s.name })
    }
  }

  const options = {
    maintainAspectRatio: false,
    responsive: true,
    elements: {
      point: { pointStyle: true }
    },
    onClick: handleClick,
    plugins: {
      legend: { labels: { color: '#d1d5db' } },
      annotation: { annotations: lineAnnotations },
      tooltip: {
        callbacks: {
          label: (context) => {
            if (context.datasetIndex !== 0) {
              return `${context.dataset.label}: ${context.parsed.y?.toFixed(3) ?? 'N/A'}s`
            }
            const solve = solves[context.dataIndex]
            const penaltyLabel = solve.penalty === 'dnf' ? ' [DNF]' : solve.penalty === 'plus2' ? ' [+2]' : ''
            return `Time: ${solve.time}s${penaltyLabel}`
          },
        },
      },
      zoom: {
        pan: { enabled: true, mode: 'x' },
        zoom: {
          wheel: { enabled: true, modifierKey: 'ctrl' },
          mode: 'x',
        },
      },
    },
    scales: {
      x: {
        ticks: { color: '#9ca3af' },
        grid: { color: 'rgba(255,255,255,0.05)' },
      },
      y: {
        beginAtZero: false,
        ticks: { color: '#9ca3af' },
        grid: { color: 'rgba(255,255,255,0.05)' },
      },
    },
  }

  return (
    <>
      <SolveModal solve={selectedSolve} onClose={() => setSelectedSolve(null)} />

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mb-3 text-xs text-gray-400">
        <div className="flex items-center gap-1.5">
          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', backgroundColor: '#93c5fd' }} />
          Solve time
        </div>
        <div className="flex items-center gap-1.5">
          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', backgroundColor: '#eab308' }} />
          +2
        </div>
        <div className="flex items-center gap-1.5">
          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', backgroundColor: '#ef4444' }} />
          DNF
        </div>
        <div className="flex items-center gap-1.5">
          <span style={{ display: 'inline-block', width: 12, height: 12, clipPath: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)', backgroundColor: '#22c55e' }} />
          Best: <span className="text-white ml-1">{bestTime !== null ? `${bestTime}s` : '—'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span style={{ display: 'inline-block', width: 12, height: 12, clipPath: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)', backgroundColor: '#ef4444' }} />
          Worst: <span className="text-white ml-1">{worstTime !== null ? `${worstTime}s` : '—'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span style={{ display: 'inline-block', width: 24, height: 3, backgroundColor: '#a78bfa' }} />
          Mean: <span className="text-white ml-1">{lineMean > 0 ? `${lineMean.toFixed(3)}s` : '—'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span style={{ display: 'inline-block', width: 24, height: 3, backgroundColor: '#22d3ee' }} />
          Median: <span className="text-white ml-1">{lineMedian > 0 ? `${lineMedian.toFixed(3)}s` : '—'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span style={{ display: 'inline-block', width: 24, height: 3, backgroundColor: 'rgba(34,197,94,0.6)' }} />
          ±1 SD: <span className="text-white ml-1">{lineSd > 0 ? `${lineSd.toFixed(3)}s` : '—'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span style={{ display: 'inline-block', width: 24, height: 3, backgroundColor: '#f43f5e' }} />
          Sub-X target
        </div>
        {overlaySessions.map((s, i) => (
          <div key={s.id || i} className="flex items-center gap-1.5">
            <span style={{ display: 'inline-block', width: 24, height: 3, backgroundColor: overlayColors[i % overlayColors.length] }} />
            <span>{s.name}</span>
          </div>
        ))}
      </div>

      <div className="w-full" style={{ height: '70vh' }}>
        <Line data={data} options={options} />
      </div>
    </>
  )
}

export default SolveChart