import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { Camera, X, RefreshCw, Flashlight, Keyboard, Focus } from 'lucide-react'
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
  const [refocusing, setRefocusing] = useState(false)

  const onDetectedRef = useRef(onDetected)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onDetectedRef.current = onDetected }, [onDetected])
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  // Try to force continuous autofocus on the camera track. Many Android phones
  // default to a "single shot" focus that only sharpens once when the camera
  // opens — great for photos, bad for barcode scanning where the object moves
  // around. This nudges it into continuous mode where the device supports it.
  const applyContinuousFocus = async () => {
    try {
      const stream = videoRef.current?.srcObject
      const track = stream?.getVideoTracks?.()[0]
      if (!track) return
      const caps = track.getCapabilities?.()
      if (caps?.focusMode?.includes('continuous')) {
        await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] })
      }
    } catch {
      // Not supported on this device/browser — safe to ignore, camera still works.
    }
  }

  const tapToRefocus = async () => {
    setRefocusing(true)
    try {
      const stream = videoRef.current?.srcObject
      const track = stream?.getVideoTracks?.()[0]
      if (track?.getCapabilities?.().focusMode) {
        // Briefly toggle to single-shot then back to continuous — this is the
        // common trick that nudges some phones into refocusing immediately.
        await track.applyConstraints({ advanced: [{ focusMode: 'single-shot' }] })
        setTimeout(() => track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {}), 300)
      }
    } catch {
      // ignore
    } finally {
      setTimeout(() => setRefocusing(false), 500)
    }
  }

  useEffect(() => {
    if (!open || manualMode) return undefined
    setError('')
    setStarting(true)
    setTorchOn(false)
    let stopped = false

    const reader = new BrowserMultiFormatReader()

    const start = async () => {
      try {
        const controls = await reader.decodeFromConstraints(
          {
            video: {
              facingMode: 'environment',
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              // Requesting this directly in getUserMedia constraints (in addition to
              // the post-start applyConstraints call below) covers more devices.
              advanced: [{ focusMode: 'continuous' }],
            },
          },
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
        applyContinuousFocus()
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
            <div className="rounded-lg overflow-hidden bg-black aspect-video relative" onClick={tapToRefocus}>
              <video ref={videoRef} className="w-full h-full object-cover" muted playsInline autoPlay />

              {/* Targeting box: helps you frame the barcode at the right distance/angle */}
              {!starting && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-4/5 h-1/3 border-2 border-white/70 rounded-lg relative">
                    <div className="absolute -top-0.5 -left-0.5 w-5 h-5 border-t-4 border-l-4 border-blue-400 rounded-tl-lg" />
                    <div className="absolute -top-0.5 -right-0.5 w-5 h-5 border-t-4 border-r-4 border-blue-400 rounded-tr-lg" />
                    <div className="absolute -bottom-0.5 -left-0.5 w-5 h-5 border-b-4 border-l-4 border-blue-400 rounded-bl-lg" />
                    <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 border-b-4 border-r-4 border-blue-400 rounded-br-lg" />
                  </div>
                </div>
              )}

              {starting && (
                <div className="absolute inset-0 flex items-center justify-center text-white text-xs bg-black/50">
                  <RefreshCw size={16} className="animate-spin mr-2" /> Starting camera...
                </div>
              )}
              {refocusing && (
                <div className="absolute inset-0 flex items-center justify-center text-white text-xs bg-black/30">
                  <Focus size={20} className="animate-pulse" />
                </div>
              )}
              {torchSupported && !starting && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleTorch() }}
                  className={`absolute bottom-2 right-2 p-2 rounded-full ${torchOn ? 'bg-amber-400 text-black' : 'bg-black/60 text-white'}`}
                  title="Toggle flashlight"
                >
                  <Flashlight size={16} />
                </button>
              )}
            </div>
            <p className="text-xs text-gray-400 text-center">
              <Camera size={13} className="inline mr-1" />
              Fill the box with the barcode, hold about 10–15cm away, and tap the video if it looks blurry to refocus.
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
