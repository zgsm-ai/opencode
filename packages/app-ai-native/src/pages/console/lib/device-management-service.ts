import type { UpdateDeviceRequest } from "@/pages/workspace/types"
import { deviceApi } from "@/pages/store/lib/api"

export const deviceManagementService = {
  async list() {
    const res = await deviceApi.list()
    return res.devices ?? []
  },

  async update(deviceId: string, data: UpdateDeviceRequest) {
    const res = await deviceApi.update(deviceId, data)
    return res.device
  },
}
