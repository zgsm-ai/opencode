import { Global } from "../global"
import { Flag } from "../flag/flag"

export async function data() {
  const path = Bun.env.MODELS_DEV_API_JSON
  if (path) {
    const file = Bun.file(path)
    if (await file.exists()) {
      return await file.text()
    }
  }
  const url = Flag.OPENCODE_MODELS_URL || "https://models.dev"
  const json = await fetch(`${url}/api.json`, {
    signal: AbortSignal.timeout(10 * 1000),
  }).then((x) => x.text())
  return json
}
