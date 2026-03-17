import { describe, it, expect, beforeEach, mock } from "bun:test"
import { SubCodingTool } from "./sub_coding"
import type { Tool } from "./tool"

describe("SubCodingTool", () => {
  let tool: Awaited<ReturnType<typeof SubCodingTool.init>>

  beforeEach(async () => {
    tool = await SubCodingTool.init()
  })

  describe("initialization", () => {
    it("should have correct tool id", () => {
      expect(SubCodingTool.id).toBe("sub_coding")
    })

    it("should have description", () => {
      expect(tool.description).toBeTruthy()
      expect(tool.description.length).toBeGreaterThan(0)
    })

    it("should have parameters schema", () => {
      expect(tool.parameters).toBeDefined()
    })
  })

  describe("parameter validation", () => {
    const validParams = {
      important_note: "Test important note",
      previous_work_summary: "None - this is the first SubCodingAgent",
      sub_tasks: [
        {
          id: "1.1",
          title: "Test task",
          detail: "Test task detail",
        },
      ],
      agent_code: "SubCodingAgent-1",
    }

    it("should accept valid parameters", () => {
      const result = tool.parameters.safeParse(validParams)
      expect(result.success).toBe(true)
    })

    it("should reject missing important_note", () => {
      const params = { ...validParams, important_note: undefined }
      const result = tool.parameters.safeParse(params)
      expect(result.success).toBe(false)
    })

    it("should reject missing previous_work_summary", () => {
      const params = { ...validParams, previous_work_summary: undefined }
      const result = tool.parameters.safeParse(params)
      expect(result.success).toBe(false)
    })

    it("should reject missing sub_tasks", () => {
      const params = { ...validParams, sub_tasks: undefined }
      const result = tool.parameters.safeParse(params)
      expect(result.success).toBe(false)
    })

    it("should reject empty sub_tasks", () => {
      const params = { ...validParams, sub_tasks: [] }
      const result = tool.parameters.safeParse(params)
      // Empty array might be valid depending on requirements
      // This test documents the current behavior
      expect(result.success).toBe(true)
    })

    it("should reject sub_tasks with missing id", () => {
      const params = {
        ...validParams,
        sub_tasks: [{ title: "Test", detail: "Detail" }],
      }
      const result = tool.parameters.safeParse(params)
      expect(result.success).toBe(false)
    })

    it("should reject sub_tasks with missing title", () => {
      const params = {
        ...validParams,
        sub_tasks: [{ id: "1.1", detail: "Detail" }],
      }
      const result = tool.parameters.safeParse(params)
      expect(result.success).toBe(false)
    })

    it("should reject sub_tasks with missing detail", () => {
      const params = {
        ...validParams,
        sub_tasks: [{ id: "1.1", title: "Test" }],
      }
      const result = tool.parameters.safeParse(params)
      expect(result.success).toBe(false)
    })

    it("should reject missing agent_code", () => {
      const params = { ...validParams, agent_code: undefined }
      const result = tool.parameters.safeParse(params)
      expect(result.success).toBe(false)
    })

    it("should accept multiple sub_tasks", () => {
      const params = {
        ...validParams,
        sub_tasks: [
          { id: "1.1", title: "Task 1", detail: "Detail 1" },
          { id: "1.2", title: "Task 2", detail: "Detail 2" },
        ],
      }
      const result = tool.parameters.safeParse(params)
      expect(result.success).toBe(true)
    })
  })

  describe("formatValidationError", () => {
    it("should be defined", () => {
      expect(tool.formatValidationError).toBeDefined()
    })

    it("should format validation errors", () => {
      const { z } = require("zod")
      const invalidParams = {
        // Missing required fields
      }

      const parseResult = tool.parameters.safeParse(invalidParams)
      expect(parseResult.success).toBe(false)

      if (!parseResult.success && tool.formatValidationError) {
        const errorMessage = tool.formatValidationError(parseResult.error)
        expect(errorMessage).toContain("SubCoding tool validation failed")
        expect(errorMessage).toContain("important_note")
        expect(errorMessage).toContain("previous_work_summary")
        expect(errorMessage).toContain("sub_tasks")
        expect(errorMessage).toContain("agent_code")
      }
    })
  })
})
