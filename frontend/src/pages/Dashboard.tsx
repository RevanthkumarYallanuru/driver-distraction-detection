import { AnnouncementCenter } from '../components/alerts/AnnouncementCenter'
import { RecentAlerts } from '../components/alerts/RecentAlerts'
import { CameraFeed } from '../components/camera/CameraFeed'
import { AttentionScoreCard } from '../components/cards/AttentionScoreCard'
import { BootOverlay } from '../components/layout/BootOverlay'
import { ConnectionBanner } from '../components/layout/ConnectionBanner'
import { PageTitle } from '../components/layout/PageTitle'
import { TopBar } from '../components/layout/TopBar'
import {
  DrowsinessCard,
  EarCard,
  GazeCard,
  HeadPositionCard,
  PhoneCard,
  SeverityCard,
} from '../components/metrics/MetricCards'
import { SystemStatus } from '../components/system/SystemStatus'
import { VehicleSpeedCard } from '../components/vehicle/VehicleSpeedCard'

export function Dashboard() {
  return (
    <div className="mx-auto flex min-h-screen max-w-[1680px] flex-col gap-4 px-4 py-3 sm:px-6">
      <TopBar />
      <PageTitle />
      <ConnectionBanner />

      <main className="flex flex-1 flex-col gap-3.5">
        {/* Row 1: camera · attention score · vehicle speed */}
        <div className="grid gap-3.5 md:grid-cols-2 xl:h-[clamp(270px,36vh,400px)] xl:grid-cols-[1.45fr_0.78fr_1.25fr]">
          <div className="aspect-[4/3] md:col-span-2 md:aspect-[16/9] xl:col-span-1 xl:aspect-auto">
            <CameraFeed />
          </div>
          <AttentionScoreCard />
          <div className="min-h-[260px]">
            <VehicleSpeedCard />
          </div>
        </div>

        {/* Row 2: detection metrics */}
        <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-6">
          <EarCard />
          <HeadPositionCard />
          <PhoneCard />
          <DrowsinessCard />
          <GazeCard />
          <SeverityCard />
        </div>

        {/* Row 3: alerts · system status */}
        <div className="grid gap-3.5 lg:grid-cols-[1.3fr_1fr] xl:min-h-[210px] xl:flex-1">
          <RecentAlerts />
          <SystemStatus />
        </div>
      </main>

      <footer className="pb-1 text-center text-[11px] text-ink-3">
        Research prototype · Vehicle speed is simulated; no real vehicle is controlled.
      </footer>

      <AnnouncementCenter />
      <BootOverlay />
    </div>
  )
}
