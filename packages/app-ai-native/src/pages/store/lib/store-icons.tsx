import type { JSX } from "solid-js"

// 1:1 port of the throwaway design mock's icon set (`const P = {...}` in
// `.playwright-mcp/store-list-switch.html`). Every entry is the raw inner-SVG markup
// (one or more <path>/<rect>/<circle> on a 24×24 viewBox). Paths are trusted constants
// copied verbatim from the mock, so they are injected via innerHTML.
//
// The mock had two render helpers:
//   svg(n,s,c,w)  → stroke version: fill=none stroke=currentColor stroke-width=2 round caps/joins
//   svgF(n,s,c)   → fill version:   fill=currentColor stroke=none
// StoreIcon below merges both: pass `filled` to switch between them.

export type StoreIconName =
  | "skill"
  | "mcp"
  | "command"
  | "subagent"
  | "plugin"
  | "all"
  | "search"
  | "cloud"
  | "upload"
  | "download"
  | "star"
  | "bell"
  | "clock"
  | "layers"
  | "badgeCheck"
  | "checkCircle"
  | "grid"
  | "rows"
  | "caret"
  | "x"
  | "check"

const PATHS: Record<StoreIconName, string> = {
  skill: '<path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.14 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z"/>',
  mcp: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  command: '<path d="m4 17 6-6-6-6"/><path d="M12 19h8"/>',
  subagent:
    '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
  plugin:
    '<path d="M19.44 7.85c-.05.32.06.65.29.88l1.56 1.56c.47.47.71 1.09.71 1.71s-.24 1.23-.71 1.7l-1.61 1.61a.98.98 0 0 1-.84.28c-.47-.07-.8-.48-.96-.93a2.5 2.5 0 1 0-3.22 3.22c.45.16.86.5.93.97a.98.98 0 0 1-.28.84l-1.61 1.61a2.4 2.4 0 0 1-1.7.7 2.4 2.4 0 0 1-1.7-.7l-1.57-1.57a1.03 1.03 0 0 0-.88-.29c-.49.07-.84.5-1.02.97a2.5 2.5 0 1 1-3.24-3.24c.46-.18.9-.53.97-1.02a1.03 1.03 0 0 0-.29-.88L2.7 13.7A2.4 2.4 0 0 1 2 12c0-.62.24-1.23.71-1.7L4.23 8.77c.24-.24.58-.35.92-.3.51.07.88.52 1.07 1a2.5 2.5 0 1 0 3.26-3.25c-.48-.2-.93-.56-1.01-1.07-.05-.34.06-.68.3-.92l1.53-1.52A2.4 2.4 0 0 1 12 2c.62 0 1.23.24 1.7.71l1.57 1.56c.23.23.56.34.88.29.49-.07.84-.5 1.02-.97a2.5 2.5 0 1 1 3.24 3.24c-.47.18-.9.53-.97 1.02z"/>',
  all: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  cloud:
    '<path d="M12 13v8"/><path d="M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24"/><path d="m8 17 4-4 4 4"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
  star: '<path d="M11.48 3.5l2.4 4.86 5.36.78-3.88 3.78.92 5.34-4.8-2.52-4.8 2.52.92-5.34L3.72 9.14l5.36-.78z"/>',
  bell: '<path d="M10.27 21a2 2 0 0 0 3.46 0"/><path d="M3.26 15.33A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.67C19.4 13.9 19 12.5 19 9a7 7 0 1 0-14 0c0 3.5-.4 4.9-1.74 6.33"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  layers: '<path d="M12 2 2 7l10 5 10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
  badgeCheck:
    '<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/>',
  checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  rows: '<rect x="3" y="4" width="18" height="5" rx="1.5"/><rect x="3" y="15" width="18" height="5" rx="1.5"/>',
  caret: '<path d="m6 9 6 6 6-6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
}

export function StoreIcon(props: {
  name: StoreIconName
  size?: number
  filled?: boolean
  class?: string
  style?: JSX.CSSProperties | string
}): JSX.Element {
  const size = () => props.size ?? 16
  const filled = () => props.filled ?? false
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size()}
      height={size()}
      viewBox="0 0 24 24"
      fill={filled() ? "currentColor" : "none"}
      stroke={filled() ? "none" : "currentColor"}
      stroke-width={filled() ? undefined : 2}
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class}
      style={props.style}
      aria-hidden="true"
      innerHTML={PATHS[props.name]}
    />
  )
}
