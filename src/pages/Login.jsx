import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'
import { Button, Input, Card } from '../components/ui/ui'

const BLOCK_MESSAGES = {
  disabled: 'Your account has been disabled. Please contact your shop admin.',
  suspended: "This shop's subscription is not active. Please contact the platform owner.",
  trial_expired: 'Your free trial has ended. Please contact the platform owner to activate your subscription (UGX 50,000/month).',
  no_access: 'This account no longer has access to any shop. Please contact the platform owner.',
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetMode, setResetMode] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [resetError, setResetError] = useState('')
  const { login, blockedReason } = useAuth()
  const navigate = useNavigate()

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/')
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const sendReset = async (e) => {
    e.preventDefault()
    setResetError('')
    if (!email) { setResetError('Enter your email above first.'); return }
    try {
      await sendPasswordResetEmail(auth, email)
      setResetSent(true)
    } catch (err) {
      setResetError(err.code === 'auth/user-not-found' ? "We couldn't find an account with that email." : err.message)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-dark to-gray-900 p-4">
      <Card className="w-full max-w-sm">
        <div className="text-center mb-4">
          <div className="w-12 h-12 rounded-xl bg-brand text-white flex items-center justify-center font-bold text-xl mx-auto mb-2">E</div>
          <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">EDDY K. ELECTRONICS</h1>
          <p className="text-xs text-gray-400">Shop Management System</p>
        </div>

        {blockedReason && (
          <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg mb-3">
            {BLOCK_MESSAGES[blockedReason] || 'Access denied.'}
          </p>
        )}

        {!resetMode ? (
          <>
            <form onSubmit={submit}>
              <Input label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@shop.com" />
              <Input label="Password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
              {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>{loading ? 'Signing in...' : 'Sign In'}</Button>
            </form>
            <button
              onClick={() => { setResetMode(true); setResetSent(false); setResetError('') }}
              className="text-xs text-blue-600 hover:underline mt-3 block mx-auto"
            >
              Forgot password?
            </button>
          </>
        ) : (
          <div>
            {resetSent ? (
              <p className="text-sm text-green-700 bg-green-50 dark:bg-green-900/20 px-3 py-2 rounded-lg mb-3">
                Reset link sent to <strong>{email}</strong>. Check your inbox (and spam folder).
              </p>
            ) : (
              <form onSubmit={sendReset}>
                <p className="text-xs text-gray-500 mb-2">Enter your email and we'll send you a reset link.</p>
                <Input label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@shop.com" />
                {resetError && <p className="text-red-600 text-sm mb-3">{resetError}</p>}
                <Button type="submit" className="w-full">Send Reset Link</Button>
              </form>
            )}
            <button
              onClick={() => setResetMode(false)}
              className="text-xs text-blue-600 hover:underline mt-3 block mx-auto"
            >
              Back to Sign In
            </button>
          </div>
        )}
      </Card>
    </div>
  )
}
