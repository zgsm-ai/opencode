export async function GET() {
  const response = await fetch(
    "https://raw.githubusercontent.com/zgsm-ai/costrict-cli/refs/heads/dev/packages/sdk/openapi.json",
  )
  const json = await response.json()
  return json
}
