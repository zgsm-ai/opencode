import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { onRateLimited, registerRateLimitToast, RateLimitToastTesting } from "./rate-limit-toast"

describe("rate-limit-toast", () => {
  const show = mock(() => {})

  beforeEach(() => {
    RateLimitToastTesting.reset()
    show.mockClear()
    registerRateLimitToast(show)
  })

  afterEach(() => {
    RateLimitToastTesting.reset()
  })

  test("invokes the registered show function on first call", () => {
    onRateLimited()
    expect(show).toHaveBeenCalledTimes(1)
  })

  test("suppresses duplicate calls while busy", () => {
    onRateLimited()
    onRateLimited()
    onRateLimited()
    expect(show).toHaveBeenCalledTimes(1)
  })

  test("does not throw when no show function is registered", () => {
    RateLimitToastTesting.reset()
    expect(() => onRateLimited()).not.toThrow()
    expect(show).not.toHaveBeenCalled()
  })

  test("allows another call after the cooldown resets", () => {
    onRateLimited()
    expect(show).toHaveBeenCalledTimes(1)

    RateLimitToastTesting.fireCooldown()

    onRateLimited()
    expect(show).toHaveBeenCalledTimes(2)
  })
})
