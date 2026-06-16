import { createMemo, Show } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { Button } from "@opencode-ai/ui/button"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { useAuth } from "@/context/auth"
import { useLanguage } from "@/context/language"
import { getLoginUrl } from "@/pages/store/lib/auth"
import AvatarDisplay from "@/components/avatar-display"
import { UserDropdown } from "@/components/user-menu"
import { env } from "@/lib/env"

const asset = `${(env.BASE_PATH || "").replace(/\/+$/, "")}/landing/`

function Logo() {
  return (
    <div class="flex h-9 items-center gap-3">
      <div class="h-9 w-9 overflow-hidden">
        <img src={`${asset}logo.png`} alt="" class="h-full max-w-none" />
      </div>
      <span class="whitespace-nowrap text-lg font-semibold leading-none tracking-[-0.02em] text-[#454859]">
        CoStrict Cloud
      </span>
    </div>
  )
}

function Arrow(props: { tone?: string }) {
  return (
    <span
      aria-hidden="true"
      class="block size-9 bg-current"
      classList={{ "text-[#598df0]": !props.tone, "text-[#fcaa4f]": props.tone === "warm", "text-[#3db88f]": props.tone === "cool" }}
      style={{
        "mask-image": `url('${asset}arrow.svg')`,
        "mask-repeat": "no-repeat",
        "mask-size": "100% 100%",
      }}
    />
  )
}

function Card(props: { icon: string; title: string; desc: string; href: string; tone?: string; full?: boolean }) {
  const navigate = useNavigate()
  const icon = () => {
    if (!props.tone) return <img src={props.icon} alt="" class="h-[70px] w-[75px] md:h-[76px] md:w-[81px] xl:h-[70px] xl:w-[75px]" />
    return (
      <div
        class="flex h-[70px] w-[75px] items-center justify-center rounded-2xl md:h-[76px] md:w-[81px] md:rounded-[20px] xl:h-[70px] xl:w-[75px] xl:rounded-2xl"
        classList={{ "bg-[#fff4e8]": props.tone === "warm", "bg-[#ecf3ff]": props.tone === "cool" }}
      >
        <img
          src={props.icon}
          alt=""
          classList={{ "size-[26px] md:size-[29px] xl:size-[26px]": props.tone === "warm", "size-9 md:size-10 xl:size-9": props.tone === "cool" }}
        />
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => navigate(props.href)}
      class="group relative flex h-[274px] w-full flex-col items-start gap-6 rounded-2xl p-6 text-left shadow-[3px_4px_4px_0_rgba(163,193,223,0.25)] transition-transform duration-200 hover:-translate-y-1 sm:w-[335px] md:h-[300px] md:w-[365px] md:gap-7 md:rounded-[20px] md:p-7 xl:h-[274px] xl:w-[335px] xl:gap-6 xl:rounded-2xl xl:p-6"
      classList={{ "bg-[rgba(252,252,252,0.6)]": !props.tone, "bg-[rgba(252,252,252,0.5)]": props.tone === "warm", "bg-[rgba(252,252,252,0.7)]": props.tone === "cool" }}
    >
      {icon()}
      <div class="flex w-full items-start justify-between gap-4">
        <div class="flex max-w-[246px] flex-col gap-4 md:max-w-[270px] xl:max-w-[246px]">
          <h2 class="m-0 whitespace-nowrap text-2xl font-semibold leading-[1.38] tracking-[-0.02em] text-black md:text-[26px] xl:text-2xl">
            {props.title}
          </h2>
          <p
            class="m-0 text-lg font-medium leading-[1.45] tracking-[-0.02em] text-[#808387] md:text-[19px] xl:text-lg"
            classList={{ "max-w-[236px]": !props.full, "max-w-[290px]": props.full }}
          >
            {props.desc}
          </p>
        </div>
        <div class="shrink-0 pt-0.5 transition-transform duration-200 group-hover:translate-x-1 group-hover:-translate-y-1">
          <Arrow tone={props.tone} />
        </div>
      </div>
    </button>
  )
}

export default function LandingHome() {
  const auth = useAuth()
  const language = useLanguage()
  const name = () => auth.user()?.name || auth.user()?.preferred_username || auth.user()?.email || ""
  const kanban = createMemo(() => !!auth.user() && auth.canAccessMenu("kanban"))

  const move = (event: PointerEvent & { currentTarget: HTMLDivElement }) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const left = event.clientX - rect.left
    const top = event.clientY - rect.top

    event.currentTarget.style.setProperty("--bg-x", `${((left / rect.width) - 0.5) * -24}px`)
    event.currentTarget.style.setProperty("--bg-y", `${((top / rect.height) - 0.5) * -18}px`)
  }

  return (
    <div
      class="thin-scrollbar relative h-full overflow-y-auto font-[var(--native-font-body)]"
      onPointerMove={move}
      style={{ "--bg-x": "0px", "--bg-y": "0px" }}
    >
      <div
        aria-hidden="true"
        class="pointer-events-none absolute inset-[-24px] z-0 bg-cover bg-center bg-no-repeat transition-transform duration-300 ease-out"
        style={{ "background-image": `url('${asset}background.webp')`, transform: "translate3d(var(--bg-x), var(--bg-y), 0) scale(1.04)" }}
      />

      <header class="relative z-10 flex w-full items-center justify-between px-6 py-5 md:px-[26px] md:py-5">
        <Logo />
        <Show
          when={auth.user()}
          fallback={
            <Button
              variant="primary"
              onClick={() => {
                window.location.href = getLoginUrl()
              }}
            >
              {language.t("sidebar.user.signIn")}
            </Button>
          }
        >
          <UserDropdown
            trigger={
              <DropdownMenu.Trigger
                class="flex items-center gap-1.5 rounded-full px-1 py-0.5 transition-colors hover:bg-white/45 outline-none"
                aria-label={language.t("sidebar.user.menu")}
              >
                <AvatarDisplay avatarUrl={auth.user()?.picture} username={name()} size={34} />
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" class="text-[#454859]">
                  <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </DropdownMenu.Trigger>
            }
          />
        </Show>
      </header>

      <main class="relative z-10 mx-auto flex min-h-[720px] w-full max-w-[1455px] flex-col items-center px-6 pb-12 pt-[172px] md:pt-[176px] xl:pt-[234px]">
        <section class="flex w-full max-w-[1743px] flex-col items-center text-center [word-break:break-word]">
          <h1 class="m-0 text-[40px] font-semibold leading-[1.5] tracking-[-1.6px] text-black md:text-[56px] md:tracking-[-2.24px]">
            {language.t("landing.title")}
          </h1>
          <p class="m-0 mt-[11px] text-[20px] font-normal leading-[1.5] tracking-[-0.8px] text-black/60 md:text-2xl md:tracking-[-0.96px]">
            {language.t("landing.subtitle")}
          </p>
        </section>

        <section
          class={kanban()
            ? "mt-[52px] grid w-full max-w-[1093px] grid-cols-1 justify-items-center gap-5 sm:grid-cols-2 md:mt-[52px] md:gap-[21px] lg:grid-cols-3 xl:max-w-[1046px]"
            : "mt-[52px] grid w-full max-w-[690px] grid-cols-1 justify-items-center gap-5 sm:grid-cols-2 md:mt-[52px] md:max-w-[751px] md:gap-[21px] xl:max-w-[690px]"}
        >
          <Card
            icon={`${asset}workspace.svg`}
            title={language.t("landing.workspace.title")}
            desc={language.t("landing.workspace.description")}
            href="/workspace"
          />
          <Card
            icon={`${asset}knowledge.svg`}
            title={language.t("landing.knowledge.title")}
            desc={language.t("landing.knowledge.description")}
            href="/store"
            tone="warm"
          />
          <Show when={kanban()}>
            <Card
              icon={`${asset}dashboard.svg`}
              title={language.t("landing.dashboard.title")}
              desc={language.t("landing.dashboard.description")}
              href="/kanban"
              tone="cool"
              full
            />
          </Show>
        </section>
      </main>
    </div>
  )
}
