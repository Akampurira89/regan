import { useState } from 'react'
import { Modal } from './ui'

function calc(a, b, op) {
  switch (op) {
    case '+': return a + b
    case '-': return a - b
    case '×': return a * b
    case '÷': return b === 0 ? NaN : a / b
    default: return b
  }
}

export default function CalculatorModal({ open, onClose }) {
  const [display, setDisplay] = useState('0')
  const [stored, setStored] = useState(null)
  const [operator, setOperator] = useState(null)
  const [overwrite, setOverwrite] = useState(true)

  const inputDigit = (d) => {
    if (overwrite) { setDisplay(d === '.' ? '0.' : d); setOverwrite(false); return }
    if (d === '.' && display.includes('.')) return
    setDisplay(display === '0' && d !== '.' ? d : display + d)
  }

  const chooseOperator = (op) => {
    const current = parseFloat(display)
    if (stored !== null && operator && !overwrite) {
      const result = calc(stored, current, operator)
      setDisplay(String(result))
      setStored(result)
    } else {
      setStored(current)
    }
    setOperator(op)
    setOverwrite(true)
  }

  const equals = () => {
    if (operator === null || stored === null) return
    const current = parseFloat(display)
    const result = calc(stored, current, operator)
    setDisplay(String(result))
    setStored(null)
    setOperator(null)
    setOverwrite(true)
  }

  const clear = () => { setDisplay('0'); setStored(null); setOperator(null); setOverwrite(true) }
  const backspace = () => setDisplay((d) => (d.length > 1 ? d.slice(0, -1) : '0'))
  const percent = () => setDisplay(String(parseFloat(display) / 100))
  const toggleSign = () => setDisplay((d) => (d.startsWith('-') ? d.slice(1) : '-' + d))

  const keys = [
    ['C', '±', '%', '÷'],
    ['7', '8', '9', '×'],
    ['4', '5', '6', '-'],
    ['1', '2', '3', '+'],
    ['0', '.', '='],
  ]

  const press = (key) => {
    if (key === 'C') return clear()
    if (key === '±') return toggleSign()
    if (key === '%') return percent()
    if (key === '=') return equals()
    if (['+', '-', '×', '÷'].includes(key)) return chooseOperator(key)
    return inputDigit(key)
  }

  return (
    <Modal open={open} onClose={onClose} title="Calculator">
      <div className="max-w-xs mx-auto">
        <div className="bg-gray-900 text-white rounded-lg p-4 mb-3 text-right">
          <p className="text-3xl font-mono truncate">{display}</p>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {keys.flat().map((key, idx) => (
            <button
              key={idx}
              onClick={() => press(key)}
              onKeyDown={(e) => e.key === 'Backspace' && backspace()}
              className={`py-3 rounded-lg text-lg font-medium transition ${
                key === '='
                  ? 'col-span-2 bg-brand text-white hover:bg-brand-dark'
                  : ['+', '-', '×', '÷'].includes(key)
                  ? 'bg-brand-light/20 text-brand-dark hover:bg-brand-light/30'
                  : key === 'C'
                  ? 'bg-red-100 text-red-600 hover:bg-red-200'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700'
              } ${key === '0' ? 'col-span-2' : ''}`}
            >
              {key}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}
