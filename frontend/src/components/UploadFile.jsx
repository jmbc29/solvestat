import { useDropzone } from 'react-dropzone'
import axios from 'axios'
import { useCallback, useState } from 'react'
import { ArrowUpTrayIcon, InboxIcon, ArrowUpCircleIcon } from '@heroicons/react/24/outline'

function UploadFile({ onUpload }) {
  const [status, setStatus] = useState('Click to upload or drag a file')

  const onDrop = useCallback(async (acceptedFiles) => {
    const file = acceptedFiles[0]
    if (!file) return

    if (!file.name.endsWith('.csv')) {
      setStatus('⚠️ Please upload a .csv file')
      return
    }

    setStatus(`Uploading ${file.name}...`)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await axios.post('http://localhost:8000/upload/', formData)
      setStatus('✅ Upload successful!')
      if (onUpload) onUpload(res.data)
    } catch (err) {
      console.error(err)
      setStatus('❌ Upload failed.')
    }
  }, [onUpload])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop })

  return (
    <div
      {...getRootProps()}
      className="w-full border-2 border-dashed border-gray-600 bg-gray-800 hover:bg-gray-700 rounded-xl py-8 px-6 transition duration-200 cursor-pointer text-center"
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center justify-center text-gray-300 space-y-3">
       <img src="/UploadFileLogo.svg" alt="Upload Logo" style={{ width: '100px', height: '100px' }} className="my-4" />
        <p className="text-sm font-semibold">
          {isDragActive ? '📂 Drop the file here!' : status}
        </p>
        <p className="text-xs text-gray-400">Only .csv files are supported</p>
      </div>
    </div>
  )
}

export default UploadFile