/**
 * Pure decision logic for the two-way path sync between the app-ai-native URL
 * (`/workflow/<multica-path>`) and the embedded multica iframe. Given the
 * current state and an event, returns the side effects to perform; the
 * component performs them. Kept pure + stateless so the loop-avoidance logic is
 * unit-testable without a router or iframe.
 */

export interface SyncState {
  /** Current `rest` splat from `/workflow/*rest` (no leading slash). */
  currentSplat: string;
  /** The multica path the child most recently reported / is heading to (leading slash). */
  lastChildPath: string;
}

/** URL splat ("ipd-1/issues/x") → multica path ("/ipd-1/issues/x"); "" → "/". */
export function splatToPath(splat: string): string {
  const trimmed = splat.replace(/^\/+/, "");
  return trimmed === "" ? "/" : `/${trimmed}`;
}

/** multica path ("/ipd-1/issues/x") → URL splat ("ipd-1/issues/x"); "/" → "". */
export function pathToSplat(path: string): string {
  return path.replace(/^\/+/, "").replace(/\/+$/, "");
}

export type SyncEvent =
  | { kind: "childLocation"; path: string }
  | { kind: "splatChange"; splat: string };

export interface SyncAction {
  /** URL to navigate to with `replace: true` (the `/workflow` + path form). */
  updateUrl?: string;
  /** multica path to post as `{ type: "multica:route" }` to the iframe. */
  postRoute?: string;
  /** New value for `lastChildPath`. */
  lastChildPath?: string;
}

/**
 * Decide the next action for a sync event. Loop avoidance rests on
 * `lastChildPath`: the parent updates the URL on a child location report; the
 * splat change that triggers is a no-op because the new splat already equals
 * `lastChildPath`. A splat change matching the child's current location is a
 * no-op. Everything else is "skip when unchanged" at the call sites.
 */
export function decideSyncAction(state: SyncState, event: SyncEvent): SyncAction {
  if (event.kind === "childLocation") {
    return {
      updateUrl: `/workflow${event.path === "/" ? "" : event.path}`,
      lastChildPath: event.path,
    };
  }
  const path = splatToPath(event.splat);
  if (path === state.lastChildPath) return {};
  return { postRoute: path, lastChildPath: path };
}
