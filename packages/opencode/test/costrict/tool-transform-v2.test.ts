import { describe, expect, test } from "bun:test"
import { ToolInputRecordError, toolInputFormatter, toolInputRecord } from "../../src/costrict/utils/tool-transform-v2"

describe("costrict.tool-transform-v2", () => {
  test("keeps object input as record", () => {
    const result = toolInputRecord({ path: "src/index.ts" }, "call-1")
    expect(result).toEqual({ path: "src/index.ts" })
  })

  test("parses JSON object string input", () => {
    const result = toolInputRecord("{\"path\":\"src/index.ts\"}", "call-1")
    expect(result).toEqual({ path: "src/index.ts" })
  })

  test("accepts empty string input as empty record", () => {
    const result = toolInputRecord("", "call-1")
    expect(result).toEqual({})
  })

  test("throws for invalid string input", () => {
    expect(() => toolInputRecord("not-json", "call-1")).toThrow(ToolInputRecordError)
  })

  test("throws for array input", () => {
    expect(() => toolInputRecord([1, 2, 3], "call-1")).toThrow(ToolInputRecordError)
  })

  test("cleans xml arg key after parsing", () => {
    const result = toolInputFormatter("{\"<arg_key>path\":\"src/index.ts\"}", "call-1")
    expect(result).toEqual({ path: "src/index.ts" })
  })
})
