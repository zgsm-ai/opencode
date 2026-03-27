import type { ProviderConfig } from "@opencode-ai/sdk/v2/client"

type Translate = (key: string, vars?: Record<string, string | number | boolean>) => string

type FieldError = {
  providerID?: string
  name?: string
  baseURL?: string
}

type ModelRowError = {
  id?: string
  name?: string
}

type HeaderRowError = {
  key?: string
  value?: string
}

export type FormState = {
  providerID: string
  name: string
  baseURL: string
  apiKey: string
  models: Array<{ row: string; id: string; name: string; err?: ModelRowError }>
  headers: Array<{ row: string; key: string; value: string; err?: HeaderRowError }>
  saving: boolean
  err: FieldError
}

let rowSeed = 0
const nextRow = () => `row-${++rowSeed}`

export function modelRow() {
  return { row: nextRow(), id: "", name: "", err: {} as ModelRowError }
}

export function headerRow() {
  return { row: nextRow(), key: "", value: "", err: {} as HeaderRowError }
}

export function validateCustomProvider(input: {
  form: FormState
  t: Translate
  disabledProviders: string[]
  existingProviderIDs: Set<string>
}) {
  const err: FieldError = {}
  const models = input.form.models.map<ModelRowError>(() => ({}))
  const headers = input.form.headers.map<HeaderRowError>(() => ({}))

  const providerID = input.form.providerID.trim()
  const name = input.form.name.trim()
  const baseURL = input.form.baseURL.trim()
  const key = input.form.apiKey.trim()

  if (!providerID) {
    err.providerID = input.t("common.required")
  } else if (!/^[a-z0-9][a-z0-9-_]*$/i.test(providerID)) {
    err.providerID = input.t("common.invalidValue")
  } else if (input.existingProviderIDs.has(providerID) && !input.disabledProviders.includes(providerID)) {
    err.providerID = input.t("common.alreadyExists")
  }

  if (!name) err.name = input.t("common.required")

  if (!baseURL) {
    err.baseURL = input.t("common.required")
  } else {
    try {
      const url = new URL(baseURL)
      if (!url.protocol.startsWith("http")) err.baseURL = input.t("common.invalidValue")
    } catch {
      err.baseURL = input.t("common.invalidValue")
    }
  }

  const modelEntries = input.form.models
    .map((model, index) => ({ index, id: model.id.trim(), name: model.name.trim() }))
    .filter((model) => model.id || model.name)

  if (modelEntries.length === 0) {
    models[0] = { id: input.t("common.required") }
  }

  const seenModels = new Set<string>()
  for (const model of modelEntries) {
    if (!model.id) models[model.index].id = input.t("common.required")
    if (!model.name) models[model.index].name = input.t("common.required")
    if (model.id && seenModels.has(model.id)) models[model.index].id = input.t("common.alreadyExists")
    seenModels.add(model.id)
  }

  const headerEntries = input.form.headers
    .map((header, index) => ({ index, key: header.key.trim(), value: header.value.trim() }))
    .filter((header) => header.key || header.value)

  const seenHeaders = new Set<string>()
  for (const header of headerEntries) {
    if (!header.key) headers[header.index].key = input.t("common.required")
    if (!header.value) headers[header.index].value = input.t("common.required")
    const normalized = header.key.toLowerCase()
    if (header.key && seenHeaders.has(normalized)) headers[header.index].key = input.t("common.alreadyExists")
    seenHeaders.add(normalized)
  }

  const hasErrors =
    Object.values(err).some(Boolean) || models.some((item) => Object.values(item).some(Boolean)) || headers.some((item) => Object.values(item).some(Boolean))

  if (hasErrors) {
    return {
      err,
      models,
      headers,
      result: undefined,
    }
  }

  const config: ProviderConfig = {
    name,
    options: {
      baseURL,
      ...(key ? { apiKey: key } : {}),
    },
    models: Object.fromEntries(
      modelEntries.map((model) => [
        model.id,
        {
          name: model.name,
          headers: Object.fromEntries(headerEntries.map((header) => [header.key, header.value])),
        },
      ]),
    ),
  }

  return {
    err,
    models,
    headers,
    result: {
      providerID,
      name,
      key,
      config,
    },
  }
}
