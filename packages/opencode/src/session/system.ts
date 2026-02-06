import { Ripgrep } from "../file/ripgrep"

import { Instance } from "../project/instance"

import PROMPT_ANTHROPIC from "./prompt/anthropic.txt"
import PROMPT_ANTHROPIC_WITHOUT_TODO from "./prompt/qwen.txt"
import PROMPT_BEAST from "./prompt/beast.txt"
import PROMPT_GEMINI from "./prompt/gemini.txt"

import PROMPT_MEMORY_BANK from "./prompt/memory-bank-guidelines.txt"

import PROMPT_CODEX from "./prompt/codex_header.txt"
import type { Provider } from "@/provider/provider"

export namespace SystemPrompt {
  export function instructions() {
    const memory = PROMPT_MEMORY_BANK.trim()
    return [PROMPT_CODEX.trim(), memory].filter((item) => item).join("\n\n")
  }

  export function provider(model: Provider.Model) {
    const memory = PROMPT_MEMORY_BANK.trim()
    const bundle = (text: string) => (memory ? [text, memory] : [text])
    if (model.api.id.includes("gpt-5")) return bundle(PROMPT_CODEX)
    if (model.api.id.includes("gpt-") || model.api.id.includes("o1") || model.api.id.includes("o3"))
      return bundle(PROMPT_BEAST)
    if (model.api.id.includes("gemini-")) return bundle(PROMPT_GEMINI)
    if (model.api.id.includes("claude")) return bundle(PROMPT_ANTHROPIC)
    return bundle(PROMPT_ANTHROPIC_WITHOUT_TODO)
  }

  export async function environment(model: Provider.Model) {
    const project = Instance.project
    return [
      [
        `You are powered by the model named ${model.api.id}. The exact model ID is ${model.providerID}/${model.api.id}`,
        `Here is some useful information about the environment you are running in:`,
        `<env>`,
        `  Working directory: ${Instance.directory}`,
        `  Is directory a git repo: ${project.vcs === "git" ? "yes" : "no"}`,
        `  Platform: ${process.platform}`,
        `  Today's date: ${new Date().toDateString()}`,
        `</env>`,
        `<files>`,
        `  ${
          project.vcs === "git" && false
            ? await Ripgrep.tree({
                cwd: Instance.directory,
                limit: 200,
              })
            : ""
        }`,
        `</files>`,
      ].join("\n"),
    ]
  }
}
