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
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Tooltip,
  Legend,
  Filler,
  zoomPlugin
)

function SolveChart({ solves }) {
  const data = {
    labels: solves.map((solve, idx) => `Solve ${idx + 1}`),
    datasets: [
      {
        label: 'Solve Time (s)',
        data: solves.map((solve) => solve.Time),
        backgroundColor: '#000000',
        pointBackgroundColor: 'black',
        pointBorderColor: 'blue',
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
      tooltip: {
        callbacks: {
          label: (context) => {
            const solve = solves[context.dataIndex]
              return [
                `Time: ${solve.Time}s`,
                `Scramble: ${solve.Scramble}`,
          ]
        },
      },
    },
    zoom: {
      pan: {
        enabled: true,
        mode: 'x',
    },
      zoom: {
        wheel: {
          enabled: true,
          modifierKey: 'ctrl',
    },
    mode: 'x',
  },
}
  },
  scales: {
    y: {
      beginAtZero: false,
    },
  },
}

  return (
  <div className="px-6 w-full">
    <div className="mx-auto" style={{ maxWidth: '2400px', height: '800px' }}>
      <Line data={data} options={options} />
    </div>
  </div>
)
}

export default SolveChart