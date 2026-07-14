import confetti from 'canvas-confetti'

// A quick, tasteful burst — used when a sale completes. Uses the current
// brand color so it matches whatever the app is themed as right now.
export function celebrateSale() {
  const brand = getComputedStyle(document.documentElement).getPropertyValue('--color-brand').trim() || '#c2410c'
  confetti({
    particleCount: 80,
    spread: 70,
    origin: { y: 0.6 },
    colors: [brand, '#ffffff', '#fbbf24'],
    disableForReducedMotion: true,
  })
}

// A bigger celebration — reserved for hitting a new sales record.
export function celebrateRecord() {
  const brand = getComputedStyle(document.documentElement).getPropertyValue('--color-brand').trim() || '#c2410c'
  const duration = 1500
  const end = Date.now() + duration
  ;(function frame() {
    confetti({ particleCount: 4, angle: 60, spread: 55, origin: { x: 0 }, colors: [brand, '#fbbf24'] })
    confetti({ particleCount: 4, angle: 120, spread: 55, origin: { x: 1 }, colors: [brand, '#fbbf24'] })
    if (Date.now() < end) requestAnimationFrame(frame)
  })()
}
