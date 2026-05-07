import { apiFetch } from "@/pages/store/lib/api"

export interface KanbanOverviewResponse {
  totalProjects: number
  totalUsers: number
  totalDevices: number
  totalRequests: number
  onlineDevices: number
  activeUsers7d: number
  inputTokens7d: number
  outputTokens7d: number
  cost7d: number
}

export const kanbanApi = {
  async overview() {
    return apiFetch<KanbanOverviewResponse>("/api/kanban/overview")
  },
}
