import { Hono } from "hono"
import { lazy } from "../../util/lazy"

export const PtyRoutes = lazy(() =>
  new Hono().all("*", (c) =>
    c.json(
      {
        error: "PTY endpoints are not supported in the Node.js source runtime",
      },
      501,
    ),
  ),
)
