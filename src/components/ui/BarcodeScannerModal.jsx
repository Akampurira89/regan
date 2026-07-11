import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { Camera, X } from 'lucide-react'
import { Modal, Button } from './ui'

export default function BarcodeScannerModal({ open, onClose, onDetected }) {
  const videoRef = useRef(null)
  const controlsRef = useRef(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return undefined
    const reader = new BrowserMultiFormatReader()
    let cancelled = false

    reader
      .decodeFromVideoDevice(undefined, videoRef.current, (result, err, controls) => {
        controlsRef.current = controls
        if (result && !cancelled) {
          onDetected(result.getText())
          controls.stop()
          onClose()
        }
      })
      .catch((e) => setError(e.message || 'Could not access camera.'))

    return () => {
      cancelled = true
      controlsRef.current?.stop()
    }
  }, [open, onClose, onDetected])

  return (
    <Modal open={open} onClose={onClose} title="Scan Barcode / QR Code">
      <div className="space-y-3">
        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : (
          <div className="rounded-lg overflow-hidden bg-black aspect-video">
            <video ref={videoRef} className="w-full h-full object-cover" />
          </div>
        )}
        <p className="text-xs text-gray-400 text-center">
          <Camera size={13} className="inline mr-1" />
          Point the camera at a product barcode or QR code.
        </p>
        <Button variant="secondary" className="w-full" onClick={onClose}>
          <X size={14} className="inline mr-1" /> Cancel
        </Button>
      </div>
    </Modal>
  )
}
