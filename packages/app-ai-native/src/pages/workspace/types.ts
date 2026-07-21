// 设备状态 - 与后端 Device.status 保持一致：online | offline | ""
export type DeviceStatus = "online" | "offline" | ""

// 设备模型 - 匹配 server 接口
export interface Device {
  id: string
  deviceId: string
  displayName: string
  platform: string
  version: string
  userId: string
  workspaceId?: string
  status: DeviceStatus
  label?: string
  description?: string
  tokenRotatedAt?: string
  lastConnectedAt?: string
  lastSeenAt?: string
  canUpdate?: boolean
  latestVersion?: string
  clusterAPIURL?: string | null
  createdAt: string
  updatedAt: string
}

// 工作空间目录
export interface WorkspaceDirectory {
  id: string
  workspaceId: string
  name: string
  path: string
  isDefault: boolean
  orderIndex: number
  settings?: Record<string, any>
  createdAt: string
  updatedAt: string
}

// 工作空间模型 - 匹配 server 接口
export interface Workspace {
  id: string
  name: string
  description?: string
  userId: string
  deviceId?: string
  deviceUniqueId?: string  // Device.deviceId，用于代理路由
  isDefault: boolean
  status: "active" | "inactive" | "archived"
  deviceStatus?: DeviceStatus  // 关联设备的状态：online | offline | ""（未绑定）
  settings?: Record<string, any>
  directories?: WorkspaceDirectory[]
  createdAt: string
  updatedAt: string
}

// API 请求类型
export interface CreateWorkspaceRequest {
  name: string
  description?: string
  deviceId?: string
  directories: CreateDirectoryRequest[]
  settings?: Record<string, any>
}

export interface CreateDirectoryRequest {
  name: string
  path: string
  isDefault?: boolean
  settings?: Record<string, any>
}

export interface UpdateWorkspaceRequest {
  name?: string
  description?: string
  deviceId?: string
  settings?: Record<string, any>
  status?: "active" | "inactive" | "archived"
}

export interface UpdateDirectoryRequest {
  name?: string
  path?: string
  isDefault?: boolean
  settings?: Record<string, any>
}

export interface ReorderDirectoriesRequest {
  directoryIds: string[]
}

// API 响应类型
export interface ListWorkspacesResponse {
  workspaces: Workspace[]
}

export interface GetWorkspaceResponse {
  workspace: Workspace
}

export interface CreateWorkspaceResponse {
  workspace: Workspace
}

export interface UpdateWorkspaceResponse {
  workspace: Workspace
}

export interface ListDevicesResponse {
  devices: Device[]
}

export interface GetDeviceResponse {
  device: Device
}

export interface RegisterDeviceRequest {
  deviceId: string
  displayName: string
  platform: string
  version: string
  workspaceId?: string
}

export interface RegisterDeviceResponse {
  device: Device
  token: string
}

export interface UpdateDeviceRequest {
  description?: string
  displayName?: string
  label?: string
  workspaceId?: string
}

export interface ListWorkspaceDevicesResponse {
  devices: Device[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

export interface UpdateCheckResponse {
  can_update: boolean
  version: string
  changelog: string
  download_url: string
  sha256: string
  force: boolean
  min_client_version: string
  release_date: string
  size: number
}

export interface DeviceCommandRequest {
  command_id: string
  type: "upgrade" | "restart" | "reconnect"
  payload?: Record<string, unknown>
  timestamp: string
}

export interface DeviceCommandAck {
  command_id: string
  status: "accepted" | "rejected" | "executing"
  message: string
}

export interface CommandStatusResponse {
  command_id: string
  type: string
  status: "accepted" | "executing" | "completed" | "failed"
  phase?: "checking" | "downloading" | "verifying" | "replacing" | "restarting"
  progress?: number
  message?: string
  started_at?: string
  completed_at?: string
  result?: any
  error?: string
}
