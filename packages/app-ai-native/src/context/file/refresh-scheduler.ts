type RefreshSchedulerOptions = {
  interval?: number
  retryInterval?: number
  maxRetries?: number
  fetch: () => Promise<void>
}

export function createRefreshScheduler(opts: RefreshSchedulerOptions) {
  const INTERVAL = opts.interval ?? 60_000
  const RETRY_INTERVAL = opts.retryInterval ?? 5_000
  const MAX_RETRIES = opts.maxRetries ?? 3

  let timer: ReturnType<typeof setTimeout> | undefined
  let lastRefreshAt = 0
  let retryCount = 0
  let active = false

  const clear = () => {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
  }

  const scheduleNext = () => {
    if (!active) return
    const elapsed = Date.now() - lastRefreshAt
    const delay = Math.max(0, INTERVAL - elapsed)
    timer = setTimeout(doFetch, delay)
  }

  const doFetch = async () => {
    timer = undefined
    if (!active) return
    try {
      await opts.fetch()
      lastRefreshAt = Date.now()
      retryCount = 0
    } catch {
      retryCount++
      if (retryCount <= MAX_RETRIES) {
        timer = setTimeout(doFetch, RETRY_INTERVAL)
        return
      }
      retryCount = 0
    }
    scheduleNext()
  }

  return {
    start() {
      if (active) return
      active = true
      scheduleNext()
    },
    stop() {
      active = false
      clear()
    },
    touch() {
      lastRefreshAt = Date.now()
      retryCount = 0
      if (active) {
        clear()
        scheduleNext()
      }
    },
    get lastRefreshAt() {
      return lastRefreshAt
    },
    get active() {
      return active
    },
  }
}
