import { AnnouncementCenter } from '../components/alerts/AnnouncementCenter'
import { CameraPanel } from '../components/camera/CameraPanel'
import { BootOverlay } from '../components/layout/BootOverlay'
import { ConnectionBanner } from '../components/layout/ConnectionBanner'
import { Header } from '../components/layout/Header'
import { AIStatusStrip } from '../components/telemetry/AIStatusStrip'
import { EventLog } from '../components/telemetry/EventLog'
import { SpeedTrend } from '../components/telemetry/SpeedTrend'
import { TelemetryPanel } from '../components/telemetry/TelemetryPanel'
import { VehiclePanel } from '../components/vehicle/VehiclePanel'

export function Dashboard() {
  return (
    <div className="mx-auto flex min-h-full max-w-[1600px] flex-col gap-4 px-4 py-4 sm:px-6 sm:py-5">
      <Header />
      <ConnectionBanner />

      <main className="flex flex-col gap-4">
        {/* Camera (left) | Vehicle (right) */}
        <div className="grid gap-4 lg:grid-cols-2">
          <CameraPanel />
          <VehiclePanel />
        </div>

        <AIStatusStrip />

        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-[1.25fr_1fr_1fr]">
          <TelemetryPanel />
          <SpeedTrend />
          <div className="min-h-[240px] lg:col-span-2 2xl:col-span-1">
            <EventLog />
          </div>
        </div>
      </main>

      <footer className="pb-1 pt-1 text-center text-[10.5px] tracking-wide text-ink-3">
        Prototype AI driver-monitoring system. Vehicle speed is simulated; no real vehicle is controlled.
      </footer>

      <AnnouncementCenter />
      <BootOverlay />
    </div>
  )
}
