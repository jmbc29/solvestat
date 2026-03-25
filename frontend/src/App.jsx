import { useState } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import UploadFile from './components/UploadFile'
import SolveChart from './components/SolveChart'
import HypothesisPanel from './components/HypothesisPanel'
import './index.css'

function Sidebar({ stats, showAo5, setShowAo5, showAo12, setShowAo12, chartType, setChartType, showAnalysis, setShowAnalysis, filters, toggleFilter }) {
  return (
    <div className="w-64 min-h-screen bg-gray-800 border-r border-gray-700 p-4 flex flex-col gap-6 shrink-0">
      <h2 className="text-3xl font-bold text-white">SolveStat</h2>

      {/* Stats Panel */}
      <div>
        <h3 className="text-xs text-gray-400 uppercase tracking-widest mb-3">Stats</h3>
        {stats ? (
          <div className="flex flex-col gap-2">
            {[
              { label: 'Solves', value: stats.count },
              { label: 'Mean', value: `${stats.mean}s` },
              { label: 'Best', value: `${stats.best}s` },
              { label: 'Worst', value: `${stats.worst}s` },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-gray-400">{label}</span>
                <span className="text-white font-semibold">{value}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">Upload a file to see stats</p>
        )}
      </div>

      {/* Chart Type */}
      <div>
        <h3 className="text-xs text-gray-400 uppercase tracking-widest mb-3">Chart Type</h3>
        <div className="flex flex-col gap-2">
          {['line', 'none'].map((type) => (
            <button
              key={type}
              onClick={() => setChartType(type)}
              className={`text-sm px-3 py-2 rounded-lg text-left capitalize transition ${
                chartType === type
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {type === 'line' ? '📈 Line Chart' : '👁️ Hide Times'}
            </button>
          ))}
        </div>
      </div>

      {/* Overlays */}
      <div>
        <h3 className="text-xs text-gray-400 uppercase tracking-widest mb-3">Overlays</h3>
        <div className="flex flex-col gap-2">
          {[
            { label: 'Show Ao5', value: showAo5, setter: setShowAo5 },
            { label: 'Show Ao12', value: showAo12, setter: setShowAo12 },
          ].map(({ label, value, setter }) => (
            <button
              key={label}
              onClick={() => setter(!value)}
              className={`text-sm px-3 py-2 rounded-lg text-left transition ${
                value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {value ? '✓ ' : ''}{label}
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div>
        <h3 className="text-xs text-gray-400 uppercase tracking-widest mb-3">Filters</h3>
        <div className="flex flex-col gap-2">
          {[
            { key: 'plus2', label: '🟡 +2 Only' },
            { key: 'dnf', label: '🔴 DNF Only' },
            { key: 'hasComment', label: '💬 Has Comment' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => toggleFilter(key)}
              className={`text-sm px-3 py-2 rounded-lg text-left transition ${
                filters[key]
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {filters[key] ? '✓ ' : ''}{label}
            </button>
          ))}
        </div>
      </div>

      {/* Analysis */}
      <div>
        <h3 className="text-xs text-gray-400 uppercase tracking-widest mb-3">Analysis</h3>
        <button
          onClick={() => setShowAnalysis(!showAnalysis)}
          className={`text-sm px-3 py-2 rounded-lg text-left w-full transition ${
            showAnalysis
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          {showAnalysis ? '✓ ' : ''}🔬 Hypothesis Testing
        </button>
      </div>
    </div>
  )
}

function SortableTab({ id, name, isActive, onClick, onRename }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const commitRename = () => {
    setEditing(false)
    if (draft.trim()) onRename(draft.trim())
    else setDraft(name)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={`flex items-center gap-1 px-3 py-2 text-sm rounded-t-lg whitespace-nowrap transition cursor-pointer select-none ${
        isActive
          ? 'bg-gray-800 text-white border border-b-0 border-gray-700'
          : 'text-gray-400 hover:text-white'
      }`}
      onClick={onClick}
    >
      <span
        {...listeners}
        className="cursor-grab text-gray-500 hover:text-gray-300 pr-1"
        onClick={(e) => e.stopPropagation()}
      >
        ⠿
      </span>

      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename()
            if (e.key === 'Escape') { setEditing(false); setDraft(name) }
          }}
          onClick={(e) => e.stopPropagation()}
          className="bg-gray-700 text-white text-sm px-1 rounded w-32 outline-none"
        />
      ) : (
        <span onDoubleClick={(e) => { e.stopPropagation(); setEditing(true) }}>
          {name}
        </span>
      )}
    </div>
  )
}

export default function App() {
  const [sessions, setSessions] = useState([])
  const [activeTab, setActiveTab] = useState(0)
  const [showAo5, setShowAo5] = useState(false)
  const [showAo12, setShowAo12] = useState(false)
  const [chartType, setChartType] = useState('line')
  const [showAnalysis, setShowAnalysis] = useState(false)
  const [filters, setFilters] = useState({ plus2: false, dnf: false, hasComment: false })

  const sensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: { distance: 5 },
  }))

  const toggleFilter = (key) => {
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleUpload = (data, fileName) => {
    setSessions((prev) => [...prev, { id: crypto.randomUUID(), name: fileName, solves: data.solves, stats: data.stats }])
    setActiveTab(sessions.length)
  }

  const handleDragEnd = (event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setSessions((prev) => {
      const oldIndex = prev.findIndex((s) => s.id === active.id)
      const newIndex = prev.findIndex((s) => s.id === over.id)
      const newSessions = arrayMove(prev, oldIndex, newIndex)
      setActiveTab(newIndex)
      return newSessions
    })
  }

  const handleRename = (index, newName) => {
    setSessions((prev) => prev.map((s, i) => i === index ? { ...s, name: newName } : s))
  }

  const activeSession = sessions[activeTab]

  const filteredSolves = activeSession ? activeSession.solves.filter((s) => {
  const anyFilterOn = filters.plus2 || filters.dnf || filters.hasComment
    if (!anyFilterOn) return true
    return (
      (filters.plus2 && s.penalty === 'plus2') ||
      (filters.dnf && s.penalty === 'dnf') ||
      (filters.hasComment && !!s.comment)
    )
  }) : []

  if (sessions.length === 0) {
    return (
      <div className="min-h-screen w-full bg-gray-900 text-white flex flex-col items-center justify-center px-4 gap-6">
        <h1 className="text-5xl font-extrabold">SolveStat</h1>
        <p className="text-gray-300 text-sm">
          Drop your <code>.csv</code> file below to view your solve times 📊
        </p>
        <div className="w-full max-w-md">
          <UploadFile onUpload={handleUpload} />
        </div>
        <footer className="text-xs text-gray-600 pt-6">
          Made by Jimbo • 💾 Your data stays private
        </footer>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gray-900 text-white">
      <Sidebar
        stats={activeSession?.stats}
        showAo5={showAo5}
        setShowAo5={setShowAo5}
        showAo12={showAo12}
        setShowAo12={setShowAo12}
        chartType={chartType}
        setChartType={setChartType}
        showAnalysis={showAnalysis}
        setShowAnalysis={setShowAnalysis}
        filters={filters}
        toggleFilter={toggleFilter}
      />

      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Tabs */}
        <div className="flex items-center gap-1 px-4 pt-4 border-b border-gray-700 overflow-x-auto">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={sessions.map((s) => s.id)} strategy={horizontalListSortingStrategy}>
              {sessions.map((s, i) => (
                <SortableTab
                  key={s.id}
                  id={s.id}
                  name={s.name}
                  isActive={activeTab === i}
                  onClick={() => setActiveTab(i)}
                  onRename={(newName) => handleRename(i, newName)}
                />
              ))}
            </SortableContext>
          </DndContext>
          <UploadFile onUpload={handleUpload} compact />
        </div>

        {/* Main Content */}
        <div className="flex-1 p-6 overflow-auto">
          {activeSession ? (
            <div className="flex flex-col gap-4">
              <div className="bg-gray-800 rounded-xl p-6">
                <SolveChart
                  key={chartType}
                  solves={filteredSolves}
                  showAo5={showAo5}
                  showAo12={showAo12}
                  chartType={chartType}
                />
              </div>
              {showAnalysis && (
                <HypothesisPanel session={{ ...activeSession, solves: filteredSolves }} />
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center gap-4">
              <p className="text-gray-400 text-lg">No file uploaded yet</p>
              <p className="text-gray-500 text-sm">Use the + button above to upload a .csv file</p>
            </div>
          )}
        </div>

        <footer className="text-xs text-gray-600 text-center pb-4">
          Made by Jimbo • 💾 Your data stays private
        </footer>
      </div>
    </div>
  )
}