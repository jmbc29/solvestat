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
import WCAPanel from './components/WCAPanel'
import './index.css'

function Sidebar({ stats, activeSession, chartTypes, toggleChartType, activeAnalysis, setActiveAnalysis, filters, toggleFilter, distOverlays, toggleDistOverlay, subXTarget, setSubXTarget, dataType, setDataType, customAoX, setCustomAoX, customAoXInput, setCustomAoXInput, sessions, activeTab, overlaySessionIds, toggleOverlaySession }) {
  return (
    <div className="w-64 min-h-screen bg-gray-800 border-r border-gray-700 p-4 flex flex-col gap-6 shrink-0 overflow-y-auto">
      <h2 className="text-3xl font-bold text-white">SolveStat</h2>

      {/* Stats Panel */}
      <div>
        <h3 className="text-xs text-gray-400 uppercase tracking-widest mb-3">Stats</h3>
        {stats && activeSession ? (() => {
          const allSolves = activeSession.solves
          const total = allSolves.length
          const dnfs = allSolves.filter((s) => s.penalty === 'dnf').length
          const plus2s = allSolves.filter((s) => s.penalty === 'plus2').length
          const complete = total - dnfs - plus2s
          const pct = (n) => `${((n / total) * 100).toFixed(1)}%`
          const rows = [
            { label: 'Total Attempts', value: total },
            { label: 'Complete', value: `${complete} (${pct(complete)})` },
            { label: '+2 Solves', value: `${plus2s} (${pct(plus2s)})` },
            { label: 'DNFs', value: `${dnfs} (${pct(dnfs)})` },
          ]
          return (
            <div className="flex flex-col gap-2">
              {rows.map(({ label, value }) => (
                <div key={label} className="flex justify-between text-sm gap-2">
                  <span className="text-gray-400 shrink-0">{label}</span>
                  <span className="text-white font-semibold text-right">{value}</span>
                </div>
              ))}
            </div>
          )
        })() : (
          <p className="text-gray-500 text-sm">Upload a file to see stats</p>
        )}
      </div>

      {/* Chart Type */}
      <div>
        <h3 className="text-xs text-gray-400 uppercase tracking-widest mb-3">Chart Type</h3>
        <div className="flex flex-col gap-2">
          {[
            { type: 'line', label: '📈 Line Chart' },
            { type: 'distribution', label: '🔔 Distribution Fit' },
            { type: 'none', label: '👁️ Hide Times' },
          ].map(({ type, label }) => (
            <button
              key={type}
              onClick={() => toggleChartType(type)}
              className={`text-sm px-3 py-2 rounded-lg text-left capitalize transition ${
                chartTypes.includes(type)
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {chartTypes.includes(type) ? '✓ ' : ''}{label}
            </button>
          ))}
        </div>
      </div>

      {/* Data Type */}
      <div>
        <h3 className="text-xs text-gray-400 uppercase tracking-widest mb-3">Data Type</h3>
        <div className="flex flex-col gap-2">
          {[
            { id: 'single', label: '📍 Single' },
            { id: 'ao5', label: '📊 Ao5' },
            { id: 'ao12', label: '📊 Ao12' },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setDataType(id)}
              className={`text-sm px-3 py-2 rounded-lg text-left transition ${
                dataType === id ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {dataType === id ? '✓ ' : ''}{label}
            </button>
          ))}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDataType('custom')}
              className={`text-sm px-3 py-2 rounded-lg text-left transition flex-1 ${
                dataType === 'custom' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {dataType === 'custom' ? '✓ ' : ''}📊 AoX
            </button>
            <input
              type="number"
              min="3"
              max="1000"
              value={customAoXInput}
              onChange={(e) => {
                setCustomAoXInput(e.target.value)
                const val = parseInt(e.target.value)
                if (val >= 3) setCustomAoX(val)
              }}
              className="bg-gray-700 text-white text-xs px-2 py-2 rounded-lg outline-none w-16"
            />
          </div>
        </div>
      </div>

      {/* Compare Sessions */}
      {sessions.length > 1 && (
        <div>
          <h3 className="text-xs text-gray-400 uppercase tracking-widest mb-3">Compare</h3>
          <div className="flex flex-col gap-2">
            {sessions.map((s, i) => {
              if (i === activeTab) return null
              return (
                <button
                  key={s.id}
                  onClick={() => toggleOverlaySession(s.id)}
                  className={`text-sm px-3 py-2 rounded-lg text-left transition truncate ${
                    overlaySessionIds.includes(s.id)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {overlaySessionIds.includes(s.id) ? '✓ ' : ''}{s.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

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
                filters[key] ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {filters[key] ? '✓ ' : ''}{label}
            </button>
          ))}
        </div>
      </div>

      {/* Overlays */}
      <div>
        <h3 className="text-xs text-gray-400 uppercase tracking-widest mb-3">Overlays</h3>
        <div className="flex flex-col gap-2">
          {[
            { key: 'mean', label: '📊 Mean' },
            { key: 'median', label: '📍 Median' },
            { key: 'sd', label: '📐 ±1 SD Band' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => toggleDistOverlay(key)}
              className={`text-sm px-3 py-2 rounded-lg text-left transition ${
                distOverlays[key] ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {distOverlays[key] ? '✓ ' : ''}{label}
            </button>
          ))}
          <div className="flex items-center gap-2">
            <button
              onClick={() => toggleDistOverlay('subX')}
              className={`text-sm px-3 py-2 rounded-lg text-left transition flex-1 ${
                distOverlays.subX ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {distOverlays.subX ? '✓ ' : ''}🎯 Sub-X
            </button>
            <input
              type="number"
              step="0.01"
              value={subXTarget}
              onChange={(e) => setSubXTarget(e.target.value)}
              placeholder="e.g. 9"
              className="bg-gray-700 text-white text-xs px-2 py-2 rounded-lg outline-none w-16"
            />
          </div>
        </div>
      </div>

      {/* Analysis */}
      <div>
        <h3 className="text-xs text-gray-400 uppercase tracking-widest mb-3">Analysis</h3>
        <div className="flex flex-col gap-2">
          {[
            { id: 'bootstrap', label: '🎯 Sub-X Probability' },
            { id: 'outlier', label: '📍 Outlier Test' },
            { id: 'changepoints', label: '🔀 Phase Detection' },
            { id: 'abtest', label: '⚖️ A/B Test' },
            { id: 'wca', label: '🏆 WCA Comparison' },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveAnalysis(activeAnalysis === id ? null : id)}
              className={`text-sm px-3 py-2 rounded-lg text-left transition ${
                activeAnalysis === id ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {activeAnalysis === id ? '✓ ' : ''}{label}
            </button>
          ))}
        </div>
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
  const [chartTypes, setChartTypes] = useState(['line'])
  const [activeAnalysis, setActiveAnalysis] = useState(null)
  const [filters, setFilters] = useState({ plus2: false, dnf: false, hasComment: false })
  const [distOverlays, setDistOverlays] = useState({ mean: false, median: false, sd: false, subX: false })
  const [subXTarget, setSubXTarget] = useState('')
  const [dataType, setDataType] = useState('single')
  const [customAoX, setCustomAoX] = useState(50)
  const [customAoXInput, setCustomAoXInput] = useState('50')
  const [overlaySessionIds, setOverlaySessionIds] = useState([])

  const sensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: { distance: 5 },
  }))

  const toggleChartType = (type) => {
    if (type === 'none') {
      setChartTypes(['none'])
      return
    }
    setChartTypes((prev) => {
      const without = prev.filter((t) => t !== 'none')
      if (without.includes(type)) {
        const next = without.filter((t) => t !== type)
        return next.length === 0 ? ['none'] : next
      }
      return [...without, type]
    })
  }

  const toggleFilter = (key) => setFilters((prev) => ({ ...prev, [key]: !prev[key] }))
  const toggleDistOverlay = (key) => setDistOverlays((prev) => ({ ...prev, [key]: !prev[key] }))
  const toggleOverlaySession = (id) => setOverlaySessionIds((prev) =>
    prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
  )

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

  const computeAoX = (solves, x) => {
    const drop = Math.ceil(0.05 * x)
    const result = []
    for (let i = 0; i < solves.length; i++) {
      if (i < x - 1) { result.push(null); continue }
      const window = solves.slice(i - x + 1, i + 1)
      const dnfCount = window.filter((s) => s.penalty === 'dnf').length
      if (dnfCount > drop) {
        const avgTime = parseFloat((window.reduce((a, b) => a + b.time, 0) / window.length).toFixed(3))
        result.push({ time: avgTime, isDnf: true, window })
        continue
      }
      const times = window.map((s) => s.time).sort((a, b) => a - b)
      const trimmed = times.slice(drop, times.length - drop)
      result.push({
        time: parseFloat((trimmed.reduce((a, b) => a + b, 0) / trimmed.length).toFixed(3)),
        isDnf: false,
        window,
        trimmedBest: times.slice(0, drop),
        trimmedWorst: times.slice(times.length - drop),
      })
    }
    return result
  }

  const getChartData = () => {
    if (dataType === 'single') return filteredSolves
    const x = dataType === 'ao5' ? 5 : dataType === 'ao12' ? 12 : customAoX
    const aoVals = computeAoX(filteredSolves, x)
    return filteredSolves
      .map((s, i) => ({
        ...s,
        time: aoVals[i]?.time ?? null,
        penalty: aoVals[i]?.isDnf ? 'dnf' : 'normal',
        windowSolves: aoVals[i]?.window ?? null,
      }))
      .filter((s) => s.time !== null)
  }

  const chartSolves = getChartData()
  const overlaySessions = sessions.filter((s, i) => i !== activeTab && overlaySessionIds.includes(s.id))

  const sharedChartProps = {
    solves: chartSolves,
    showAo5: false,
    showAo12: false,
    distOverlays,
    subXTarget,
    isAverage: dataType !== 'single',
    overlaySessions,
    dataType,
    customAoX,
  }

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
        activeSession={activeSession}
        chartTypes={chartTypes}
        toggleChartType={toggleChartType}
        activeAnalysis={activeAnalysis}
        setActiveAnalysis={setActiveAnalysis}
        filters={filters}
        toggleFilter={toggleFilter}
        distOverlays={distOverlays}
        toggleDistOverlay={toggleDistOverlay}
        subXTarget={subXTarget}
        setSubXTarget={setSubXTarget}
        dataType={dataType}
        setDataType={setDataType}
        customAoX={customAoX}
        setCustomAoX={setCustomAoX}
        customAoXInput={customAoXInput}
        setCustomAoXInput={setCustomAoXInput}
        sessions={sessions}
        activeTab={activeTab}
        overlaySessionIds={overlaySessionIds}
        toggleOverlaySession={toggleOverlaySession}
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
                {chartTypes.includes('line') && (
                  <SolveChart
                    key="line"
                    {...sharedChartProps}
                    chartType={chartTypes.includes('none') ? 'none' : 'line'}
                  />
                )}
                {chartTypes.includes('distribution') && (
                  <div className={chartTypes.includes('line') ? 'mt-6 pt-6 border-t border-gray-700' : ''}>
                    <SolveChart
                      key="distribution"
                      {...sharedChartProps}
                      chartType="distribution"
                    />
                  </div>
                )}
                {!chartTypes.includes('line') && !chartTypes.includes('distribution') && (
                  <SolveChart
                    key="none"
                    {...sharedChartProps}
                    chartType="none"
                  />
                )}
              </div>
              {activeAnalysis && activeAnalysis !== 'wca' && (
  <HypothesisPanel
    key={activeAnalysis}
    session={{ ...activeSession, solves: chartSolves }}
    rawSolves={filteredSolves}
    allSessions={sessions}
    activeTest={activeAnalysis}
  />
)}
              {activeAnalysis === 'wca' && (
  <WCAPanel
    session={{ ...activeSession, solves: chartSolves }}
    rawSolves={filteredSolves}
  />
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