import { Log } from "@/util/log"
import { LearningStorage } from "./storage"
import { SkillCandidate, CandidatePushStatus } from "./types"
import { Bus } from "@/bus"
import { LearningEvent } from "./events"
import { loadCoStrictCredentials } from "@/costrict/provider/credentials"
import { isCoStrictTokenValid, refreshCoStrictToken, extractExpiryFromJWT, parseJWT } from "@/costrict/provider/token"
import { saveCoStrictCredentials } from "@/costrict/provider/credentials"
import { Installation } from "@/installation"
import { v7 as uuidv7 } from "uuid"
import { getCloudBaseUrl } from "@/costrict/device/client"

const log = Log.create({ service: "learning.pusher" })
const MAX_LOGGED_RESPONSE_BODY = 2000

function truncateForLog(value: string, maxLength = MAX_LOGGED_RESPONSE_BODY): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength)}...<truncated>`
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

function buildItemDetailUrl(baseUrl: string, itemId: string, itemType: string): string {
  const origin = baseUrl.replace(/\/cloud-api$/, "")
  return `${origin}/store`
}

/**
 * Server API response types
 */
interface PushSkillRequest {
  itemType: "skill"
  name: string
  slug: string
  description: string
  category: string
  version: string
  content: string
  visibility: "private" | "team" | "public"
  registryId?: string
  createdBy: string
}

interface PushSkillResponse {
  id: string
  name: string
  slug: string
  status: string
  url?: string
  createdAt: string
}

/**
 * Skill pusher module
 * Handles pushing skill candidates to the CoStrict server
 */
export namespace SkillPusher {
  async function repairPushedCandidate(
    candidate: SkillCandidate,
    scope: "project" | "global" = "project",
  ): Promise<{ remoteId: string; remoteUrl: string }> {
    const baseUrl = await getServerUrl()
    const remoteUrl =
      candidate.remoteUrl ||
      buildItemDetailUrl(baseUrl || "https://zgsm.sangfor.com/cloud-api", candidate.remoteId!, "skill")

    if (candidate.remoteUrl !== remoteUrl) {
      await LearningStorage.updateCandidatePushStatus(
        candidate.id,
        "pushed",
        {
          pushedAt: candidate.pushedAt,
          remoteId: candidate.remoteId,
          remoteUrl,
        },
        scope,
      )
      log.info("Repaired pushed candidate metadata", {
        candidateId: candidate.id,
        remoteId: candidate.remoteId,
        remoteUrl,
      })
    }

    return {
      remoteId: candidate.remoteId!,
      remoteUrl,
    }
  }

  /**
   * Check if server is configured and credentials exist
   */
  export async function isServerConfigured(): Promise<boolean> {
    const credentials = await loadCoStrictCredentials()
    return credentials !== null && !!credentials.access_token
  }

  /**
   * Get the server URL for skill push
   */
  export async function getServerUrl(): Promise<string | null> {
    const credentials = await loadCoStrictCredentials()
    if (!credentials) return null
    return getCloudBaseUrl(credentials.base_url)
  }

  /**
   * Create authenticated fetch with token refresh support
   */
  async function createAuthenticatedFetch(): Promise<{
    fetch: (url: string, init?: RequestInit) => Promise<Response>
    baseUrl: string
    createdBy: string
  }> {
    let creds = await loadCoStrictCredentials()

    if (!creds) {
      throw new Error("Not authenticated. Please run 'cs auth login' first.")
    }

    // Token validation and refresh
    if (creds.refresh_token && !isCoStrictTokenValid(creds)) {
      log.debug("Token expired, refreshing...")

      try {
        const refreshed = await refreshCoStrictToken({
          baseUrl: creds.base_url,
          refreshToken: creds.refresh_token,
          state: creds.state,
        })

        await saveCoStrictCredentials({
          ...creds,
          access_token: refreshed.access_token,
          refresh_token: refreshed.refresh_token,
          expiry_date: extractExpiryFromJWT(refreshed.access_token),
          updated_at: new Date().toISOString(),
          expired_at: new Date(extractExpiryFromJWT(refreshed.access_token)).toISOString(),
        })

        creds.access_token = refreshed.access_token
      } catch (err) {
        log.error("Token refresh failed", { err })
        throw new Error("Authentication expired. Please run 'cs auth login' again.")
      }
    }

    const baseUrl = getCloudBaseUrl(creds.base_url)
    const tokenPayload = parseJWT(creds.access_token)
    const createdBy = tokenPayload.id || tokenPayload.sub || tokenPayload.name || "cli-user"

    const authFetch = async (url: string, init?: RequestInit): Promise<Response> => {
      const headers = new Headers(init?.headers)
      headers.set("Authorization", `Bearer ${creds!.access_token}`)
      headers.set("Content-Type", "application/json")
      headers.set("HTTP-Referer", "https://github.com/zgsm-ai/costrict-cli")
      headers.set("X-Title", "CoStrict-CLI")
      headers.set("X-Costrict-Version", `costrict-cli-${Installation.VERSION}`)
      headers.set("X-Request-ID", uuidv7())
      headers.set("zgsm-client-id", Installation.getInstallationId())
      headers.set("zgsm-client-ide", "cli")

      const method = init?.method ?? "GET"
      log.info("Sending learning API request", { method, url })

      const response = await fetch(url, { ...init, headers })

      log.info("Received learning API response", {
        method,
        url,
        status: response.status,
        ok: response.ok,
      })

      return response
    }

    return { fetch: authFetch, baseUrl, createdBy }
  }

  /**
   * Push a skill candidate to the server
   */
  export async function pushToServer(
    candidateId: string,
    options: {
      visibility?: "private" | "team" | "public"
      registryId?: string
      force?: boolean
    } = {},
  ): Promise<{
    success: boolean
    remoteId?: string
    remoteUrl?: string
    error?: string
  }> {
    try {
      // Load candidate
      const candidate = await LearningStorage.getCandidate(candidateId)
      if (!candidate) {
        return { success: false, error: `Candidate not found: ${candidateId}` }
      }

      // Check if already pushed
      if (!options.force && candidate.pushStatus === "pushed" && candidate.remoteId) {
        const repaired = await repairPushedCandidate(candidate)
        return {
          success: true,
          remoteId: repaired.remoteId,
          remoteUrl: repaired.remoteUrl,
        }
      }

      // Get authenticated fetch
      const { fetch: authFetch, baseUrl, createdBy } = await createAuthenticatedFetch()

      // Build request body
      const requestBody: PushSkillRequest = {
        itemType: "skill",
        name: candidate.name,
        slug: slugify(candidate.name),
        description: candidate.description,
        category: "utilities",
        version: Installation.VERSION,
        content: candidate.content,
        visibility: options.visibility || "private",
        registryId: options.registryId,
        createdBy,
      }

      // Push to server
      const requestUrl = `${baseUrl}/api/items`
      const response = await authFetch(requestUrl, {
        method: "POST",
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage = `Server returned ${response.status}`

        try {
          const errorJson = JSON.parse(errorText)
          errorMessage = errorJson.message || errorJson.error || errorMessage
        } catch {
          // Use default error message
        }

        // Update candidate status to push_failed
        await LearningStorage.updateCandidatePushStatus(candidateId, "push_failed")

        log.error("Failed to push skill", {
          candidateId,
          url: requestUrl,
          status: response.status,
          error: errorMessage,
          responseBody: truncateForLog(errorText),
        })
        return { success: false, error: errorMessage }
      }

      const result = (await response.json()) as PushSkillResponse
      const remoteUrl = result.url || buildItemDetailUrl(baseUrl, result.id, requestBody.itemType)

      // Update candidate with push info
      await LearningStorage.updateCandidatePushStatus(candidateId, "pushed", {
        pushedAt: new Date().toISOString(),
        remoteId: result.id,
        remoteUrl,
      })

      // Emit event
      Bus.publish(LearningEvent.CandidatePushed, {
        candidateId,
        remoteId: result.id,
        remoteUrl,
      })

      log.info("Skill pushed successfully", {
        candidateId,
        remoteId: result.id,
        remoteUrl,
      })

      return {
        success: true,
        remoteId: result.id,
        remoteUrl,
      }
    } catch (err: any) {
      log.error("Failed to push skill", { candidateId, err })

      // Try to update status to push_failed
      try {
        await LearningStorage.updateCandidatePushStatus(candidateId, "push_failed")
      } catch {
        // Ignore storage errors
      }

      return {
        success: false,
        error: err.message || "Unknown error",
      }
    }
  }

  /**
   * Update an existing skill on the server
   */
  export async function updateOnServer(
    candidateId: string,
    options: {
      visibility?: "private" | "team" | "public"
    } = {},
  ): Promise<{
    success: boolean
    error?: string
  }> {
    try {
      const candidate = await LearningStorage.getCandidate(candidateId)
      if (!candidate) {
        return { success: false, error: `Candidate not found: ${candidateId}` }
      }

      if (!candidate.remoteId) {
        return { success: false, error: "Skill has not been pushed to server yet" }
      }

      const { fetch: authFetch, baseUrl } = await createAuthenticatedFetch()

      const requestBody = {
        name: candidate.name,
        description: candidate.description,
        content: candidate.content,
        visibility: options.visibility || "private",
      }

      const requestUrl = `${baseUrl}/api/items/${candidate.remoteId}`
      const response = await authFetch(requestUrl, {
        method: "PUT",
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage = `Server returned ${response.status}`

        try {
          const errorJson = JSON.parse(errorText)
          errorMessage = errorJson.message || errorJson.error || errorMessage
        } catch {
          // Use default error message
        }

        log.error("Failed to update skill", {
          candidateId,
          remoteId: candidate.remoteId,
          url: requestUrl,
          status: response.status,
          error: errorMessage,
          responseBody: truncateForLog(errorText),
        })

        return { success: false, error: errorMessage }
      }

      log.info("Skill updated successfully", { candidateId, remoteId: candidate.remoteId })

      return { success: true }
    } catch (err: any) {
      log.error("Failed to update skill", { candidateId, err })
      return { success: false, error: err.message || "Unknown error" }
    }
  }

  export async function syncToServer(
    candidateId: string,
    options: {
      visibility?: "private" | "team" | "public"
      registryId?: string
      force?: boolean
    } = {},
  ): Promise<{
    success: boolean
    remoteId?: string
    remoteUrl?: string
    error?: string
    action?: "repaired" | "pushed" | "updated"
  }> {
    const candidate = await LearningStorage.getCandidate(candidateId)
    if (!candidate) {
      return { success: false, error: `Candidate not found: ${candidateId}` }
    }

    if (candidate.pushStatus === "pushed" && candidate.remoteId) {
      if (!options.force) {
        const repaired = await repairPushedCandidate(candidate)
        return {
          success: true,
          remoteId: repaired.remoteId,
          remoteUrl: repaired.remoteUrl,
          action: "repaired",
        }
      }

      const updated = await updateOnServer(candidateId, { visibility: options.visibility })
      if (!updated.success) {
        return { success: false, error: updated.error }
      }

      const repaired = await repairPushedCandidate(candidate)
      return {
        success: true,
        remoteId: repaired.remoteId,
        remoteUrl: repaired.remoteUrl,
        action: "updated",
      }
    }

    const pushed = await pushToServer(candidateId, options)
    return {
      ...pushed,
      action: pushed.success ? "pushed" : undefined,
    }
  }

  /**
   * Get push history for a candidate
   */
  export async function getPushHistory(candidateId: string): Promise<{
    success: boolean
    history?: Array<{
      pushedAt: string
      remoteId: string
      remoteUrl: string
    }>
    error?: string
  }> {
    try {
      const candidate = await LearningStorage.getCandidate(candidateId)
      if (!candidate) {
        return { success: false, error: `Candidate not found: ${candidateId}` }
      }

      if (candidate.pushStatus !== "pushed" || !candidate.remoteId) {
        return { success: true, history: [] }
      }

      return {
        success: true,
        history: [
          {
            pushedAt: candidate.pushedAt || "",
            remoteId: candidate.remoteId,
            remoteUrl: candidate.remoteUrl || "",
          },
        ],
      }
    } catch (err: any) {
      log.error("Failed to get push history", { candidateId, err })
      return { success: false, error: err.message || "Unknown error" }
    }
  }
}
