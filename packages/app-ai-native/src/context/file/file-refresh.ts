type Chunk = { offset: number; lines: number; totalLines: number }

type Options = {
  wait?: number
  normalize: (input: string) => string
  getChunk: (file: string) => Chunk | undefined
  load: (file: string, opts: { force: boolean; offset: number; limit?: number }) => void
}

export function createFileRefresh(opts: Options) {
  const wait = opts.wait ?? 150
  const pending = new Map<string, ReturnType<typeof setTimeout>>()

  const schedule = (input: string) => {
    const file = opts.normalize(input)
    if (!file) return
    const existing = pending.get(file)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => {
      pending.delete(file)
      const chunk = opts.getChunk(file)
      const limit = chunk && chunk.lines > 0
        ? Math.max(0, chunk.offset - 1) + chunk.lines
        : undefined
      opts.load(file, { force: true, offset: 1, limit })
    }, wait)
    pending.set(file, timer)
  }

  const cancel = (file: string) => {
    const t = pending.get(file)
    if (!t) return
    clearTimeout(t)
    pending.delete(file)
  }

  const cancelAll = () => {
    for (const t of pending.values()) clearTimeout(t)
    pending.clear()
  }

  return { schedule, cancel, cancelAll }
}
