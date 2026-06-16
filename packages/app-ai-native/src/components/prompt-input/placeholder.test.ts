import { describe, expect, test } from "bun:test"
import { promptPlaceholder } from "./placeholder"

describe("promptPlaceholder", () => {
  const t = (key: string, params?: Record<string, string>) => `${key}${params?.tip ? `:${params.tip}` : ""}`

  test("returns shell placeholder in shell mode", () => {
    const value = promptPlaceholder({
      mode: "shell",
      commentCount: 0,
      tip: "tip",
      t,
    })
    expect(value).toBe("prompt.placeholder.shell")
  })

  test("returns summarize placeholders for comment context", () => {
    expect(promptPlaceholder({ mode: "normal", commentCount: 1, tip: "tip", t })).toBe(
      "prompt.placeholder.summarizeComment",
    )
    expect(promptPlaceholder({ mode: "normal", commentCount: 2, tip: "tip", t })).toBe(
      "prompt.placeholder.summarizeComments",
    )
  })

  test("returns normal placeholder with tip", () => {
    const value = promptPlaceholder({
      mode: "normal",
      commentCount: 0,
      tip: "translated-tip",
      t,
    })
    expect(value).toBe("prompt.placeholder.normal:translated-tip")
  })
})
