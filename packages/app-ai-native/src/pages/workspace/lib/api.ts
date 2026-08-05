// Workspace API Client - 对接 server 层接口
import { env } from "@/lib/env"
import { onUnauthorized } from "@/lib/session-expired"

const PREFIX = env.API_PREFIX
const API_BASE = env.API_URL || PREFIX

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    if (res.status === 401) onUnauthorized(path)
    const err = await res.json().catch(() => ({ error: res.statusText }))
    // Attach the HTTP status so callers can branch on it (e.g. 409 conflict)
    // without parsing the message text.
    throw Object.assign(new Error(err.error || `Request failed: ${res.status}`), { status: res.status })
  }

  if (res.status === 204 || res.status === 205) {
    return null as T
  }
  
  return res.json()
}

import type {
  Device,
  Workspace,
  WorkspaceDirectory,
  CreateWorkspaceRequest,
  CreateDirectoryRequest,
  UpdateWorkspaceRequest,
  UpdateDirectoryRequest,
  ReorderDirectoriesRequest,
  ListWorkspacesResponse,
  GetWorkspaceResponse,
  CreateWorkspaceResponse,
  UpdateWorkspaceResponse,
  ListDevicesResponse,
  GetDeviceResponse,
  RegisterDeviceRequest,
  RegisterDeviceResponse,
  UpdateDeviceRequest,
  ListWorkspaceDevicesResponse,
} from "../types"
import { setDeviceClusterAPIURL } from "./url"

type DeviceResponse = Partial<Device> & {
  id: string
  deviceId: string
  displayName?: string
  platform?: string
  version?: string
  userId?: string
  workspaceId?: string
  status?: Device["status"] | null
  label?: string | null
  description?: string | null
  tokenRotatedAt?: string | null
  lastConnectedAt?: string | null
  lastSeenAt?: string | null
  canUpdate?: boolean | null
  latestVersion?: string | null
  clusterAPIURL?: string | null
  createdAt?: string
  updatedAt?: string
}

function normalizeDevice(device: DeviceResponse): Device {
  setDeviceClusterAPIURL(device.deviceId, device.clusterAPIURL)
  return {
    id: device.id,
    deviceId: device.deviceId,
    displayName: device.displayName ?? device.label ?? device.deviceId,
    platform: device.platform ?? "",
    version: device.version ?? "",
    userId: device.userId ?? "",
    workspaceId: device.workspaceId ?? undefined,
    status: device.status ?? "",
    label: device.label ?? undefined,
    description: device.description ?? undefined,
    tokenRotatedAt: device.tokenRotatedAt ?? undefined,
    lastConnectedAt: device.lastConnectedAt ?? undefined,
    lastSeenAt: device.lastSeenAt ?? undefined,
    canUpdate: device.canUpdate ?? undefined,
    latestVersion: device.latestVersion ?? undefined,
    clusterAPIURL: device.clusterAPIURL ?? undefined,
    createdAt: device.createdAt ?? "",
    updatedAt: device.updatedAt ?? "",
  }
}

// 工作空间 API
export const workspaceApi = {
  // 列出用户所有工作空间
  list: () => apiFetch<ListWorkspacesResponse>("/api/workspaces"),

  // 获取工作空间详情
  get: (workspaceId: string) =>
    apiFetch<GetWorkspaceResponse>(`/api/workspaces/${workspaceId}`),

  // 获取默认工作空间
  getDefault: () => apiFetch<GetWorkspaceResponse>("/api/workspaces/default"),

  // 创建工作空间
  create: (data: CreateWorkspaceRequest) =>
    apiFetch<CreateWorkspaceResponse>("/api/workspaces", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // 更新工作空间
  update: (workspaceId: string, data: UpdateWorkspaceRequest) =>
    apiFetch<UpdateWorkspaceResponse>(`/api/workspaces/${workspaceId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  // 删除工作空间
  delete: (workspaceId: string) =>
    apiFetch<void>(`/api/workspaces/${workspaceId}`, { method: "DELETE" }),

  // 设置默认工作空间
  setDefault: (workspaceId: string) =>
    apiFetch<{ message: string }>(`/api/workspaces/${workspaceId}/set-default`, {
      method: "POST",
    }),

  // 添加目录
  addDirectory: (workspaceId: string, data: CreateDirectoryRequest) =>
    apiFetch<{ directory: WorkspaceDirectory }>(`/api/workspaces/${workspaceId}/directories`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // 更新目录
  updateDirectory: (workspaceId: string, directoryId: string, data: UpdateDirectoryRequest) =>
    apiFetch<{ directory: WorkspaceDirectory }>(
      `/api/workspaces/${workspaceId}/directories/${directoryId}`,
      {
        method: "PUT",
        body: JSON.stringify(data),
      }
    ),

  // 删除目录
  deleteDirectory: (workspaceId: string, directoryId: string) =>
    apiFetch<void>(`/api/workspaces/${workspaceId}/directories/${directoryId}`, {
      method: "DELETE",
    }),

  // 重新排序目录
  reorderDirectories: (workspaceId: string, data: ReorderDirectoriesRequest) =>
    apiFetch<{ message: string }>(`/api/workspaces/${workspaceId}/directories/reorder`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
}

// 设备 API
export const deviceApi = {
  // 列出用户所有设备
  async list() {
    const res = await apiFetch<{ devices?: DeviceResponse[] }>("/api/devices")
    return { devices: (res.devices ?? []).map(normalizeDevice) satisfies ListDevicesResponse["devices"] }
  },

  // 获取设备详情
  async get(deviceId: string) {
    const res = await apiFetch<{ device: DeviceResponse }>(`/api/devices/${deviceId}`)
    return { device: normalizeDevice(res.device) satisfies GetDeviceResponse["device"] }
  },

  // 注册设备
  register: (data: RegisterDeviceRequest) =>
    apiFetch<RegisterDeviceResponse>("/api/devices", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // 更新设备
  async update(deviceId: string, data: UpdateDeviceRequest) {
    const res = await apiFetch<{ device: DeviceResponse }>(`/api/devices/${deviceId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    })
    return { device: normalizeDevice(res.device) satisfies GetDeviceResponse["device"] }
  },

  // 删除设备
  delete: (deviceId: string) =>
    apiFetch<void>(`/api/devices/${deviceId}`, { method: "DELETE" }),

  // 轮换设备令牌
  rotateToken: (deviceId: string) =>
    apiFetch<{ token: string; rotatedAt: string }>(`/api/devices/${deviceId}/rotate-token`, {
      method: "POST",
    }),

  // 获取工作空间下的设备列表（分页）
  async listByWorkspace(workspaceId: string, page = 1, pageSize = 20) {
    const res = await apiFetch<ListWorkspaceDevicesResponse & { devices?: DeviceResponse[] }>(
      `/api/workspaces/${workspaceId}/devices?page=${page}&pageSize=${pageSize}`
    )
    return {
      ...res,
      devices: (res.devices ?? []).map(normalizeDevice),
    }
  },
}
