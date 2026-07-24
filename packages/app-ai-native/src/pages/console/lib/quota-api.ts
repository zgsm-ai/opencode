import { env } from "@/lib/env"
import { onUnauthorized } from "@/lib/session-expired"
import { getAuthHeaders } from "@/lib/auth-token"

const QUOTA_PREFIX = env.QUOTA_PREFIX
const QUOTA_BASE = env.QUOTA_URL || QUOTA_PREFIX

export async function quotaApiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const headers =
    options?.body instanceof FormData ? options?.headers : { "Content-Type": "application/json", ...options?.headers }
  const res = await fetch(`${QUOTA_BASE}${path}`, {
    ...options,
    headers,
  })
  if (!res.ok) {
    if (res.status === 401) onUnauthorized(path)
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || err.message || `Request failed: ${res.status}`)
  }
  return res.json()
}

export interface QuotaList {
  amount: number
  expiry_date: string
  source?: string
}

export interface UsageConsumptionRecord {
  id: number
  user_id: string
  model: string
  mode: string
  tokens: number
  credits_used: number
  package: string
  record_time: string
  create_time: string
  update_time: string
}

export interface GetUsageStatisticsReq {
  page: number
  page_size: number
  start_time?: string
  end_time?: string
  time_range?: string
}

export interface GetUsageStatisticsRes {
  records: Array<UsageConsumptionRecord>
  total: number
  page: number
  page_size: number
}

export interface GetUserQuotaRes {
  total_quota: number
  used_quota: number
  quota_list: Array<QuotaList>
  is_star?: string
}

export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
}

export async function getUserQuota(): Promise<GetUserQuotaRes> {
  const res = await quotaApiFetch<ApiResponse<GetUserQuotaRes>>("/quota-manager/api/v1/quota", {
    credentials: "include",
    headers: getAuthHeaders(),
  })
  return res.data
}

export async function getUsageStatistics(params: GetUsageStatisticsReq): Promise<GetUsageStatisticsRes> {
  const query = new URLSearchParams()
  query.set("page", String(params.page))
  query.set("page_size", String(params.page_size))
  if (params.start_time) query.set("start_time", params.start_time)
  if (params.end_time) query.set("end_time", params.end_time)
  if (params.time_range) query.set("time_range", params.time_range)

  const res = await quotaApiFetch<ApiResponse<GetUsageStatisticsRes>>(
    `/quota-manager/api/v1/usage/statistics?${query.toString()}`,
    { credentials: "include", headers: getAuthHeaders() }
  )
  return res.data
}
