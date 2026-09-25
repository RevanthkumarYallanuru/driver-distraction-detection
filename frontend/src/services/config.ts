// Same-origin in both modes: Vite proxies /api and /ws in development,
// FastAPI serves the built dashboard in production.
const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws'

export const WS_URL = `${wsProtocol}://${window.location.host}/ws/telemetry`
export const STREAM_URL = '/api/stream'
export const HORN_URL = '/api/vehicle/horn'

/** Shown in the header profile chip. Edit to suit the presenter. */
export const OPERATOR = {
  initials: 'RK',
  role: 'Research Prototype',
}

/** Speedometer range (km/h). */
export const GAUGE_MAX_KMH = 120
