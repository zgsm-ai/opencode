import { type Component, For, Show, createSignal, onCleanup, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@opencode-ai/ui/button"
import { useDeviceSDK } from "@/context/device-sdk"
import { useCloudTeam } from "@/context/cloud-team"

type PermissionReply = "once" | "always" | "reject"

type LocalPermissionRequest = {
  id: string
  sessionID: string
  permission: string
  patterns?: string[]
}

type LocalQuestionOption = {
  label: string
  description?: string
}

type LocalQuestionInfo = {
  question: string
  header?: string
  options?: LocalQuestionOption[]
}

type LocalQuestionRequest = {
  id: string
  sessionID: string
  questions?: LocalQuestionInfo[]
}

const POLL_INTERVAL = 1500

function asPermissionList(input: unknown): LocalPermissionRequest[] {
  if (!Array.isArray(input)) return []
  return input.filter((item): item is LocalPermissionRequest => {
    const candidate = item as Partial<LocalPermissionRequest>
    return typeof candidate?.id === "string" && typeof candidate?.permission === "string"
  })
}

function asQuestionList(input: unknown): LocalQuestionRequest[] {
  if (!Array.isArray(input)) return []
  return input.filter((item): item is LocalQuestionRequest => {
    const candidate = item as Partial<LocalQuestionRequest>
    return typeof candidate?.id === "string"
  })
}

function firstOptionAnswers(request: LocalQuestionRequest): string[][] {
  const questions = Array.isArray(request.questions) ? request.questions : []
  if (questions.length === 0) return [["continue"]]
  return questions.map((question) => {
    const first = Array.isArray(question.options) ? question.options[0] : undefined
    if (first?.label && first.label.trim()) return [first.label]
    return ["continue"]
  })
}

function samePermissionList(a: LocalPermissionRequest[], b: LocalPermissionRequest[]): boolean {
  if (a.length !== b.length) return false
  const key = (x: LocalPermissionRequest) => `${x.id}|${x.sessionID}|${x.permission}|${(x.patterns ?? []).join(",")}`
  for (let i = 0; i < a.length; i += 1) {
    if (key(a[i]) !== key(b[i])) return false
  }
  return true
}

function sameQuestionList(a: LocalQuestionRequest[], b: LocalQuestionRequest[]): boolean {
  if (a.length !== b.length) return false
  const key = (x: LocalQuestionRequest) => `${x.id}|${x.sessionID}|${(x.questions ?? []).map((q) => `${q.header ?? ""}:${q.question ?? ""}`).join("||")}`
  for (let i = 0; i < a.length; i += 1) {
    if (key(a[i]) !== key(b[i])) return false
  }
  return true
}

export const CloudTeamRuntimeRequests: Component = () => {
  const device = useDeviceSDK()
  const cloudTeam = useCloudTeam()

  const [permissions, setPermissions] = createSignal<LocalPermissionRequest[]>([])
  const [questions, setQuestions] = createSignal<LocalQuestionRequest[]>([])
  const [busyPerms, setBusyPerms] = createSignal<Set<string>>(new Set())
  const [busyQuestions, setBusyQuestions] = createSignal<Set<string>>(new Set())
  const [state, setState] = createStore({
    loading: false,
    loadedOnce: false,
    error: "",
  })

  const addBusyPerm = (id: string) => {
    setBusyPerms((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }

  const removeBusyPerm = (id: string) => {
    setBusyPerms((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const addBusyQuestion = (id: string) => {
    setBusyQuestions((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }

  const removeBusyQuestion = (id: string) => {
    setBusyQuestions((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const replyPermission = async (id: string, reply: PermissionReply, refreshAfter: boolean = true) => {
    if (busyPerms().has(id)) return
    addBusyPerm(id)
    setState("error", "")
    try {
      await device.client.permission.respond(id, { reply })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setState("error", message)
    } finally {
      removeBusyPerm(id)
      if (refreshAfter) {
        void loadPending(false)
      }
    }
  }

  const replyQuestion = async (id: string, answers: string[][], refreshAfter: boolean = true) => {
    if (busyQuestions().has(id)) return
    addBusyQuestion(id)
    setState("error", "")
    try {
      await device.client.question.reply(id, { answers })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setState("error", message)
    } finally {
      removeBusyQuestion(id)
      if (refreshAfter) {
        void loadPending(false)
      }
    }
  }

  const rejectQuestion = async (id: string, refreshAfter: boolean = true) => {
    if (busyQuestions().has(id)) return
    addBusyQuestion(id)
    setState("error", "")
    try {
      await device.client.question.reject(id)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setState("error", message)
    } finally {
      removeBusyQuestion(id)
      if (refreshAfter) {
        void loadPending(false)
      }
    }
  }

  const autoHandle = async (permList: LocalPermissionRequest[], questionList: LocalQuestionRequest[]) => {
    let changed = false

    if (cloudTeam.autoApprovePermissions()) {
      for (const request of permList) {
        if (busyPerms().has(request.id)) continue
        await replyPermission(request.id, "once", false)
        changed = true
      }
    }

    if (cloudTeam.autoAnswerFirstOption()) {
      for (const request of questionList) {
        if (busyQuestions().has(request.id)) continue
        await replyQuestion(request.id, firstOptionAnswers(request), false)
        changed = true
      }
    }

    if (!changed) return

    const [permRaw, questionRaw] = await Promise.all([
      device.client.permission.list(),
      device.client.question.list(),
    ])
    setPermissions(asPermissionList(permRaw))
    setQuestions(asQuestionList(questionRaw))
  }

  const loadPending = async (allowAuto: boolean = true, silent: boolean = false) => {
    if (!silent) setState("loading", true)
    try {
      const [permRaw, questionRaw] = await Promise.all([
        device.client.permission.list(),
        device.client.question.list(),
      ])
      const permList = asPermissionList(permRaw)
      const questionList = asQuestionList(questionRaw)
      if (!samePermissionList(permissions(), permList)) {
        setPermissions(permList)
      }
      if (!sameQuestionList(questions(), questionList)) {
        setQuestions(questionList)
      }
      setState("loadedOnce", true)
      setState("error", "")
      if (allowAuto) {
        await autoHandle(permList, questionList)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setState("error", message)
    } finally {
      if (!silent) setState("loading", false)
    }
  }

  onMount(() => {
    void loadPending(true, false)
    const timer = window.setInterval(() => {
      void loadPending(true, true)
    }, POLL_INTERVAL)
    onCleanup(() => window.clearInterval(timer))
  })

  return (
    <div class="px-3 py-2 border-b border-border-weak-base">
      <div class="flex items-center justify-between gap-2 mb-2">
        <div class="text-11-regular text-text-weak">
          Local Agent Requests
        </div>
        <div class="flex items-center gap-2">
          <span class={`text-10-regular px-1 py-0.5 rounded ${cloudTeam.runtimeMode() === "auto" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
            {cloudTeam.runtimeMode() === "auto" ? "Auto" : "Manual"}
          </span>
          <div class="text-10-regular text-text-weaker">
          permission {permissions().length} · question {questions().length}
          </div>
        </div>
      </div>

      <Show when={permissions().length > 0}>
        <div class="space-y-1.5 mb-2">
          <div class="text-10-regular text-text-weaker">Permissions</div>
          <For each={permissions()}>
            {(request) => (
              <div class="rounded-md border border-border-weak-base px-2 py-1.5">
                <div class="text-12-regular text-text-base break-all">{request.permission}</div>
                <Show when={(request.patterns ?? []).length > 0}>
                  <div class="text-10-regular text-text-weaker break-all">
                    {(request.patterns ?? []).join(", ")}
                  </div>
                </Show>
                <div class="flex items-center gap-1 mt-1">
                  <Button
                    variant="ghost"
                    size="small"
                    class="text-11-regular text-green-600"
                    disabled={busyPerms().has(request.id)}
                    onClick={() => void replyPermission(request.id, "once")}
                  >
                    Once
                  </Button>
                  <Button
                    variant="ghost"
                    size="small"
                    class="text-11-regular text-blue-600"
                    disabled={busyPerms().has(request.id)}
                    onClick={() => void replyPermission(request.id, "always")}
                  >
                    Always
                  </Button>
                  <Button
                    variant="ghost"
                    size="small"
                    class="text-11-regular text-red-600"
                    disabled={busyPerms().has(request.id)}
                    onClick={() => void replyPermission(request.id, "reject")}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>

      <Show when={questions().length > 0}>
        <div class="space-y-1.5">
          <div class="text-10-regular text-text-weaker">Questions</div>
          <For each={questions()}>
            {(request) => {
              const single = () => (request.questions ?? []).length === 1
              const first = () => request.questions?.[0]
              const options = () => first()?.options ?? []
              return (
                <div class="rounded-md border border-border-weak-base px-2 py-1.5">
                  <div class="text-12-regular text-text-base truncate">
                    {first()?.header || first()?.question || "Question"}
                  </div>
                  <Show when={first()?.question}>
                    <div class="text-10-regular text-text-weaker">{first()?.question}</div>
                  </Show>
                  <Show when={single() && options().length > 0}>
                    <div class="flex flex-wrap gap-1 mt-1">
                      <For each={options()}>
                        {(option) => (
                          <Button
                            variant="ghost"
                            size="small"
                            class="text-11-regular"
                            disabled={busyQuestions().has(request.id)}
                            onClick={() => void replyQuestion(request.id, [[option.label]])}
                          >
                            {option.label}
                          </Button>
                        )}
                      </For>
                    </div>
                  </Show>
                  <div class="flex items-center gap-1 mt-1">
                    <Button
                      variant="ghost"
                      size="small"
                      class="text-11-regular text-blue-600"
                      disabled={busyQuestions().has(request.id)}
                      onClick={() => void replyQuestion(request.id, firstOptionAnswers(request))}
                    >
                      Reply First
                    </Button>
                    <Button
                      variant="ghost"
                      size="small"
                      class="text-11-regular text-red-600"
                      disabled={busyQuestions().has(request.id)}
                      onClick={() => void rejectQuestion(request.id)}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              )
            }}
          </For>
        </div>
      </Show>

      <Show when={state.loadedOnce && permissions().length === 0 && questions().length === 0}>
        <div class="text-11-regular text-text-weaker">No pending local requests</div>
      </Show>

      <Show when={state.error}>
        <div class="text-11-regular text-red-500 mt-1 truncate">{state.error}</div>
      </Show>
    </div>
  )
}
