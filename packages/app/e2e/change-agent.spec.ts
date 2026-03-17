import fs from "node:fs/promises"
import path from "node:path"
import type { Page } from "@playwright/test"
import { test, expect } from "./fixtures"
import { createSdk, promptSelector } from "./utils"

function sessionIDFromUrl(url: string) {
  const match = /\/session\/([^/?#]+)/.exec(url)
  return match?.[1]
}

async function selectAgent(page: Page, agent: string) {
  const trigger = page.locator('[data-slot="select-select-trigger"]').first()
  const current = (await trigger.innerText()).trim()
  if (current.includes(agent)) return
  await trigger.click()
  const item = page.locator('[data-slot="select-select-item"]').filter({ hasText: agent }).first()
  await expect(item).toBeVisible()
  await item.click()
}

async function getUserText(sdk: ReturnType<typeof createSdk>, sessionID: string) {
  const messages = await sdk.session.messages({ sessionID, limit: 20 }).then((result) => result.data ?? [])
  return messages
    .filter((message) => message.info.role === "user")
    .flatMap((message) => message.parts)
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
}

test("proposal agent keeps text input enabled", async ({ page, gotoSession }) => {
  await gotoSession()
  await selectAgent(page, "proposal")
  await expect(page.locator(promptSelector)).toBeVisible()
  await expect(page.locator('[data-component="change-agent-picker"]')).toHaveCount(0)
})

const cases = [
  {
    agent: "coding",
    expectText: "请确保本次编码任务高质量完成",
  },
  {
    agent: "FixAgent",
    expectText: "请认真收集用户反馈并进行代码修复和改进",
  },
  {
    agent: "taskcheck",
    expectText: '请以"用户原始需求"为覆盖基准',
  },
] as const

for (const item of cases) {
  test(`change agent ${item.agent} starts by selecting a change-id`, async ({ page, sdk, gotoSession, directory }) => {
    const changeId = `e2e-${item.agent.toLowerCase()}-${Date.now()}`
    const proposalDir = path.join(directory, "proposal", changeId)
    const taskPath = `proposal/${changeId}/task.md`
    const userInput = "用户反馈：设置页中的保存按钮没有生效，请补齐任务并校验。"
    const sessions: string[] = []

    await fs.mkdir(proposalDir, { recursive: true })
    await fs.writeFile(
      path.join(proposalDir, "proposal.md"),
      ["# 提案：修复设置页保存流程", "", "## 背景", "设置页在提交后没有正确持久化配置。"].join("\n"),
    )
    await fs.writeFile(
      path.join(proposalDir, "task.md"),
      ["# Tasks", "", "- [ ] 修复设置页提交逻辑", "- [ ] 补充必要校验"].join("\n"),
    )
    await fs.writeFile(path.join(proposalDir, "user_input.md"), userInput)

    try {
      await gotoSession()
      await selectAgent(page, item.agent)

      await expect(page.locator(promptSelector)).toHaveCount(0)
      const picker = page.locator('[data-component="change-agent-picker"]')
      await expect(picker).toBeVisible()

      await picker.locator("button").filter({ hasText: changeId }).first().click()
      await expect(page).toHaveURL(/\/session\/[^/?#]+/, { timeout: 30_000 })

      const sessionID = sessionIDFromUrl(page.url())
      if (!sessionID) throw new Error(`Failed to parse session id from url: ${page.url()}`)
      sessions.push(sessionID)

      await expect.poll(() => getUserText(sdk, sessionID), { timeout: 30_000 }).toContain(changeId)

      await expect.poll(() => getUserText(sdk, sessionID), { timeout: 30_000 }).toContain(taskPath)

      await expect.poll(() => getUserText(sdk, sessionID), { timeout: 30_000 }).toContain(item.expectText)

      if (item.agent === "taskcheck") {
        await expect.poll(() => getUserText(sdk, sessionID), { timeout: 30_000 }).toContain(userInput)
      }
    } finally {
      await Promise.all(sessions.map((sessionID) => sdk.session.delete({ sessionID }).catch(() => undefined)))
      await fs.rm(proposalDir, { recursive: true, force: true })
    }
  })
}
