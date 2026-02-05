import fs from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"
import { Tiktoken } from "js-tiktoken/lite"

export namespace Token {
  const URL = "https://tiktoken.pages.dev/js/o200k_base.json"
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "resources", "tokenizer")
  const file = path.join(dir, "o200k_base.json")
  const cache = { tok: undefined as Promise<Tiktoken | null> | undefined }

  async function read(): Promise<unknown | null> {
    const ok = await fs
      .stat(file)
      .then(() => true)
      .catch(() => false)
    if (!ok) return null
    const data = await Bun.file(file).json().catch(() => null)
    if (!data) return null
    return data as unknown
  }

  async function fetcher(): Promise<unknown | null> {
    const res = await fetch(URL).catch(() => null)
    if (!res?.ok) return null
    const data = await res.json().catch(() => null)
    if (!data) return null
    return data as unknown
  }

  async function write(data: unknown) {
    await fs.mkdir(dir, { recursive: true }).catch(() => {})
    await Bun.write(Bun.file(file), JSON.stringify(data)).catch(() => {})
  }

  async function ranks(): Promise<unknown | null> {
    const local = await read()
    if (local) return local
    const remote = await fetcher()
    if (!remote) return null
    await write(remote)
    return remote
  }

  async function tokenizer(): Promise<Tiktoken | null> {
    if (cache.tok) return cache.tok
    cache.tok = ranks()
      .then((ranks) => {
        if (!ranks) return null
        return new Tiktoken(ranks as unknown as ConstructorParameters<typeof Tiktoken>[0])
      })
      .catch(() => null)
    return cache.tok
  }

  function fallback(input: string) {
    if (!input) return 0
    const words = input.split(/\s+/).filter(Boolean)
    const count = words.length
    if (count > 0 && input.length / count < 10) return Math.floor(count * 1.3)
    return Math.max(0, Math.round(input.length / 4))
  }

  export async function count(input: string) {
    if (!input) return 0
    const tok = await tokenizer()
    if (!tok) return fallback(input)
    return Promise.resolve()
      .then(() => tok.encode(input).length)
      .catch(() => fallback(input))
  }

  export async function warm() {
    await tokenizer()
  }
}
