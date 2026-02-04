import { Plugin } from "../plugin"
import { Share } from "../share/share"
import { Format } from "../format"
import { LSP } from "../lsp"
import { FileWatcher } from "../file/watcher"
import { File } from "../file"
import { Project } from "./project"
import { Bus } from "../bus"
import { Command } from "../command"
import { Instance } from "./instance"
import { Vcs } from "./vcs"
import { Log } from "@/util/log"
import { ShareNext } from "@/share/share-next"
import { Snapshot } from "../snapshot"
import { Truncate } from "../tool/truncation"
import { initializeParentProcessDetection, initializeEncodingCache } from "@/plugin/tdd/tools/shell"
import { AutoTaskCheck } from "../session/auto-taskcheck"

export async function InstanceBootstrap() {
  Log.Default.info("bootstrapping", { directory: Instance.directory })

  // Initialize shell parent process detection early for accurate shell detection
  await initializeParentProcessDetection().catch((e) => {
    Log.Default.warn("shell parent process detection failed, using fallback", { e })
  })

  // Initialize encoding cache for proper handling of non-UTF-8 shell output
  initializeEncodingCache()

  await Plugin.init()
  Share.init()
  ShareNext.init()
  Format.init()
  await LSP.init()
  FileWatcher.init()
  File.init()
  Vcs.init()
  Snapshot.init()
  Truncate.init()
  AutoTaskCheck.init()

  Bus.subscribe(Command.Event.Executed, async (payload) => {
    if (payload.properties.name === Command.Default.INIT) {
      await Project.setInitialized(Instance.project.id)
    }
  })
}
