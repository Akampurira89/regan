import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

export default function ProtectedRoute({ children, pageKey }) {
  const { session, profile, loading, can } = useAuth()

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">Loading...</div>
  }
  if (!session) return <Navigate to="/login" replace />
  if (pageKey && profile && !can(pageKey)) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center p-6">
        <div>
          <p className="text-lg font-semibold text-gray-700">Access restricted</p>
          <p className="text-sm text-gray-400">Your role ({profile.role}) doesn't have access to this page.</p>
        </div>
      </div>
    )
  }
  return children
}
