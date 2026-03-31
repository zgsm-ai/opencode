export function normalizeAppProxyPath(input: string) {
  let path = input

  // Browser deep links use `/:dir/session/:id`. Static assets under the same
  // prefix should keep their asset path, while route refreshes should load the
  // SPA entry point instead.
  const sessionMatch = path.match(/^[A-Za-z0-9_=\/+-]+\/session\/(.*)/)
  if (!sessionMatch) return path

  const subPath = sessionMatch[1]
  if (subPath && subPath.includes(".")) {
    return "/" + subPath
  }

  return "/"
}
