export function normalizePaste(text: string) {
  return text.replace(/\r\n/g, "\n")
}

export function pasteMode(text: string) {
  return text.includes("\n") ? "manual" : "inline"
}
