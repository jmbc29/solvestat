import { useState } from 'react'
import UploadFile from './components/UploadFile'
import SolveChart from './components/SolveChart'
import './index.css'

function App() {
  const [solves, setSolves] = useState([])

  const handleUpload = (data) => {
    setSolves(data.solves)
  }

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-gray-900 text-white flex flex-col items-center px-4">
      <main className="flex flex-col items-center justify-center text-center space-y-6 w-full max-w-3xl">
        <h1 className="text-5xl font-extrabold">CSTIMER ANALYZER</h1>
        <p className="text-gray-300 text-sm">
          Drop your <code>.csv</code> file below to view your solve times 📊
        </p>

        <UploadFile onUpload={handleUpload} />

        {solves.length > 0 && (
          <div className="w-full bg-gray-800 p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">Solve Time Chart</h2>
            <SolveChart solves={solves} />
          </div>
        )}

        <footer className="text-xs text-gray-500 pt-6">
          Made by Jimbo • 💾 Your data stays private
        </footer>
      </main>
    </div>
  )
}

export default App