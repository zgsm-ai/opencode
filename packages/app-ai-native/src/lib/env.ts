/**
 * Runtime environment variables utility
 *
 * This module provides a unified way to access environment variables that can be
 * injected at runtime (via Docker) or fallback to build-time values (import.meta.env).
 *
 * In production Docker deployments, the docker-entrypoint.sh script replaces
 * placeholders in index.html with actual environment variable values.
 */

// Declare the runtime env type
declare global {
  interface Window {
    __ENV__?: Record<string, string | undefined>
  }
}

// Pattern to detect unreplaced placeholders (e.g., "${VITE_API_PREFIX}")
const PLACEHOLDER_PATTERN = /^\$\{.+\}$/

/**
 * Check if a value is a valid environment variable value (not an unreplaced placeholder)
 */
function isValidValue(value: string | undefined): boolean {
  if (value === undefined || value === "") return false
  // Reject unreplaced placeholders like "${VITE_API_PREFIX}"
  if (PLACEHOLDER_PATTERN.test(value)) return false
  return true
}

/**
 * Get an environment variable value.
 * Priority: runtime (window.__ENV__) > build-time (import.meta.env)
 */
export function getEnv(key: string, defaultValue?: string): string | undefined {
  // Check runtime environment first (for Docker deployments)
  if (typeof window !== "undefined" && window.__ENV__) {
    const runtimeValue = window.__ENV__[key]
    if (isValidValue(runtimeValue)) {
      return runtimeValue
    }
  }

  // Fallback to build-time environment variables
  const buildTimeValue = (import.meta.env as Record<string, string | undefined>)[key]
  if (isValidValue(buildTimeValue)) {
    return buildTimeValue
  }

  return defaultValue
}

/**
 * Environment variables with defaults
 */
export const env = {
  // Server configuration
  get CLOUD_SERVER_HOST() {
    return getEnv("VITE_CLOUD_SERVER_HOST", "127.0.0.1")
  },
  get CLOUD_SERVER_PORT() {
    return getEnv("VITE_CLOUD_SERVER_PORT", "18080")
  },
  get APP_PORT() {
    return getEnv("VITE_APP_PORT", "3000")
  },
  get API_PREFIX() {
    return getEnv("VITE_API_PREFIX", "")
  },
  get DASHBOARD_PREFIX() {
    return getEnv("VITE_DASHBOARD_PREFIX", "")
  },
  get APP_URL() {
    return getEnv("VITE_APP_URL", "http://127.0.0.1:3000")
  },
  get API_URL() {
    return getEnv("VITE_API_URL", "")
  },
  get QUOTA_PREFIX() {
    return getEnv("VITE_QUOTA_PREFIX", "")
  },
  get QUOTA_URL() {
    return getEnv("VITE_QUOTA_URL", "")
  },

  // Base path for subdirectory deployment (e.g., "/costrict-web-portal")
  get BASE_PATH() {
    return getEnv("VITE_BASE_PATH", "")
  },

  // Store
  get STORE_URL() {
    return getEnv("VITE_STORE_URL", "")
  },

  // Mobile host for mobile workspace URL (e.g., "https://mobile.example.com:3000")
  // Falls back to current page origin when not configured
  get MOBILE_HOST() {
    const configured = getEnv("VITE_MOBILE_HOST", "")
    if (configured) return configured
    if (typeof window !== "undefined") return window.location.origin
    return ""
  },

  // OpenCode cloud device
  get OPENCODE_CLOUD_DEVICE_ID() {
    return getEnv("VITE_OPENCODE_CLOUD_DEVICE_ID", "")
  },
  get OPENCODE_SERVER_HOST() {
    return getEnv("VITE_OPENCODE_SERVER_HOST", "127.0.0.1")
  },
  get OPENCODE_SERVER_PORT() {
    return getEnv("VITE_OPENCODE_SERVER_PORT", "8080")
  },

  // Security frontend URL for cross-app navigation (same domain, e.g. "/llm_sast")
  get SECURITY_FRONTEND_URL() {
    return getEnv("VITE_SECURITY_FRONTEND_URL", "/llm_sast")
  },

  // Demo mode: use mock data instead of real API calls
  get DEMO_MODE() {
    return getEnv("VITE_DEMO_MODE", "false") === "true"
  },
}
