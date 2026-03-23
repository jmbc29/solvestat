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

function SolveChart({ solves }) {
  const pointColors = solves.map((s) => {
    if (s.penalty === 'dnf') return '#ef4444'
    if (s.penalty === 'plus2') return '#eab308'
    return '#93c5fd'
  })

  const data = {
    labels: solves.map((_, idx) => idx + 1),
    datasets: [
      {
        label: 'Time (s)',
        data: solves.map((s) => s.time),
        borderColor: '#1d4ed8',
        backgroundColor: 'rgba(29, 78, 216, 0.1)',
        pointBackgroundColor: pointColors,
        pointBorderColor: pointColors,
        pointRadius: 3,
        pointHoverRadius: 6,
        tension: 0.3,
      },
    ],
  }

  const options = {
    maintainAspectRatio: false,
    responsive: true,
    plugins: {
      legend: {
        labels: {
          color: '#d1d5db',
        },
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const solve = solves[context.dataIndex]
            const penaltyLabel = solve.penalty === 'dnf' ? ' [DNF]' : solve.penalty === 'plus2' ? ' [+2]' : ''
            return [`Time: ${solve.time}s${penaltyLabel}`, `Scramble: ${solve.scramble}`]
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
    <div className="w-full" style={{ height: '400px' }}>
      <Line data={data} options={options} />
    </div>
  )
}

export default SolveChart