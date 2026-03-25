import { useState } from 'react'
import {
  Chart as ChartJS,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import zoomPlugin from 'chartjs-plugin-zoom'
import { Line } from 'react-chartjs-2'

ChartJS.register(
  LineElement, CategoryScale, LinearScale,
  PointElement, Tooltip, Legend, Filler, zoomPlugin
)

function SolveModal({ solve, onClose }) {
  if (!solve) return null

  const penaltyLabel = solve.penalty === 'dnf' ? 'DNF' : solve.penalty === 'plus2' ? '+2' : 'Normal'
  const penaltyColor = solve.penalty === 'dnf' ? 'text-red-400' : solve.penalty === 'plus2' ? 'text-yellow-400' : 'text-green-400'

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
          <h2 className="text-2xl font-bold text-white">Solve #{solve.solveNumber}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
        </div>

        <div className="flex flex-col gap-3 text-sm">
          {[
            { label: 'Time', value: `${solve.time}s` },
            { label: 'Penalty', value: penaltyLabel, className: penaltyColor },
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

function SolveChart({ solves, showAo5, showAo12, chartType }) {
  const [selectedSolve, setSelectedSolve] = useState(null)

  const pointColors = solves.map((s) => {
    if (s.penalty === 'dnf') return '#ef4444'
    if (s.penalty === 'plus2') return '#eab308'
    return '#93c5fd'
  })

  const baseDataset = {
    label: 'Time (s)',
    data: solves.map((s) => s.time),
    borderColor: chartType === 'none' ? 'transparent' : '#1d4ed8',
    backgroundColor: 'transparent',
    pointBackgroundColor: chartType === 'none' ? 'transparent' : pointColors,
    pointBorderColor: 'transparent',
    pointRadius: chartType === 'none' ? 0 : 3,
    pointHoverRadius: chartType === 'none' ? 0 : 6,
    tension: 0.3,
    showLine: chartType !== 'none',
  }

  const datasets = [baseDataset]

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

  const options = {
    maintainAspectRatio: false,
    responsive: true,
    onClick: (event, elements) => {
      if (elements.length > 0 && elements[0].datasetIndex === 0) {
        const index = elements[0].index
        setSelectedSolve(solves[index])
      }
    },
    plugins: {
      legend: { labels: { color: '#d1d5db' } },
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
      <div className="w-full" style={{ height: '70vh' }}>
        <Line data={data} options={options} />
      </div>
    </>
  )
}

export default SolveChart