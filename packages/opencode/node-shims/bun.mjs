import { createHash } from "node:crypto"
import { promises as fs } from "node:fs"
import { accessSync, statSync } from "node:fs"
import { extname } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { exec as execCallback, spawn as spawnChild } from "node:child_process"
import { promisify } from "node:util"

const exec = promisify(execCallback)

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
}

class BunFile {
  constructor(filePath) {
    this.filePath = filePath
  }

  get size() {
    try {
      return statSync(this.filePath).size
    } catch {
      return undefined
    }
  }

  get type() {
    return MIME_TYPES[extname(this.filePath)] ?? "application/octet-stream"
  }

  async exists() {
    try {
      await fs.access(this.filePath)
      return true
    } catch {
      return false
    }
  }

  async text() {
    return fs.readFile(this.filePath, "utf8")
  }

  async json() {
    return JSON.parse(await this.text())
  }

  async arrayBuffer() {
    const buf = await fs.readFile(this.filePath)
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  }

  async write(content) {
    await fs.writeFile(this.filePath, content)
  }
}

function buildCommand(strings, values) {
  if (Array.isArray(strings?.raw)) {
    let out = ""
    for (let i = 0; i < strings.length; i++) {
      out += strings[i]
      if (i < values.length) {
        const value = values[i]
        if (value && typeof value === "object" && "raw" in value) out += value.raw
        else out += String(value)
      }
    }
    return out
  }

  return String(strings)
}

function shellResult(command, options = {}) {
  const state = {
    cwd: options.cwd,
    quiet: false,
    nothrow: false,
  }

  const runner = {
    cwd(dir) {
      state.cwd = dir
      return runner
    },
    quiet() {
      state.quiet = true
      return runner
    },
    nothrow() {
      state.nothrow = true
      return runner
    },
    async text() {
      try {
        const { stdout, stderr } = await exec(command, { cwd: state.cwd })
        return state.quiet ? stdout : stdout + stderr
      } catch (error) {
        if (state.nothrow) {
          return error.stdout ?? error.stderr ?? String(error)
        }
        throw error
      }
    },
    then(resolve, reject) {
      return runner.text().then(resolve, reject)
    },
  }

  return runner
}

export function $(strings, ...values) {
  return shellResult(buildCommand(strings, values))
}

export function spawn(input, options = {}) {
  const command = Array.isArray(input) ? input : [String(input)]
  const child = spawnChild(command[0], command.slice(1), {
    cwd: options.cwd,
    env: options.env,
    stdio: ["ignore", "pipe", "pipe"],
  })
  child.exited = new Promise((resolve, reject) => {
    child.once("exit", (code) => resolve(code ?? 0))
    child.once("error", reject)
  })
  return child
}

export const Bun = {
  $,
  env: process.env,
  stderr: process.stderr,
  stdin: {
    text: async () => {
      const chunks = []
      for await (const chunk of process.stdin) chunks.push(chunk)
      return Buffer.concat(chunks).toString("utf8")
    },
  },
  file(filePath) {
    return new BunFile(filePath)
  },
  async write(filePath, content) {
    await fs.writeFile(filePath, content)
  },
  which(command) {
    const pathEnv = process.env.PATH ?? ""
    for (const segment of pathEnv.split(":")) {
      const candidate = `${segment}/${command}`
      try {
        accessSync(candidate)
        return candidate
      } catch {}
    }
    return null
  },
  hash(input) {
    const hash = createHash("sha256").update(String(input)).digest()
    return BigInt(`0x${hash.subarray(0, 8).toString("hex")}`)
  },
  stringWidth(input) {
    return [...String(input)].length
  },
  color() {
    return ""
  },
  spawn,
  serve() {
    throw new Error("Bun.serve is not available in the Node.js source runtime")
  },
}

if (!globalThis.Bun) {
  globalThis.Bun = Bun
}

export { fileURLToPath, pathToFileURL }
export default Bun
