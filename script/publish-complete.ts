#!/usr/bin/env bun

// import { Script } from "@opencode-ai/script"
import { $ } from "bun"

// if (!Script.preview) {
// await $`gh release edit v${Script.version} --draft=false`
// }

await $`bun install`

await $`gh release download --pattern "costrict-cli-linux-*64.tar.gz" --pattern "costrict-cli-darwin-*64.zip" -D dist`

await import(`../packages/opencode/script/publish-registries.ts`)
