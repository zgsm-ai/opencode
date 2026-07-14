import { describe, expect, test } from "bun:test"
import { createFileRefresh } from "./file-refresh"

const tick = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

describe("createFileRefresh", () => {
  test("coalesces repeated schedule calls within the debounce window", async () => {
    const loaded: string[] = []
    const refresh = createFileRefresh({
      normalize: (x) => x,
      getChunk: () => undefined,
      load: (file) => loaded.push(file),
      wait: 20,
    })
    refresh.schedule("a.ts")
    refresh.schedule("a.ts")
    refresh.schedule("a.ts")
    await tick(60)
    expect(loaded).toEqual(["a.ts"])
  })

  test("schedules different files independently", async () => {
    const loaded: string[] = []
    const refresh = createFileRefresh({
      normalize: (x) => x,
      getChunk: () => undefined,
      load: (file) => loaded.push(file),
      wait: 20,
    })
    refresh.schedule("a.ts")
    refresh.schedule("b.ts")
    await tick(60)
    expect(loaded.sort()).toEqual(["a.ts", "b.ts"])
  })

  test("passes force: true and offset: 1", async () => {
    const calls: Array<{ file: string; force: boolean; offset: number; limit?: number }> = []
    const refresh = createFileRefresh({
      normalize: (x) => x,
      getChunk: () => undefined,
      load: (file, opts) => calls.push({ file, force: opts.force, offset: opts.offset, limit: opts.limit }),
      wait: 5,
    })
    refresh.schedule("a.ts")
    await tick(20)
    expect(calls).toEqual([{ file: "a.ts", force: true, offset: 1, limit: undefined }])
  })

  test("computes limit from chunk lines when set", async () => {
    const loaded: Array<{ file: string; limit?: number }> = []
    const refresh = createFileRefresh({
      normalize: (x) => x,
      getChunk: () => ({ offset: 1, lines: 1600, totalLines: 2000 }),
      load: (file, opts) => loaded.push({ file, limit: opts.limit }),
      wait: 10,
    })
    refresh.schedule("a.ts")
    await tick(30)
    expect(loaded).toEqual([{ file: "a.ts", limit: 1600 }])
  })

  test("accounts for non-1 chunk offset", async () => {
    const loaded: Array<{ file: string; limit?: number }> = []
    const refresh = createFileRefresh({
      normalize: (x) => x,
      getChunk: () => ({ offset: 801, lines: 800, totalLines: 2000 }),
      load: (file, opts) => loaded.push({ file, limit: opts.limit }),
      wait: 10,
    })
    refresh.schedule("a.ts")
    await tick(30)
    expect(loaded[0]?.limit).toBe(1600)
  })

  test("reads chunk at fire time, not schedule time", async () => {
    const loaded: Array<{ file: string; limit?: number }> = []
    let lines = 800
    const refresh = createFileRefresh({
      normalize: (x) => x,
      getChunk: () => ({ offset: 1, lines, totalLines: 2000 }),
      load: (file, opts) => loaded.push({ file, limit: opts.limit }),
      wait: 30,
    })
    refresh.schedule("a.ts")
    lines = 1600
    refresh.schedule("a.ts")
    await tick(80)
    expect(loaded).toEqual([{ file: "a.ts", limit: 1600 }])
  })

  test("falls back to undefined limit when chunk is missing", async () => {
    const loaded: Array<{ file: string; limit?: number }> = []
    const refresh = createFileRefresh({
      normalize: (x) => x,
      getChunk: () => undefined,
      load: (file, opts) => loaded.push({ file, limit: opts.limit }),
      wait: 5,
    })
    refresh.schedule("a.ts")
    await tick(20)
    expect(loaded[0]?.limit).toBeUndefined()
  })

  test("falls back to undefined limit when chunk.lines is zero", async () => {
    const loaded: Array<{ file: string; limit?: number }> = []
    const refresh = createFileRefresh({
      normalize: (x) => x,
      getChunk: () => ({ offset: 0, lines: 0, totalLines: 0 }),
      load: (file, opts) => loaded.push({ file, limit: opts.limit }),
      wait: 5,
    })
    refresh.schedule("a.ts")
    await tick(20)
    expect(loaded[0]?.limit).toBeUndefined()
  })

  test("cancelAll prevents pending loads from firing", async () => {
    const loaded: string[] = []
    const refresh = createFileRefresh({
      normalize: (x) => x,
      getChunk: () => undefined,
      load: (file) => loaded.push(file),
      wait: 30,
    })
    refresh.schedule("a.ts")
    refresh.cancelAll()
    await tick(80)
    expect(loaded).toEqual([])
  })

  test("cancel removes a single file from the queue", async () => {
    const loaded: string[] = []
    const refresh = createFileRefresh({
      normalize: (x) => x,
      getChunk: () => undefined,
      load: (file) => loaded.push(file),
      wait: 30,
    })
    refresh.schedule("a.ts")
    refresh.schedule("b.ts")
    refresh.cancel("a.ts")
    await tick(80)
    expect(loaded).toEqual(["b.ts"])
  })

  test("cancel is a no-op for unknown files", async () => {
    const loaded: string[] = []
    const refresh = createFileRefresh({
      normalize: (x) => x,
      getChunk: () => undefined,
      load: (file) => loaded.push(file),
      wait: 10,
    })
    refresh.schedule("a.ts")
    refresh.cancel("b.ts")
    await tick(40)
    expect(loaded).toEqual(["a.ts"])
  })

  test("ignores input that normalizes to empty", async () => {
    const loaded: string[] = []
    const refresh = createFileRefresh({
      normalize: () => "",
      getChunk: () => undefined,
      load: (file) => loaded.push(file),
      wait: 5,
    })
    refresh.schedule("whatever")
    await tick(20)
    expect(loaded).toEqual([])
  })
})
