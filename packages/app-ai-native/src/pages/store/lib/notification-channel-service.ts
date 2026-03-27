import type { WecomChannel } from "@/context/settings"
import { notificationChannelApi, type WecomChannelPayload } from "./api"

function toTriggerEvents(events: WecomChannel["events"]) {
  return [
    events.agent ? "agent" : null,
    events.permissions ? "permissions" : null,
    events.errors ? "errors" : null,
  ].filter(Boolean) as Array<"agent" | "permissions" | "errors">
}

function toPayload(channel: Omit<WecomChannel, "id">): WecomChannelPayload {
  return {
    channelType: "wecom",
    name: channel.name,
    triggerEvents: toTriggerEvents(channel.events),
    userConfig: {
      webhookUrl: channel.webhook,
    },
    ...(channel.systemChannelId ? { systemChannelId: channel.systemChannelId } : {}),
  }
}

export const notificationChannelService = {
  async listWecom() {
    const res = await notificationChannelApi.listWecom()
    return res.channels
  },

  async createWecom(data: Omit<WecomChannel, "id">) {
    const res = await notificationChannelApi.createWecom(toPayload(data))
    return res.channel
  },

  async updateWecom(channelId: string, patch: Partial<WecomChannel>) {
    const res = await notificationChannelApi.updateWecom(channelId, {
      name: patch.name,
      triggerEvents: patch.events ? toTriggerEvents(patch.events) : undefined,
      userConfig:
        patch.webhook !== undefined
          ? {
              webhookUrl: patch.webhook ?? "",
            }
          : undefined,
    })
    return res.channel
  },

  async removeWecom(channelId: string) {
    await notificationChannelApi.removeWecom(channelId)
  },

  async testWecom(channelId: string) {
    return notificationChannelApi.testWecom(channelId)
  },
}
