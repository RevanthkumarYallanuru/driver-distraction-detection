import { useEffect } from 'react'
import { Dashboard } from './pages/Dashboard'
import { startTelemetrySocket } from './services/telemetrySocket'

export default function App() {
  useEffect(() => startTelemetrySocket(), [])
  return <Dashboard />
}
