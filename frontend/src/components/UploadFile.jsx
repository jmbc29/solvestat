import { useDropzone } from 'react-dropzone'
import axios from 'axios'
import { useCallback, useState } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function UploadFile({ onUpload, compact }) {
  const [status, setStatus] = useState(null)

  const onDrop = useCallback(async (acceptedFiles) => {
    const file = acceptedFiles[0]
    if (!file) return

    const name = file.name.toLowerCase()
    const isCsv = name.endsWith('.csv')
    const isCsTimer = name.endsWith('.txt') || name.endsWith('.json') || !name.includes('.')
    if (!isCsv && !isCsTimer) {
      setStatus('⚠️ .csv or csTimer export')
      return
    }

    setStatus('...')
    const formData = new FormData()
    formData.append('file', file)

    try {
      if (isCsv) {
        const res = await axios.post(`${API}/upload/`, formData)
        setStatus(null)
        onUpload?.(res.data, file.name)
      } else {
        const tz = new Date().getTimezoneOffset()
        const res = await axios.post(`${API}/upload/cstimer/?tz_offset_minutes=${tz}`, formData)
        setStatus(null)
        onUpload?.(res.data, file.name)
      }
    } catch (err) {
      console.error(err)
      setStatus(err.response?.data?.detail ? '❌ ' + err.response.data.detail : '❌')
    }
  }, [onUpload])

  const { getRootProps, getInputProps } = useDropzone({ onDrop })

  if (compact) {
    return (
      <div
        {...getRootProps()}
        className="px-3 py-2 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg cursor-pointer text-gray-300 whitespace-nowrap transition"
      >
        <input {...getInputProps()} />
        {status ?? '+ Add File'}
      </div>
    )
  }

  return (
    <div
      {...getRootProps()}
      className="w-full border-2 border-dashed border-gray-600 bg-gray-800 hover:bg-gray-700 rounded-xl py-8 px-6 transition duration-200 cursor-pointer text-center"
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center justify-center text-gray-300 space-y-3">
        <img src="/UploadFileLogo.svg" alt="Upload Logo" style={{ width: '100px', height: '100px' }} className="my-4" />
        <p className="text-sm font-semibold">Click to upload or drag a file</p>
        <p className="text-xs text-gray-400">A csTimer CSV, or a full csTimer export (all sessions)</p>
      </div>
    </div>
  )
}

export default UploadFile
