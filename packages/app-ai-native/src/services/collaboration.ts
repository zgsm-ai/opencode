import { env } from "@/lib/env"

const PREFIX = env.API_PREFIX

export function getSpaceSlug(): string {
  return localStorage.getItem("currentSpaceSlug") || ""
}

export function setSpaceSlug(slug: string) {
  localStorage.setItem("currentSpaceSlug", slug)
}

export async function ensureSpaceSlug(): Promise<string | null> {
  const slug = getSpaceSlug()
  if (slug) return slug
  const spaces = await listSpaces()
  if (spaces.length > 0) {
    setSpaceSlug(spaces[0].slug)
    return spaces[0].slug
  }
  return null
}

function headers() {
  return {
    "Content-Type": "application/json",
    "X-Space-Slug": getSpaceSlug(),
  }
}

// Spaces

export interface Space {
  id: string
  name: string
  slug: string
  description?: string
  settings?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export async function listSpaces(): Promise<Space[]> {
  const res = await fetch(`${PREFIX}/api/spaces`, { credentials: "include" })
  if (!res.ok) throw new Error("Failed to list spaces")
  const data = await res.json()
  return data.spaces ?? []
}

export async function getSpace(slug: string): Promise<Space> {
  const res = await fetch(`${PREFIX}/api/spaces/${slug}`, { credentials: "include" })
  if (!res.ok) throw new Error("Failed to get space")
  const data = await res.json()
  return data.space
}

export async function createSpace(body: { name: string; slug?: string; description?: string }): Promise<Space> {
  const res = await fetch(`${PREFIX}/api/spaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error("Failed to create space")
  const data = await res.json()
  return data.space
}

// Issues

export interface Issue {
  id: string
  spaceId: string
  number: number
  title: string
  description?: string
  status: string
  priority: string
  assigneeType?: string
  assigneeId?: string
  creatorId: string
  parentIssueId?: string
  position: number
  dueDate?: string
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export async function listIssues(filters?: { status?: string; priority?: string; assigneeId?: string }): Promise<Issue[]> {
  const slug = await ensureSpaceSlug()
  if (!slug) return []
  const params = new URLSearchParams()
  if (filters?.status) params.set("status", filters.status)
  if (filters?.priority) params.set("priority", filters.priority)
  if (filters?.assigneeId) params.set("assigneeId", filters.assigneeId)
  const res = await fetch(`${PREFIX}/api/issues?${params.toString()}`, {
    credentials: "include",
    headers: { "X-Space-Slug": slug },
  })
  if (!res.ok) throw new Error("Failed to list issues")
  const data = await res.json()
  return data.issues ?? []
}

export async function createIssue(body: Partial<Issue>): Promise<Issue> {
  const res = await fetch(`${PREFIX}/api/issues`, {
    method: "POST",
    headers: headers(),
    credentials: "include",
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error("Failed to create issue")
  const data = await res.json()
  return data.issue
}

// Squads

export interface Squad {
  id: string
  spaceId: string
  name: string
  description?: string
  leaderId?: string
  instructions?: string
  avatarUrl?: string
  archivedAt?: string
  createdAt: string
  updatedAt: string
}

export async function listSquads(includeArchived?: boolean): Promise<Squad[]> {
  const slug = await ensureSpaceSlug()
  if (!slug) return []
  const params = new URLSearchParams()
  if (includeArchived) params.set("includeArchived", "true")
  const res = await fetch(`${PREFIX}/api/squads?${params.toString()}`, {
    credentials: "include",
    headers: { "X-Space-Slug": slug },
  })
  if (!res.ok) throw new Error("Failed to list squads")
  const data = await res.json()
  return data.squads ?? []
}

export async function createSquad(body: Partial<Squad>): Promise<Squad> {
  const res = await fetch(`${PREFIX}/api/squads`, {
    method: "POST",
    headers: headers(),
    credentials: "include",
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error("Failed to create squad")
  const data = await res.json()
  return data.squad
}
