import { useTheme } from "@opencode-ai/ui/theme"
import { showToast } from "@opencode-ai/ui/toast"
import type { FitAddon, Ghostty, Terminal as Term } from "ghostty-web"
import { type ComponentProps, createEffect, createMemo, onCleanup, onMount, splitProps } from "solid-js"
import { SerializeAddon } from "@/addons/serialize"
import { matchKeybind, parseKeybind } from "@/context/command"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServer } from "@/context/server"
import { monoFontFamily, useSettings } from "@/context/settings"
import type { LocalPTY } from "@/context/device-terminal"
import { disposeIfDisposable, getHoveredLinkText, setOptionIfSupported } from "@/utils/runtime-adapters"
import { terminalWriter } from "@/utils/terminal-writer"
import { CloudTerminalApi } from "@/lib/cloud-terminal-api"
import "@/styles/terminal-fonts.css"

const TOGGLE_TERMINAL_ID = "terminal.toggle"
const DEFAULT_TOGGLE_TERMINAL_KEYBIND = "ctrl+`"
export interface TerminalProps extends ComponentProps<"div"> {
  pty: LocalPTY
  onSubmit?: () => void
  onCleanup?: (pty: Partial<LocalPTY> & { id: string }) => void
  onConnect?: () => void
  onConnectError?: (error: unknown) => void
  forceDark?: boolean
}

let shared: Promise<{ mod: typeof import("ghostty-web"); ghostty: Ghostty }> | undefined

const loadGhostty = () => {
  if (shared) return shared
  shared = import("ghostty-web")
    .then(async (mod) => ({ mod, ghostty: await mod.Ghostty.load() }))
    .catch((err) => {
      shared = undefined
      throw err
    })
  return shared
}

type TerminalColors = {
  background: string
  foreground: string
  cursor: string
  cursorAccent: string
  selectionBackground: string
  selectionForeground: string
  black: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  white: string
  brightBlack: string
  brightRed: string
  brightGreen: string
  brightYellow: string
  brightBlue: string
  brightMagenta: string
  brightCyan: string
  brightWhite: string
}

const DEFAULT_TERMINAL_COLORS: Record<"light" | "dark", TerminalColors> = {
  light: {
    background: "#ffffff",
    foreground: "#383a42",
    cursor: "#526fff",
    cursorAccent: "#ffffff",
    selectionBackground: "#add6ff",
    selectionForeground: "#383a42",
    black: "#383a42",
    red: "#e45649",
    green: "#50a14f",
    yellow: "#c18401",
    blue: "#4078f2",
    magenta: "#a626a4",
    cyan: "#0184bc",
    white: "#a0a1a7",
    brightBlack: "#4f525e",
    brightRed: "#e06c75",
    brightGreen: "#98c379",
    brightYellow: "#e5c07b",
    brightBlue: "#61afef",
    brightMagenta: "#c678dd",
    brightCyan: "#56b6c2",
    brightWhite: "#ffffff",
  },
  dark: {
    background: "#1e1e2e",
    foreground: "#cdd6f4",
    cursor: "#f5e0dc",
    cursorAccent: "#1e1e2e",
    selectionBackground: "#585b70",
    selectionForeground: "#cdd6f4",
    black: "#45475a",
    red: "#f38ba8",
    green: "#a6e3a1",
    yellow: "#f9e2af",
    blue: "#89b4fa",
    magenta: "#f5c2e7",
    cyan: "#94e2d5",
    white: "#bac2de",
    brightBlack: "#585b70",
    brightRed: "#f38ba8",
    brightGreen: "#a6e3a1",
    brightYellow: "#f9e2af",
    brightBlue: "#89b4fa",
    brightMagenta: "#f5c2e7",
    brightCyan: "#94e2d5",
    brightWhite: "#a6adc8",
  },
}

const debugTerminal = (...values: unknown[]) => {
  if (!import.meta.env.DEV) return
  console.debug("[terminal]", ...values)
}

const useTerminalUiBindings = (input: {
  container: HTMLDivElement
  term: Term
  cleanups: VoidFunction[]
  handlePointerDown: () => void
  handleLinkClick: (event: MouseEvent) => void
}) => {
  const handleCopy = (event: ClipboardEvent) => {
    const selection = input.term.getSelection()
    if (!selection) return
    const clipboard = event.clipboardData
    if (!clipboard) return
    event.preventDefault()
    clipboard.setData("text/plain", selection)
  }

  const handlePaste = (event: ClipboardEvent) => {
    const clipboard = event.clipboardData
    const text = clipboard?.getData("text/plain") ?? clipboard?.getData("text") ?? ""
    if (!text) return
    event.preventDefault()
    event.stopPropagation()
    input.term.paste(text)
  }

  const handleTextareaFocus = () => {
    input.term.options.cursorBlink = true
  }
  const handleTextareaBlur = () => {
    input.term.options.cursorBlink = false
  }

  input.container.addEventListener("copy", handleCopy, true)
  input.cleanups.push(() => input.container.removeEventListener("copy", handleCopy, true))
  input.container.addEventListener("paste", handlePaste, true)
  input.cleanups.push(() => input.container.removeEventListener("paste", handlePaste, true))
  input.container.addEventListener("pointerdown", input.handlePointerDown)
  input.cleanups.push(() => input.container.removeEventListener("pointerdown", input.handlePointerDown))
  input.container.addEventListener("click", input.handleLinkClick, { capture: true })
  input.cleanups.push(() =>
    input.container.removeEventListener("click", input.handleLinkClick, { capture: true }),
  )
  input.term.textarea?.addEventListener("focus", handleTextareaFocus)
  input.term.textarea?.addEventListener("blur", handleTextareaBlur)
  input.cleanups.push(() => input.term.textarea?.removeEventListener("focus", handleTextareaFocus))
  input.cleanups.push(() => input.term.textarea?.removeEventListener("blur", handleTextareaBlur))
}

const persistTerminal = (input: {
  term: Term | undefined
  addon: SerializeAddon | undefined
  cursor: number
  id: string
  onCleanup?: (pty: Partial<LocalPTY> & { id: string }) => void
}) => {
  if (!input.addon || !input.onCleanup || !input.term) return
  const buffer = (() => {
    try {
      return input.addon.serialize()
    } catch {
      debugTerminal("failed to serialize terminal buffer")
      return ""
    }
  })()
  input.onCleanup({
    id: input.id,
    buffer,
    cursor: input.cursor,
    rows: input.term.rows,
    cols: input.term.cols,
    scrollY: input.term.getViewportY(),
  })
}

export const Terminal = (props: TerminalProps) => {
  const platform = usePlatform()
  const settings = useSettings()
  const theme = useTheme()
  const language = useLanguage()
  const server = useServer()
  let container!: HTMLDivElement
  const [local, others] = splitProps(props, ["pty", "class", "classList", "onConnect", "onConnectError", "forceDark"])
  const id = local.pty.id
  const restore = typeof local.pty.buffer === "string" ? local.pty.buffer : ""
  const restoreSize =
    restore &&
    typeof local.pty.cols === "number" &&
    Number.isSafeInteger(local.pty.cols) &&
    local.pty.cols > 0 &&
    typeof local.pty.rows === "number" &&
    Number.isSafeInteger(local.pty.rows) &&
    local.pty.rows > 0
      ? { cols: local.pty.cols, rows: local.pty.rows }
      : undefined
  const scrollY = typeof local.pty.scrollY === "number" ? local.pty.scrollY : undefined
  let term: Term | undefined
  let ghostty: Ghostty
  let serializeAddon: SerializeAddon
  let fitAddon: FitAddon
  let handleResize: () => void
  let fitFrame: number | undefined
  let sizeTimer: ReturnType<typeof setTimeout> | undefined
  let pendingSize: { cols: number; rows: number } | undefined
  let lastSize: { cols: number; rows: number } | undefined
  let disposed = false
  const cleanups: VoidFunction[] = []
  const start =
    typeof local.pty.cursor === "number" && Number.isSafeInteger(local.pty.cursor) ? local.pty.cursor : undefined
  let cursor = start ?? 0
  let output: ReturnType<typeof terminalWriter> | undefined
  let cloudApi: CloudTerminalApi | undefined

  const cleanup = () => {
    if (!cleanups.length) return
    const fns = cleanups.splice(0).reverse()
    for (const fn of fns) {
      try {
        fn()
      } catch (err) {
        debugTerminal("cleanup failed", err)
      }
    }
  }

  const pushSize = (cols: number, rows: number) => {
    if (!cloudApi) return
    return cloudApi.resize(id, rows, cols).catch((err) => {
      debugTerminal("failed to sync cloud terminal size", err)
    })
  }

  const getTerminalColors = (): TerminalColors => {
    const mode = local.forceDark || theme.mode() === "dark" ? "dark" : "light"
    return DEFAULT_TERMINAL_COLORS[mode]
  }

  const terminalColors = createMemo(getTerminalColors)

  const scheduleFit = () => {
    if (disposed) return
    if (!fitAddon) return
    if (fitFrame !== undefined) return
    fitFrame = requestAnimationFrame(() => {
      fitFrame = undefined
      if (disposed) return
      fitAddon.fit()
    })
  }

  const scheduleSize = (cols: number, rows: number) => {
    if (disposed) return
    if (lastSize?.cols === cols && lastSize?.rows === rows) return
    pendingSize = { cols, rows }
    if (!lastSize) {
      lastSize = pendingSize
      void pushSize(cols, rows)
      return
    }
    if (sizeTimer !== undefined) return
    sizeTimer = setTimeout(() => {
      sizeTimer = undefined
      const next = pendingSize
      if (!next) return
      pendingSize = undefined
      if (disposed) return
      if (lastSize?.cols === next.cols && lastSize?.rows === next.rows) return
      lastSize = next
      void pushSize(next.cols, next.rows)
    }, 100)
  }

  createEffect(() => {
    const colors = terminalColors()
    if (!term) return
    setOptionIfSupported(term, "theme", colors)
  })

  createEffect(() => {
    const font = monoFontFamily(settings.appearance.font())
    if (!term) return
    setOptionIfSupported(term, "fontFamily", font)
    scheduleFit()
  })

  let zoom = platform.webviewZoom?.()
  createEffect(() => {
    const next = platform.webviewZoom?.()
    if (next === undefined) return
    if (next === zoom) return
    zoom = next
    scheduleFit()
  })

  const focusTerminal = () => {
    const t = term
    if (!t) return
    t.focus()
    t.textarea?.focus()
    setTimeout(() => t.textarea?.focus(), 0)
  }
  const handlePointerDown = () => {
    const activeElement = document.activeElement
    if (activeElement instanceof HTMLElement && activeElement !== container && !container.contains(activeElement)) {
      activeElement.blur()
    }
    focusTerminal()
  }

  const handleLinkClick = (event: MouseEvent) => {
    if (!event.shiftKey && !event.ctrlKey && !event.metaKey) return
    if (event.altKey) return
    if (event.button !== 0) return
    const t = term
    if (!t) return
    const text = getHoveredLinkText(t)
    if (!text) return
    event.preventDefault()
    event.stopImmediatePropagation()
    platform.openLink(text)
  }

  onMount(() => {
    const run = async () => {
      const loaded = await loadGhostty()
      if (disposed) return

      // Wait for terminal font to load before measuring metrics
      if (typeof document !== "undefined" && document.fonts) {
        try {
          await document.fonts.load('14px "FiraCode Nerd Font Mono"')
        } catch {}
      }

      const mod = loaded.mod
      const g = loaded.ghostty

      const currentServer = server.current
      if (!currentServer) throw new Error("No server configured")

      const deviceId = server.key?.replace(/.*\/cloud\/device\/([^/]+)\/proxy.*/, "$1")
      if (!deviceId || deviceId === server.key) throw new Error("Cloud device ID not found in server URL")

      cloudApi = new CloudTerminalApi({ server: currentServer, deviceId })

      const t = new mod.Terminal({
        cursorBlink: true,
        cursorStyle: "bar",
        cols: restoreSize?.cols,
        rows: restoreSize?.rows,
        fontSize: 14,
        fontFamily: '"FiraCode Nerd Font Mono", "JetBrainsMonoNL Nerd Font", "Cascadia Code PL", "Fira Code", "JetBrains Mono", "SFMono-Regular", Menlo, Consolas, "Liberation Mono", "Courier New", monospace',
        allowTransparency: false,
        convertEol: false,
        theme: terminalColors(),
        scrollback: 10_000,
        ghostty: g,
      } as any)
      cleanups.push(() => t.dispose())
      if (disposed) {
        cleanup()
        return
      }
      ghostty = g
      term = t
      output = terminalWriter((data, done) => t.write(data, done))

      t.attachCustomKeyEventHandler((event) => {
        const key = event.key.toLowerCase()
        if (event.ctrlKey && event.shiftKey && !event.metaKey && key === "c") {
          document.execCommand("copy")
          return true
        }
        const config = settings.keybinds.get(TOGGLE_TERMINAL_ID) ?? DEFAULT_TOGGLE_TERMINAL_KEYBIND
        const keybinds = parseKeybind(config)
        return matchKeybind(keybinds, event)
      })

      const fit = new mod.FitAddon()
      const serializer = new SerializeAddon()
      cleanups.push(() => disposeIfDisposable(fit))
      t.loadAddon(serializer)
      t.loadAddon(fit)
      fitAddon = fit
      serializeAddon = serializer

      t.open(container)
      useTerminalUiBindings({ container, term: t, cleanups, handlePointerDown, handleLinkClick })
      focusTerminal()

      // IME support: ghostty-web doesn't handle compositionend natively
      const textarea = container.querySelector("textarea") as HTMLTextAreaElement | null
      if (textarea) {
        let composing = false
        const onCompositionStart = () => { composing = true }
        const onCompositionEnd = (e: CompositionEvent) => {
          composing = false
          const data = e.data
          if (data) {
            cloudApi?.sendInput(id, data).catch((err) => {
              debugTerminal("failed to send IME input", err)
            })
          }
          textarea.value = ""
        }
        const onInput = (e: InputEvent) => {
          if (composing) return
          if (e.isComposing) return
          if (e.inputType === "insertCompositionText") return
          // For non-IME input, let ghostty-web's keydown handler deal with it
        }
        textarea.addEventListener("compositionstart", onCompositionStart)
        textarea.addEventListener("compositionend", onCompositionEnd as EventListener)
        textarea.addEventListener("input", onInput as EventListener)
        cleanups.push(() => {
          textarea.removeEventListener("compositionstart", onCompositionStart)
          textarea.removeEventListener("compositionend", onCompositionEnd as EventListener)
          textarea.removeEventListener("input", onInput as EventListener)
        })
      }

      if (typeof document !== "undefined" && document.fonts) {
        document.fonts.ready.then(scheduleFit)
      }

      const onResize = t.onResize((size) => {
        scheduleSize(size.cols, size.rows)
      })
      cleanups.push(() => disposeIfDisposable(onResize))

      const onData = t.onData((data) => {
        cloudApi?.sendInput(id, data).catch((err) => {
          debugTerminal("failed to send cloud terminal input", err)
        })
      })
      cleanups.push(() => disposeIfDisposable(onData))

      const onKey = t.onKey((key) => {
        if (key.key == "Enter") {
          props.onSubmit?.()
        }
      })
      cleanups.push(() => disposeIfDisposable(onKey))

      const startResize = () => {
        fit.observeResize()
        handleResize = scheduleFit
        window.addEventListener("resize", handleResize)
        cleanups.push(() => window.removeEventListener("resize", handleResize))
      }

      const write = (data: string) =>
        new Promise<void>((resolve) => {
          if (!output) {
            resolve()
            return
          }
          output.push(data)
          output.flush(resolve)
        })

      if (restore && restoreSize) {
        await write(restore)
        fit.fit()
        scheduleSize(t.cols, t.rows)
        if (scrollY !== undefined) t.scrollToLine(scrollY)
        startResize()
      } else {
        fit.fit()
        scheduleSize(t.cols, t.rows)
        if (restore) {
          await write(restore)
          if (scrollY !== undefined) t.scrollToLine(scrollY)
        }
        startResize()
      }

      // SSE output stream
      const cleanupSse = cloudApi.connectSse(
        id,
        (event) => {
          if (disposed) return
          if (event.type === "data" && event.data) {
            try {
              const bin = atob(event.data)
              const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
              const decoded = new TextDecoder().decode(bytes)
              output?.push(decoded)
              cursor += decoded.length
            } catch (err) {
              debugTerminal("failed to decode SSE base64 data", err)
            }
          } else if (event.type === "exit") {
            local.onConnectError?.(new Error(`Terminal exited with code ${event.exitCode ?? 0}`))
          }
        },
        (error, fatal) => {
          if (disposed) return
          debugTerminal("SSE error", error, fatal)
          if (fatal) {
            local.onConnectError?.(error)
          }
        },
      )
      cleanups.push(cleanupSse)

      // WS input channel
      cloudApi.connectInputWs()
      local.onConnect?.()
      scheduleSize(t.cols, t.rows)
    }

    void run().catch((err) => {
      if (disposed) return
      showToast({
        variant: "error",
        title: language.t("terminal.connectionLost.title"),
        description: err instanceof Error ? err.message : language.t("terminal.connectionLost.description"),
      })
      local.onConnectError?.(err)
    })
  })

  onCleanup(() => {
    disposed = true
    if (fitFrame !== undefined) cancelAnimationFrame(fitFrame)
    if (sizeTimer !== undefined) clearTimeout(sizeTimer)
    cloudApi?.disconnect()

    const finalize = () => {
      persistTerminal({ term, addon: serializeAddon, cursor, id, onCleanup: props.onCleanup })
      cleanup()
    }

    if (!output) {
      finalize()
      return
    }

    output.flush(finalize)
  })

  return (
    <div
      ref={container}
      data-component="terminal"
      data-prevent-autofocus
      tabIndex={-1}
      style={{ "background-color": terminalColors().background }}
      classList={{
        ...(local.classList ?? {}),
        "select-text": true,
        "size-full p-2 font-mono relative overflow-hidden": true,
        [local.class ?? ""]: !!local.class,
      }}
      {...others}
    />
  )
}
