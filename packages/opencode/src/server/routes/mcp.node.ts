import { Hono } from "hono"
import { lazy } from "../../util/lazy"

export const McpRoutes = lazy(() =>
  new Hono().all("*", (c) =>
    c.json(
      {
        error: "MCP endpoints are not supported in the Node.js source runtime",
      },
      501,
    ),
  ),
)
