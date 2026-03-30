import { Plugin } from "../plugin"
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
import { initializeParentProcessDetection, initializeEncodingCache } from "@/plugin/tdd/tools/shell"
import { YoloMode } from "../permission/yolo"
import { NotificationMode } from "../permission/notification"

export async function InstanceBootstrap() {
  Log.Default.info("bootstrapping", { directory: Instance.directory })
  const timer = Log.Default.time("startup.instance_bootstrap", { directory: Instance.directory })

  try {
    // Initialize shell parent process detection early for accurate shell detection
    {
      const step = Log.Default.time("startup.instance_bootstrap.parent_process_detection")
      await initializeParentProcessDetection().catch((e) => {
        Log.Default.warn("shell parent process detection failed, using fallback", { e })
      })
      step.stop()
    }

    // Initialize encoding cache for proper handling of non-UTF-8 shell output
    {
      const step = Log.Default.time("startup.instance_bootstrap.encoding_cache")
      initializeEncodingCache()
      step.stop()
    }

    {
      const step = Log.Default.time("startup.instance_bootstrap.plugin_init")
      await Plugin.init()
      step.stop()
    }
    {
      const step = Log.Default.time("startup.instance_bootstrap.share_next")
      ShareNext.init()
      step.stop()
    }
    {
      const step = Log.Default.time("startup.instance_bootstrap.format")
      Format.init()
      step.stop()
    }
    {
      const step = Log.Default.time("startup.instance_bootstrap.lsp")
      await LSP.init()
      step.stop()
    }
    {
      const step = Log.Default.time("startup.instance_bootstrap.file_watcher")
      FileWatcher.init()
      step.stop()
    }
    {
      const step = Log.Default.time("startup.instance_bootstrap.file")
      File.init()
      step.stop()
    }
    {
      const step = Log.Default.time("startup.instance_bootstrap.vcs")
      Vcs.init()
      step.stop()
    }
    {
      const step = Log.Default.time("startup.instance_bootstrap.snapshot")
      Snapshot.init()
      step.stop()
    }
    {
      const step = Log.Default.time("startup.instance_bootstrap.yolo_mode")
      await YoloMode.init()
      step.stop()
    }
    {
      const step = Log.Default.time("startup.instance_bootstrap.notification_mode")
      await NotificationMode.init()
      step.stop()
    }

    Bus.subscribe(Command.Event.Executed, async (payload) => {
      if (payload.properties.name === Command.Default.INIT) {
        await Project.setInitialized(Instance.project.id)
      }
    })
  } finally {
    timer.stop()
  }
}
