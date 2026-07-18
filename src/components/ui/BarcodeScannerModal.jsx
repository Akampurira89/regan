import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { Camera, X, RefreshCw } from 'lucide-react'
import { Modal, Button } from './ui'

export default function BarcodeScannerModal({ open, onClose, onDetected }) {
  const videoRef = useRef(null)
  const controlsRef = useRef(null)
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(true)

  // Keep the latest callbacks in refs. Without this, the scanning effect below
  // would restart the camera every time the PARENT component re-renders (e.g.
  // every keystroke in the POS search box) — because onClose/onDetected are
  // passed as new inline functions each render. That constant restart was why
  // the scanner felt broken: the camera stream kept getting torn down and
  // re-requested mid-scan. Refs let the effect depend only on `open`.
  const onDetectedRef = useRef(onDetected)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onDetectedRef.current = onDetected }, [onDetected])
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  useEffect(() => {
    if (!open) return undefined
    setError('')
    setStarting(true)
    let stopped = false

    const reader = new BrowserMultiFormatReader()

    const start = async () => {
      // Prefer the rear/back camera on phones — the default device is often
      // the front-facing camera, which is useless for scanning a barcode.
      let deviceId
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices()
        const backCam = devices.find((d) => /back|rear|environment/i.test(d.label))
        deviceId = (backCam || devices[devices.length - 1])?.deviceId
      } catch {
        deviceId = undefined
      }
      if (stopped) return

      try {
        const controls = await reader.decodeFromVideoDevice(deviceId, videoRef.current, (result) => {
          if (result && !stopped) {
            stopped = true
            onDetectedRef.current(result.getText())
            controlsRef.current?.stop()
            controlsRef.current = null
            onCloseRef.current()
          }
        })
        if (stopped) { controls.stop(); return }
        controlsRef.current = controls
        setStarting(false)
      } catch (e) {
        setError(
          e?.name === 'NotAllowedError'
            ? 'Camera access was blocked. Allow camera permission for this site in your browser settings, then try again.'
            : e?.message || 'Could not access the camera.'
        )
        setStarting(false)
      }
    }
    start()

    return () => {
      stopped = true
      controlsRef.current?.stop()
      controlsRef.current = null
    }
  }, [open])

  return (
    <Modal open={open} onClose={onClose} title="Scan Barcode / QR Code">
      <div className="space-y-3">
        {error ? (
          <div className="text-center py-6">
            <p className="text-sm text-red-600 mb-3">{error}</p>
            <Button variant="secondary" onClick={onClose}><X size={14} className="inline mr-1" /> Close</Button>
          </div>
        ) : (
          <>
            <div className="rounded-lg overflow-hidden bg-black aspect-video relative">
              <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
              {starting && (
                <div className="absolute inset-0 flex items-center justify-center text-white text-xs bg-black/50">
                  <RefreshCw size={16} className="animate-spin mr-2" /> Starting camera...
                </div>
              )}
            </div>
            <p className="text-xs text-gray-400 text-center">
              <Camera size={13} className="inline mr-1" />
              Point the camera at a product barcode or QR code.
            </p>
            <Button variant="secondary" className="w-full" onClick={onClose}>
              <X size={14} className="inline mr-1" /> Cancel
            </Button>
          </>
        )}
      </div>
    </Modal>
  )
}
