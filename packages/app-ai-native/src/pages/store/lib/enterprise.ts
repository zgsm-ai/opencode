// Enterprise ("大客户") branding for store items.
//
// DATA SOURCE: on first load we fetch `GET /api/enterprise-customers` (returns `{ customers: {
// ids, name, logo }[] }`, readable by any signed-in user). The fetched list replaces the in-memory
// roster; if the fetch fails or returns nothing (e.g. demo mode, where the endpoint is absent) we
// keep the built-in DEMO_FALLBACK roster below. The current roster lives in a module-level Solid
// signal, so `matchEnterprise` / `matchEnterpriseByName` (called inside view memos) re-resolve and
// re-brand the cards the moment the backend data lands. The public API stays the same — call sites
// are untouched.
//
// HOW TO ADD A 大客户 (demo fallback only — real wiring comes from the backend response):
//   1. Add (or reuse) a brand logo data URI in `./enterprise-logos.ts` (see notes there — the
//      DOMINANT color of the artwork becomes the card background `--bc`).
//   2. Append one `EnterpriseConfig` entry to `DEMO_FALLBACK` below:
//        - `name`        display name beside the logo (可配)
//        - `logo`        logo data URI (可配)
//        - `ids`         REAL backend path: the enterprise's stable uploader account 唯一 ID(s).
//                        An item whose `CapabilityItem.createdBy` equals ANY of them is branded.
//                        (Real data arrives via the API response, which carries `ids`.)
//        - `matchNames`  DEMO fallback: bind by the item's display name(s) (mock data authors items
//                        with shared placeholder users, so `createdBy` is not enterprise-unique).

import { createSignal } from "solid-js"
import { enterpriseApi } from "./api"
import { CMB_LOGO, ICBC_LOGO, CCB_LOGO } from "./enterprise-logos"

export interface EnterpriseInfo {
  /** Display name shown beside the logo (e.g. 招商银行). */
  name: string
  /** Logo as a base64 data URI to avoid cross-origin canvas tainting when extracting colors. */
  logo: string
}

/** One configurable enterprise customer. */
export interface EnterpriseConfig extends EnterpriseInfo {
  /**
   * Real backend key: the enterprise's stable uploader account 唯一 ID(s). An item is branded when
   * `CapabilityItem.createdBy` matches ANY id here — a single 大客户 may register multiple accounts,
   * so list each account's unique ID. The backend response populates this; demo entries may omit it
   * and rely on `matchNames`.
   */
  ids?: string[]
  /**
   * Demo fallback key: bind by the item's (stable) display name(s), since mock data authors items
   * with shared placeholder users and so `createdBy` is not enterprise-unique. Real wiring relies on
   * `ids` from the backend.
   */
  matchNames?: string[]
}

/**
 * Built-in roster used until (and unless) the backend responds: demo mode has no
 * `/api/enterprise-customers` endpoint, so these keep 招行/工行/建行 branded by display name.
 */
const DEMO_FALLBACK: EnterpriseConfig[] = [
  // item-skill-1 (Code Reviewer) → 招商银行 (red brand → red card)
  { name: "招商银行", logo: CMB_LOGO, matchNames: ["Code Reviewer"] },
  // item-plugin-3 (Security Scanner) → 工商银行 (red brand → red card)
  { name: "工商银行", logo: ICBC_LOGO, matchNames: ["Security Scanner"] },
  // item-mcp-2 (Database MCP) → 建设银行 (BLUE brand → blue card; control case proving the
  // extracted --bc tracks the logo's own dominant color, distinct from the two red banks above)
  { name: "建设银行", logo: CCB_LOGO, matchNames: ["Database MCP"] },
]

// Current roster (single source of truth). Initialized to DEMO_FALLBACK so the very first render —
// and demo mode forever — has branding immediately; replaced by backend data once it loads.
const [customers, setCustomers] = createSignal<EnterpriseConfig[]>(DEMO_FALLBACK)

function toEnterpriseInfo(config: EnterpriseConfig): EnterpriseInfo {
  return { name: config.name, logo: config.logo }
}

/**
 * Resolve enterprise branding for an item from its uploader account id (`createdBy`). A 大客户 may
 * own multiple account IDs, so we match when `createdBy` is any of a customer's configured ids.
 * Reads the reactive roster signal, so branding refreshes automatically when backend data arrives.
 * Returns `null` when the uploader is not a configured enterprise.
 */
export function matchEnterprise(createdBy: string | undefined): EnterpriseInfo | null {
  if (!createdBy) return null
  const config = customers().find((entry) => entry.ids?.includes(createdBy))
  return config ? toEnterpriseInfo(config) : null
}

/**
 * Demo-only fallback used when `createdBy` is not enterprise-unique (mock data): resolve by the
 * item's display name. Real backend wiring relies on `matchEnterprise(createdBy)` instead. Reads the
 * same reactive roster signal.
 */
export function matchEnterpriseByName(name: string | undefined): EnterpriseInfo | null {
  if (!name) return null
  const config = customers().find((entry) => entry.matchNames?.includes(name))
  return config ? toEnterpriseInfo(config) : null
}

// One-shot fetch of the backend roster. Guarded so it runs at most once per session regardless of
// how many store views mount. On success-with-data we swap in the backend list (ids-keyed); on
// failure or empty response we leave DEMO_FALLBACK in place (covers demo mode, where the endpoint
// 404s, and any transient error — branding simply stays on the built-in roster).
let enterpriseLoadStarted = false
export function ensureEnterpriseLoaded() {
  if (enterpriseLoadStarted) return
  enterpriseLoadStarted = true
  enterpriseApi
    .list()
    .then((res) => {
      const fetched = (res.customers ?? [])
        .filter((c) => Array.isArray(c.ids) && c.ids.length > 0 && c.name && c.logo)
        .map<EnterpriseConfig>((c) => ({ name: c.name, logo: c.logo, ids: c.ids }))
      if (fetched.length > 0) setCustomers(fetched)
    })
    .catch(() => {
      // Keep DEMO_FALLBACK on error (demo mode / network failure).
    })
}
