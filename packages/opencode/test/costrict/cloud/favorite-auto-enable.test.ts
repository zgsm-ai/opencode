import { describe, expect, test } from "bun:test"
// 直接测纯规则模块：favorite.ts 会拉起 Config/effect 等重依赖，与本规则无关。
import { planFavoriteEnable, type PlannableFavorite } from "../../../src/costrict/cloud/favorite-plan"

function item(over: PlannableFavorite): PlannableFavorite {
  return over
}

describe("planFavoriteEnable", () => {
  test("enables never-activated items (Cloud / Downloaded)", () => {
    const plan = planFavoriteEnable(
      [item({ id: "1", slug: "a", status: "Cloud" }), item({ id: "2", slug: "b", status: "Downloaded" })],
      new Map(),
    )

    expect(plan.toEnable.sort()).toEqual(["a", "b"])
    expect(plan.toReactivate).toEqual([])
  })

  test("leaves already Active items alone", () => {
    const plan = planFavoriteEnable([item({ id: "1", slug: "a", status: "Active" })], new Map())

    expect(plan.toEnable).toEqual([])
    expect(plan.toReactivate).toEqual([])
  })

  test("respects a user unload when there is no distribution at all", () => {
    const plan = planFavoriteEnable([item({ id: "1", slug: "a", status: "Unloaded" })], new Map())

    expect(plan.toEnable).toEqual([])
    expect(plan.toReactivate).toEqual([])
  })

  test("re-activates an unloaded item when an admin re-pushed it after the unload", () => {
    // 水位线停在 1 月，管理员 2 月重推 → 穿透用户的 unload
    const plan = planFavoriteEnable(
      [item({ id: "1", slug: "a", status: "Unloaded", lastAppliedDistributionAt: "2026-01-01T00:00:00Z" })],
      new Map([["1", "2026-02-01T00:00:00Z"]]),
    )

    expect(plan.toReactivate).toEqual(["a"])
    expect(plan.watermarks).toEqual([{ slug: "a", at: "2026-02-01T00:00:00Z" }])
  })

  test("does NOT re-activate when the distribution is the one already applied", () => {
    // 这正是「用户关掉了管理员推来的项」的常态：分发没变新，就该保持关闭，
    // 否则用户永远关不掉一个被分发过的 skill。
    const plan = planFavoriteEnable(
      [item({ id: "1", slug: "a", status: "Unloaded", lastAppliedDistributionAt: "2026-02-01T00:00:00Z" })],
      new Map([["1", "2026-02-01T00:00:00Z"]]),
    )

    expect(plan.toReactivate).toEqual([])
    expect(plan.watermarks).toEqual([])
  })

  test("re-activates an unloaded item that never recorded a watermark", () => {
    const plan = planFavoriteEnable(
      [item({ id: "1", slug: "a", status: "Unloaded" })],
      new Map([["1", "2026-02-01T00:00:00Z"]]),
    )

    expect(plan.toReactivate).toEqual(["a"])
  })

  test("advances the watermark for a fresh distribution on an already-Active item", () => {
    // 即使这一轮不需要启用，也要推进水位线：否则用户之后 unload，这条早已
    // 应用过的分发会在下一轮把它重新打开。
    const plan = planFavoriteEnable(
      [item({ id: "1", slug: "a", status: "Active" })],
      new Map([["1", "2026-02-01T00:00:00Z"]]),
    )

    expect(plan.toEnable).toEqual([])
    expect(plan.toReactivate).toEqual([])
    expect(plan.watermarks).toEqual([{ slug: "a", at: "2026-02-01T00:00:00Z" }])
  })
})
