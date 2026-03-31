import "../node-shims/bun.mjs"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import { EOL } from "node:os"

process.env.OPENCODE_DISABLE_DEFAULT_PLUGINS = "1"

const [{ Log }, { Installation }, { Server }] = await Promise.all([
  import("./util/log"),
  import("./installation"),
  import("./server/server"),
])

const cli = yargs(hideBin(process.argv))
  .scriptName("cs")
  .help("help", "show help")
  .alias("help", "h")
  .version(
    "version",
    "show version number",
    `${Installation.VERSION} (commit: ${Installation.COMMIT_HASH}, built: ${Installation.BUILD_TIME})`,
  )
  .alias("version", "v")
  .command(
    "serve",
    "starts a headless cs server using Node.js source runtime",
    (cmd) =>
      cmd
        .option("port", {
          type: "number",
          default: 4096,
        })
        .option("hostname", {
          type: "string",
          default: "0.0.0.0",
        }),
    async (args) => {
      await Log.init({
        print: true,
        dev: Installation.isLocal(),
        level: Installation.isLocal() ? "DEBUG" : "INFO",
      })

      if (!process.env.OPENCODE_SERVER_PASSWORD && !process.env.COSTRICT_SERVER_PASSWORD) {
        process.stderr.write("Warning: COSTRICT_SERVER_PASSWORD is not set; server is unsecured." + EOL)
      }

      const server = Server.listen({
        port: args.port,
        hostname: args.hostname,
      })
      process.stdout.write(`cs source server listening on ${server.url.toString()}` + EOL)
      await new Promise(() => {})
    },
  )
  .demandCommand(1)
  .strict()

await cli.parse()
