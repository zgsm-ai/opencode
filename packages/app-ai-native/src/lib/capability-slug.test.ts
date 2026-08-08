import { describe, expect, test } from "bun:test"
import { slugify } from "./capability-slug"

describe("capability slug", () => {
  test.each([
    ["Skill With Skill", "skill-with-skill"],
    ["MD_to DOCX", "md-to-docx"],
    ["技能 技能2", "技能-技能2"],
    ["Cafe\u0301 技能", "café-技能"],
    ["../技能\\仓库", "技能-仓库"],
    ["😀 Skill", "😀-skill"],
  ])("normalizes %s", (value, expected) => {
    expect(slugify(value)).toBe(expected)
  })
})
