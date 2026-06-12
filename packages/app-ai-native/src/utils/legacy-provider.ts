import type { ProviderListResponse } from "@opencode-ai/sdk/v2/client"
import type { ProviderCapabilitiesResponse } from "@/context/global-sync/types"

export function legacyProvider(input: ProviderCapabilitiesResponse): ProviderListResponse {
  return {
    all: input.connected.map((provider) => ({
      id: provider.id,
      name: provider.name,
      source: provider.source,
      env: [],
      options: {},
      models: Object.fromEntries(
        Object.entries(provider.models).map(([key, model]) => [
          key,
          {
            id: model.id,
            providerID: provider.id,
            api: { id: "", url: "", npm: "" },
            name: model.name,
            ...(model.family ? { family: model.family } : {}),
            capabilities: {
              temperature: model.capabilities.temperature,
              reasoning: model.capabilities.reasoning,
              attachment: model.capabilities.attachment,
              toolcall: model.capabilities.toolcall,
              input: model.capabilities.input,
              output: model.capabilities.output,
              interleaved: model.capabilities.interleaved,
            },
            cost: model.cost
              ? {
                  input: model.cost.input,
                  output: model.cost.output,
                  cache: {
                    read: model.cost.cache.read,
                    write: model.cost.cache.write,
                  },
                  experimentalOver200K: model.cost.experimentalOver200K
                    ? {
                        input: model.cost.experimentalOver200K.input,
                        output: model.cost.experimentalOver200K.output,
                        cache: {
                          read: model.cost.experimentalOver200K.cache.read,
                          write: model.cost.experimentalOver200K.cache.write,
                        },
                      }
                    : undefined,
                }
              : { input: 0, output: 0, cache: { read: 0, write: 0 } },
            limit: model.limit,
            status: model.status,
            options: {},
            headers: {},
            release_date: model.release_date,
            variants: model.variants,
          },
        ]),
      ),
    })),
    default: Object.fromEntries(
      input.connected.flatMap((provider) => (provider.default_model ? [[provider.id, provider.default_model]] : [])),
    ),
    connected: input.connected.map((provider) => provider.id),
  }
}
