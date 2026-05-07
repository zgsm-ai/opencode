import type { Message, Part } from "@opencode-ai/sdk/v2/client"

export function exportTranscriptAsMarkdown(
  messages: Message[],
  getParts: (messageID: string) => Part[],
): string {
  const lines: string[] = []

  for (const message of messages) {
    const role = message.role === "user" ? "User" : "Assistant"
    lines.push(`## ${role}`)
    lines.push("")

    const parts = getParts(message.id)
    for (const part of parts) {
      if (part.type === "text" && !part.synthetic && !part.ignored) {
        lines.push(part.text)
        lines.push("")
      }
      if (part.type === "reasoning") {
        lines.push(`_Thinking:_ ${part.text}`)
        lines.push("")
      }
      if (part.type === "tool") {
        lines.push(`> Tool: ${part.tool}`)
        lines.push("")
      }
    }
  }

  return lines.join("\n")
}

export function downloadFile(filename: string, content: string, mimeType = "text/markdown") {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
