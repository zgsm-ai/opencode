import { Bus } from "@/bus"
import { Config } from "@/config/config"
import { Flag } from "@/flag/flag"
import { Installation } from "@/installation"

export async function upgrade() {
  const config = await Config.global()  

  const method = await Installation.method()
  const latest = await Installation.latest(method).catch(() => {})
  if (!latest) return
  if (Installation.VERSION === latest) return

  // Prevent downgrade: skip if target version is older than current
  const versionComparison = Installation.compareVersions(latest, Installation.VERSION)
  if (versionComparison < 0) {
    return
  }

  if (config.autoupdate === false || Flag.COSTRICT_DISABLE_AUTOUPDATE) {
    return
  }
  if (config.autoupdate === "notify") {
    await Bus.publish(Installation.Event.UpdateAvailable, { version: latest })
    return
  }

  if (method === "unknown") return
  await Installation.upgrade(method, latest)
    .then(() => Bus.publish(Installation.Event.Updated, { version: latest }))
    .catch(() => {})
}
