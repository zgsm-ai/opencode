import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

type ItemDetailLoadingSkeletonProps = {
  class?: string
}

export function ItemDetailLoadingSkeleton(props: ItemDetailLoadingSkeletonProps) {
  return (
    <div class={cn("overflow-hidden px-6 py-6", props.class)}>
      <div class="space-y-6">
        <div class="border-b border-border-weak-base pb-5 pr-12">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0 flex flex-1 items-center gap-3">
              <Skeleton class="h-10 w-10 rounded-[var(--native-radius-md)] bg-[color:color-mix(in_oklab,var(--native-panel-soft)_70%,var(--native-bg-subtle))]" />
              <div class="min-w-0 flex-1 space-y-2">
                <Skeleton class="h-6 w-56 max-w-[65%] rounded-md bg-[color:color-mix(in_oklab,var(--native-panel-soft)_78%,var(--native-bg-subtle))]" />
                <Skeleton class="h-3.5 w-28 rounded-full bg-[color:color-mix(in_oklab,var(--native-panel-soft)_70%,var(--native-bg-subtle))]" />
              </div>
            </div>
            <div class="flex gap-2">
              <Skeleton class="h-9 w-20 rounded-lg bg-[color:color-mix(in_oklab,var(--native-panel-soft)_72%,var(--native-bg-subtle))]" />
              <Skeleton class="h-9 w-24 rounded-lg bg-[color:color-mix(in_oklab,var(--native-panel-soft)_72%,var(--native-bg-subtle))]" />
            </div>
          </div>
          <div class="mt-4 flex w-[70%] max-w-full items-center gap-2 rounded-lg border border-[color:color-mix(in_oklab,var(--native-border)_55%,transparent)] bg-[color:color-mix(in_oklab,var(--native-panel)_82%,var(--native-bg-subtle))] px-4 py-2.5">
            <Skeleton class="h-4 flex-1 rounded bg-[color:color-mix(in_oklab,var(--native-panel-soft)_74%,var(--native-bg-subtle))]" />
            <Skeleton class="size-6 rounded-md bg-[color:color-mix(in_oklab,var(--native-panel-soft)_70%,var(--native-bg-subtle))]" />
          </div>
        </div>
        <div class="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(14rem,0.6fr)]">
          <div class="space-y-4">
            <div class="space-y-2.5">
              <Skeleton class="h-4 w-[92%] rounded bg-[color:color-mix(in_oklab,var(--native-panel-soft)_74%,var(--native-bg-subtle))]" />
              <Skeleton class="h-4 w-[84%] rounded bg-[color:color-mix(in_oklab,var(--native-panel-soft)_74%,var(--native-bg-subtle))]" />
            </div>
            <div class="rounded-xl border border-[color:color-mix(in_oklab,var(--native-border)_58%,transparent)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--native-panel)_92%,var(--native-bg-subtle)),color-mix(in_oklab,var(--native-panel-soft)_86%,var(--native-bg-subtle)))] p-4">
              <div class="space-y-3">
                <Skeleton class="h-3.5 w-24 rounded-full bg-[color:color-mix(in_oklab,var(--native-panel-soft)_78%,var(--native-bg-subtle))]" />
                <Skeleton class="h-3.5 w-[96%] rounded bg-[color:color-mix(in_oklab,var(--native-panel-soft)_78%,var(--native-bg-subtle))]" />
                <Skeleton class="h-3.5 w-[88%] rounded bg-[color:color-mix(in_oklab,var(--native-panel-soft)_78%,var(--native-bg-subtle))]" />
                <Skeleton class="h-3.5 w-[82%] rounded bg-[color:color-mix(in_oklab,var(--native-panel-soft)_78%,var(--native-bg-subtle))]" />
                <Skeleton class="mt-2 h-[22rem] rounded-lg bg-[color:color-mix(in_oklab,var(--native-panel-soft)_72%,var(--native-bg-subtle))]" />
              </div>
            </div>
          </div>
          <div class="space-y-4">
            <div class="rounded-xl border border-[color:color-mix(in_oklab,var(--native-border)_58%,transparent)] bg-[color:color-mix(in_oklab,var(--native-panel)_88%,var(--native-bg-subtle))] p-4">
              <div class="space-y-3">
                <Skeleton class="h-4 w-28 rounded bg-[color:color-mix(in_oklab,var(--native-panel-soft)_76%,var(--native-bg-subtle))]" />
                <Skeleton class="h-10 w-full rounded-lg bg-[color:color-mix(in_oklab,var(--native-panel-soft)_72%,var(--native-bg-subtle))]" />
                <Skeleton class="h-10 w-[85%] rounded-lg bg-[color:color-mix(in_oklab,var(--native-panel-soft)_72%,var(--native-bg-subtle))]" />
              </div>
            </div>
            <div class="rounded-xl border border-[color:color-mix(in_oklab,var(--native-border)_58%,transparent)] bg-[color:color-mix(in_oklab,var(--native-panel)_88%,var(--native-bg-subtle))] p-4">
              <div class="space-y-3">
                <Skeleton class="h-4 w-24 rounded bg-[color:color-mix(in_oklab,var(--native-panel-soft)_76%,var(--native-bg-subtle))]" />
                <Skeleton class="h-16 w-full rounded-lg bg-[color:color-mix(in_oklab,var(--native-panel-soft)_72%,var(--native-bg-subtle))]" />
                <Skeleton class="h-16 w-full rounded-lg bg-[color:color-mix(in_oklab,var(--native-panel-soft)_72%,var(--native-bg-subtle))]" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
