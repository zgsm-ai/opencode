import { base64Decode } from "@opencode-ai/util/encode"
import path from "node:path"
import type { Locator, Page } from "@playwright/test"
import { cleanupTestProject, openSidebar, sessionIDFromUrl, setWorkspacesEnabled } from "../actions"
import { test, expect } from "../fixtures"
import { promptSelector } from "../selectors"

const mobile = { width: 390, height: 844 }

function workspaceDir(url: string) {
  const slug = /\/workspace\/[^/]+\/([^/]+)\/session(?:\/|$)/.exec(url)?.[1] ?? ""
  const dir = base64Decode(slug)
  if (!dir) throw new Error(`Failed to decode workspace directory from url: ${url}`)
  return dir
}

async function createWorkspace(page: Page, slug: string) {
  await openSidebar(page)
  await setWorkspacesEnabled(page, slug, true)
  await page.getByRole("button", { name: "New workspace" }).first().click()
  await expect.poll(() => /\/workspace\/[^/]+\/[^/]+\/session(?:\/|$)/.test(page.url()), { timeout: 45_000 }).toBe(true)

  const dir = workspaceDir(page.url())
  return { dir, name: path.basename(dir) }
}

async function createSession(page: Page, text: string) {
  const prompt = page.locator(promptSelector)
  await expect(prompt).toBeVisible()
  await prompt.click()
  await prompt.fill(text)
  await prompt.press("Enter")
  await expect.poll(() => sessionIDFromUrl(page.url()) ?? "", { timeout: 30_000 }).not.toBe("")
}

async function x(node: Locator) {
  return (await node.boundingBox())?.x ?? -1_000
}

test("workspace routes use the mobile workspace drawer", async ({ page, withProject }) => {
  await page.setViewportSize({ width: 1400, height: 800 })

  await withProject(async (project) => {
    let dir = ""

    try {
      const ws = await createWorkspace(page, project.slug)
      dir = ws.dir
      await createSession(page, `mobile workspace drawer ${Date.now()}`)

      await expect(page.getByPlaceholder("Search workspaces...").first()).toBeVisible()

      await page.setViewportSize(mobile)

      const prompt = page.locator(promptSelector)
      const menu = page.getByRole("button", { name: "Workspaces" }).first()
      const drawer = page.locator('aside[aria-label="Workspaces"]').first()

      await expect(menu).toBeVisible()
      await expect(page.locator('[data-component="sidebar-nav-mobile"]')).toHaveCount(0)
      await expect.poll(async () => (await prompt.boundingBox())?.x ?? 999).toBeLessThan(80)
      await expect.poll(() => x(drawer)).toBeLessThan(0)

      await menu.click()
      await expect(page.locator('[data-component="sidebar-nav-mobile"]')).toHaveCount(0)
      await expect.poll(() => x(drawer)).toBeGreaterThanOrEqual(0)

      const viewport = page.viewportSize()
      if (!viewport) throw new Error("Expected viewport size")
      await page.mouse.click(viewport.width - 10, 200)
      await expect.poll(() => x(drawer)).toBeLessThan(0)

      await menu.click()
      await drawer.getByRole("button", { name: ws.name }).first().click()
      const session = drawer.locator("nav button").first()
      await expect(session).toBeVisible()
      await session.click()
      await expect.poll(() => x(drawer)).toBeLessThan(0)
      await expect(page.getByRole("button", { name: "Toggle menu" })).toHaveCount(0)

      await project.gotoSession()

      const generic = page.locator('[data-component="sidebar-nav-mobile"]').first()
      const rootMenu = page.getByRole("button", { name: "Toggle menu" }).first()

      await expect(rootMenu).toBeVisible()
      await expect(page.locator('aside[aria-label="Workspaces"]')).toHaveCount(0)

      await rootMenu.click()
      await expect.poll(() => x(generic)).toBeGreaterThanOrEqual(0)
    } finally {
      if (dir) await cleanupTestProject(dir)
    }
  })
})
