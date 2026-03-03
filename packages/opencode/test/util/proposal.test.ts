import { describe, expect, test } from "bun:test"
import { proposalTag } from "../../src/cli/cmd/tui/util/proposal"

describe("util.proposal", () => {
  test("prefers the proposal heading as a structured tag", () => {
    const text = `# 需求: 登录态过期自动续期

## 背景与目标
用户在接口超时后需要自动恢复登录态。

## 需求拆解
- 子需求 1: 补充续期逻辑  
`

    expect(proposalTag(text)).toBe("登录态过期自动续期")
  })

  test("drops the heading prefix before the first colon", () => {
    const text = `# 需求: 贪吃蛇游戏（HTML5 + JavaScript 基础版）`

    expect(proposalTag(text)).toBe("贪吃蛇游戏（HTML5 + JavaScript 基础版）")
  })

  test("falls back to the first sub requirement", () => {
    const text = `## 需求拆解
- 子需求 1: 补充命令行参数支持
  - 功能描述: 支持从命令行透传仓库路径
`

    expect(proposalTag(text)).toBe("子需 补充命令行参数支持")
  })

  test("falls back to the background summary", () => {
    const text = `## 背景与目标
当前弹窗文案被截断，用户无法快速识别提案。
`

    expect(proposalTag(text)).toBe("背景 当前弹窗文案被截断，用户无法快速识别提案。")
  })
})
