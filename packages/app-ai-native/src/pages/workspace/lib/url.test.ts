import { describe, expect, test } from "bun:test"
import { getProxyUrl, setDeviceClusterAPIURL } from "./url"

describe("getProxyUrl", () => {
  test("defaults to APP_URL when no cluster override", () => {
    setDeviceClusterAPIURL("dev-none", null)
    expect(getProxyUrl("dev-none")).toBe("http://127.0.0.1:3000/cloud/device/dev-none/proxy")
  })

  test("uses cluster API URL when set", () => {
    setDeviceClusterAPIURL("dev-a", "https://api-a.example.com")
    expect(getProxyUrl("dev-a")).toBe("https://api-a.example.com/cloud/device/dev-a/proxy")
    setDeviceClusterAPIURL("dev-a", null)
  })

  test("clearing override falls back to APP_URL", () => {
    setDeviceClusterAPIURL("dev-b", "https://api-b.example.com")
    setDeviceClusterAPIURL("dev-b", null)
    expect(getProxyUrl("dev-b")).toBe("http://127.0.0.1:3000/cloud/device/dev-b/proxy")
  })
})
