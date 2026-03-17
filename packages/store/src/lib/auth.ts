export interface CasdoorUser {
  sub: string
  name?: string
  preferred_username?: string
  email?: string
  picture?: string
  owner?: string
}

export function getLoginUrl(redirectTo?: string) {
  const endpoint = import.meta.env.VITE_CASDOOR_ENDPOINT || 'http://10.48.18.5:18000'
  const clientId = import.meta.env.VITE_CASDOOR_CLIENT_ID || '4e148382d962fcc5acdb'
  const apiUrl = 'http://10.48.18.5:18080'

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `http://localhost:3000/store`,
    scope: "openid profile email",
    response_type: "code",
    state: JSON.stringify({ redirectTo: redirectTo || "/" }),
  })

  return `${endpoint}/login/oauth/authorize?${params.toString()}`
}
