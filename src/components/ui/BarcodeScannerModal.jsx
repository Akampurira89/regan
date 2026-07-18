import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { Camera, X, RefreshCw, Flashlight, Keyboard } from 'lucide-react'
import { Modal, Button, Input } from './ui'

export default function BarcodeScannerModal({ open, onClose, onDetected }) {
  const videoRef = useRef(null)
  const controlsRef = useRef(null)
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(true)
  const [torchOn, setTorchOn] = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)
  const [manualMode, setManualMode] = useState(false)
  const [manualCode, setManualCode] = useState('')

  // Keep the latest callbacks in refs so the effect below only restarts when
  // the modal actually opens/closes — not on every parent re-render (which
  // happens constantly, e.g. every keystroke elsewhere on the page). Without
  // this the camera stream got torn down and re-requested mid-scan.
  const onDetectedRef = useRef(onDetected)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onDetectedRef.current = onDetected }, [onDetected])
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  useEffect(() => {
    if (!open || manualMode) return undefined
    setError('')
    setStarting(true)
    setTorchOn(false)
    let stopped = false

    const reader = new BrowserMultiFormatReader()

    const start = async () => {
      try {
        // Ask directly for the rear/environment-facing camera via constraints
        // rather than pre-enumerating devices before permission is granted —
        // enumerating too early can hand back an invalid device and silently
        // open a broken/blank stream that never decodes anything.
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } },
          videoRef.current,
          (result) => {
            if (result && !stopped) {
              stopped = true
              onDetectedRef.current(result.getText())
              controlsRef.current?.stop()
              controlsRef.current = null
              onCloseRef.current()
            }
          }
        )
        if (stopped) { controls.stop(); return }
        controlsRef.current = controls
        setTorchSupported(typeof controls.switchTorch === 'function')
        setStarting(false)
      } catch (e) {
        setError(
          e?.name === 'NotAllowedError'
            ? 'Camera access was blocked. Allow camera permission for this site in your browser settings, then try again — or type the barcode in manually below.'
            : (e?.message || 'Could not access the camera.') + ' You can type the barcode in manually below instead.'
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
  }, [open, manualMode])

  const toggleTorch = async () => {
    try {
      await controlsRef.current?.switchTorch?.(!torchOn)
      setTorchOn(!torchOn)
    } catch {
      setTorchSupported(false)
    }
  }

  const submitManual = (e) => {
    e.preventDefault()
    if (!manualCode.trim()) return
    onDetected(manualCode.trim())
    setManualCode('')
    setManualMode(false)
    onClose()
  }

  const close = () => {
    setManualMode(false)
    setManualCode('')
    onClose()
  }

  return (
    <Modal open={open} onClose={close} title="Scan Barcode / QR Code">
      <div className="space-y-3">
        {manualMode ? (
          <form onSubmit={submitManual}>
            <Input label="Type the barcode / SKU" autoFocus value={manualCode} onChange={(e) => setManualCode(e.target.value)} placeholder="e.g. 6009123456789" />
            <div className="flex gap-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setManualMode(false)}><Camera size={14} className="inline mr-1" /> Back to Camera</Button>
              <Button type="submit" className="flex-1">Use This Code</Button>
            </div>
          </form>
        ) : error ? (
          <div className="text-center py-4">
            <p className="text-sm text-red-600 mb-3">{error}</p>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={close}><X size={14} className="inline mr-1" /> Close</Button>
              <Button className="flex-1" onClick={() => setManualMode(true)}><Keyboard size={14} className="inline mr-1" /> Type Instead</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="rounded-lg overflow-hidden bg-black aspect-video relative">
              <video ref={videoRef} className="w-full h-full object-cover" muted playsInline autoPlay />
              {starting && (
                <div className="absolute inset-0 flex items-center justify-center text-white text-xs bg-black/50">
                  <RefreshCw size={16} className="animate-spin mr-2" /> Starting camera...
                </div>
              )}
              {torchSupported && !starting && (
                <button
                  type="button"
                  onClick={toggleTorch}
                  className={`absolute bottom-2 right-2 p-2 rounded-full ${torchOn ? 'bg-amber-400 text-black' : 'bg-black/60 text-white'}`}
                  title="Toggle flashlight"
                >
                  <Flashlight size={16} />
                </button>
              )}
            </div>
            <p className="text-xs text-gray-400 text-center">
              <Camera size={13} className="inline mr-1" />
              Hold steady, fill the frame with the barcode, and make sure there's good light.
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={close}>
                <X size={14} className="inline mr-1" /> Cancel
              </Button>
              <Button variant="ghost" className="flex-1" onClick={() => setManualMode(true)}>
                <Keyboard size={14} className="inline mr-1" /> Can't scan? Type it
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
