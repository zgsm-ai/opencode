import { type Component, Show, createSignal } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import type { RiskLevel, ApprovalStatus } from "@/client/cloud-team-types"

const riskColors: Record<RiskLevel, { dot: string; badge: string; text: string }> = {
  low: { dot: "bg-green-500", badge: "bg-green-50", text: "text-green-700" },
  medium: { dot: "bg-amber-500", badge: "bg-amber-50", text: "text-amber-700" },
  high: { dot: "bg-red-500", badge: "bg-red-50", text: "text-red-700" },
}

export const ApprovalItem: Component<{
  approvalId: string
  description: string
  toolName: string
  requesterName: string
  riskLevel: RiskLevel
  status: ApprovalStatus
  onApprove: (id: string) => void
  onReject: (id: string) => void
}> = (props) => {
  const [responding, setResponding] = createSignal(false)
  const risk = () => riskColors[props.riskLevel]

  const handleApprove = async () => {
    setResponding(true)
    try {
      props.onApprove(props.approvalId)
    } finally {
      setResponding(false)
    }
  }

  const handleReject = async () => {
    setResponding(true)
    try {
      props.onReject(props.approvalId)
    } finally {
      setResponding(false)
    }
  }

  return (
    <div class="flex items-start gap-2 px-3 py-2 rounded-md border border-border-weak-base">
      <div class={`mt-1 w-2 h-2 shrink-0 rounded-full ${risk().dot}`} />
      <div class="flex-1 min-w-0">
        <div class="text-13-regular text-text-base truncate">{props.description}</div>
        <div class="flex items-center gap-2 mt-0.5">
          <span class="text-11-regular text-text-weak">{props.requesterName}</span>
          <span class="text-11-regular text-text-weaker">·</span>
          <span class="text-11-regular text-text-weak">{props.toolName}</span>
          <span class={`text-10-regular px-1 py-0 rounded ${risk().badge} ${risk().text}`}>
            {props.riskLevel}
          </span>
        </div>
      </div>
      <Show when={props.status === "pending"}>
        <div class="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="small"
            class="text-12-regular text-green-600 hover:text-green-700"
            disabled={responding()}
            onClick={handleApprove}
          >
            Approve
          </Button>
          <Button
            variant="ghost"
            size="small"
            class="text-12-regular text-red-600 hover:text-red-700"
            disabled={responding()}
            onClick={handleReject}
          >
            Reject
          </Button>
        </div>
      </Show>
      <Show when={props.status !== "pending'}>
        <span class={`text-11-regular ${props.status === "approved" ? "text-green-600" : "text-red-600"}`}>
          {props.status}
        </span>
      </Show>
    </div>
  )
}
