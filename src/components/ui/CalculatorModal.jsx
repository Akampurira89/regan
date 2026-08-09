import { useState } from 'react'
import { Modal } from './ui'
import { Delete } from 'lucide-react'

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
  const [pendingExpr, setPendingExpr] = useState('')
  const [history, setHistory] = useState([])
  const [pressed, setPressed] = useState(null)

  const fmt = (n) => {
    if (!Number.isFinite(n)) return 'Error'
    const s = String(n)
    return s.length > 12 ? n.toPrecision(10).replace(/\.?0+$/, '') : s
  }

  const inputDigit = (d) => {
    if (overwrite) { setDisplay(d === '.' ? '0.' : d); setOverwrite(false); return }
    if (d === '.' && display.includes('.')) return
    setDisplay(display === '0' && d !== '.' ? d : display + d)
  }

  const chooseOperator = (op) => {
    const current = parseFloat(display)
    if (stored !== null && operator && !overwrite) {
      const result = calc(stored, current, operator)
      setDisplay(fmt(result))
      setStored(result)
      setPendingExpr(`${fmt(result)} ${op}`)
    } else {
      setStored(current)
      setPendingExpr(`${fmt(current)} ${op}`)
    }
    setOperator(op)
    setOverwrite(true)
  }

  const equals = () => {
    if (operator === null || stored === null) return
    const current = parseFloat(display)
    const result = calc(stored, current, operator)
    const exprText = `${pendingExpr} ${fmt(current)}`
    setHistory((h) => [{ expr: exprText, result: fmt(result) }, ...h].slice(0, 20))
    setDisplay(fmt(result))
    setStored(null)
    setOperator(null)
    setPendingExpr('')
    setOverwrite(true)
  }

  const clear = () => { setDisplay('0'); setStored(null); setOperator(null); setPendingExpr(''); setOverwrite(true) }
  const clearHistory = () => setHistory([])
  const backspace = () => setDisplay((d) => (d.length > 1 ? d.slice(0, -1) : '0'))
  const percent = () => setDisplay(fmt(parseFloat(display) / 100))
  const toggleSign = () => setDisplay((d) => (d.startsWith('-') ? d.slice(1) : '-' + d))

  const keys = [
    ['C', '±', '%', '÷'],
    ['7', '8', '9', '×'],
    ['4', '5', '6', '-'],
    ['1', '2', '3', '+'],
    ['0', '.', '='],
  ]

  const press = (key) => {
    setPressed(key)
    setTimeout(() => setPressed(null), 120)
    if (key === 'C') return clear()
    if (key === '±') return toggleSign()
    if (key === '%') return percent()
    if (key === '=') return equals()
    if (['+', '-', '×', '÷'].includes(key)) return chooseOperator(key)
    return inputDigit(key)
  }

  const keyStyle = (key) => {
    if (key === '=') return 'col-span-2 bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30 hover:brightness-110'
    if (['+', '-', '×', '÷'].includes(key)) {
      const active = operator === key && overwrite
      return active
        ? 'bg-blue-600 text-white shadow-md'
        : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50'
    }
    if (key === 'C') return 'bg-red-50 dark:bg-red-900/20 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/40'
    if (key === '±' || key === '%') return 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
    return 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 shadow-sm border border-gray-100 dark:border-gray-700'
  }

  return (
    <Modal open={open} onClose={onClose} title="Calculator">
      <div className="max-w-xs mx-auto">
        {history.length > 0 && (
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs text-gray-400">History</p>
            <button onClick={clearHistory} className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500">
              <Delete size={12} /> Clear
            </button>
          </div>
        )}
        {history.length > 0 && (
          <div className="mb-3 max-h-24 overflow-y-auto rounded-lg bg-gray-50 dark:bg-gray-800/60 px-3 py-2 space-y-1">
            {history.map((h, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span className="text-gray-400 truncate">{h.expr} =</span>
                <span className="font-semibold text-gray-600 dark:text-gray-300">{h.result}</span>
              </div>
            ))}
          </div>
        )}

        <div className="bg-gradient-to-br from-gray-900 to-gray-800 text-white rounded-2xl p-4 mb-3 text-right shadow-inner">
          {pendingExpr && <p className="text-xs text-white/50 mb-1 truncate">{pendingExpr}</p>}
          <p className="text-4xl font-mono font-light truncate">{display}</p>
        </div>

        <div className="grid grid-cols-4 gap-2.5">
          {keys.flat().map((key, idx) => (
            <button
              key={idx}
              onClick={() => press(key)}
              className={`py-3.5 rounded-xl text-lg font-medium transition-all duration-100 active:scale-95 ${keyStyle(key)} ${key === '0' ? 'col-span-2' : ''} ${pressed === key ? 'scale-95' : ''}`}
            >
              {key}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}
