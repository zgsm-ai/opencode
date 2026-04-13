import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useNavigate } from "@solidjs/router"
import { Icon } from "@opencode-ai/ui/icon"

export default function WorkspaceHome() {
  const language = useLanguage()
  const navigate = useNavigate()
  const platform = usePlatform()

  return (
    <div class="h-full flex flex-col bg-[#f7f9fc]">
      {/* Top Navigation Header */}
      <header class="bg-white flex items-center pr-6 pl-14 md:px-6 h-[41px] w-full border-b border-[#DEE6F0] sticky top-0 z-30 font-['Inter'] antialiased tracking-tight text-sm shadow-sm shrink-0">
        <span class="text-lg font-bold tracking-tighter text-slate-900">CoStrict Cloud</span>
      </header>

      {/* Page Content */}
      <div class="flex-1 p-8 md:p-12 overflow-y-auto">
        <div class="max-w-[900px] mx-auto">
          {/* Welcome Header */}
          <div class="mb-12">
            <h1 class="text-[28px] font-extrabold text-[#191c1e] tracking-tight mb-2">{language.t("workspace.home.title")}</h1>
            <p class="text-[14px] text-[#424752] font-medium">{language.t("workspace.home.subtitle")}</p>
          </div>

          {/* 3-Step Cards */}
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            {/* Step 01 */}
            <div class="bg-white border border-[#DEE6F0] p-5 flex flex-col relative overflow-hidden transition-all hover:shadow-sm">
              {/* 左上角三角折角 + 数字 */}
              <div class="absolute top-0 left-0 w-16 h-16 overflow-hidden">
                <div class="absolute top-0 left-0 w-[80px] h-[80px] bg-[#F59E0B] -translate-x-1/2 -translate-y-1/2 rotate-45"></div>
                <span class="absolute top-1.5 left-2 text-sm font-extrabold text-white">01</span>
              </div>
              <div class="flex justify-end items-start mb-4">
                <Icon name="terminal" class="text-[#F59E0B] p-2 bg-[#F59E0B]/5 rounded-xl" />
              </div>
              <h3 class="text-base font-extrabold mb-2" style={{ color: "#000000" }}>{language.t("workspace.home.step1.title")}</h3>
              <p class="text-xs text-[#424752] leading-relaxed mb-6">
                {language.t("workspace.home.step1.description")}
              </p>
              <div class="mt-auto">
                <div class="bg-[#eceef1] inline-flex items-center px-3 py-2 rounded-md text-sm font-mono font-semibold text-[#191c1e] border border-[#c2c6d4]/30 shadow-sm">
                  cs cloud start
                  <Icon name="copy" class="cursor-pointer hover:text-[#2E6CC4] ml-3 text-[#424752]" />
                </div>
              </div>
            </div>

            {/* Step 02 */}
            <div class="bg-white border border-[#DEE6F0] p-5 flex flex-col relative overflow-hidden transition-all hover:shadow-sm">
              {/* 左上角三角折角 + 数字 */}
              <div class="absolute top-0 left-0 w-16 h-16 overflow-hidden">
                <div class="absolute top-0 left-0 w-[80px] h-[80px] bg-[#2E6CC4] -translate-x-1/2 -translate-y-1/2 rotate-45"></div>
                <span class="absolute top-1.5 left-2 text-sm font-extrabold text-white">02</span>
              </div>
              <div class="flex justify-end items-start mb-4">
                <Icon name="folder-add-left" class="text-[#2E6CC4] p-2 bg-[#2E6CC4]/5 rounded-xl" />
              </div>
              <h3 class="text-base font-extrabold mb-2" style={{ color: "#000000" }}>{language.t("workspace.home.step2.title")}</h3>
              <p class="text-xs text-[#424752] leading-relaxed mb-6">
                {language.t("workspace.home.step2.description")}
              </p>
              <div class="mt-auto">
                <Icon name="arrow-left" class="text-[#2E6CC4] animate-pulse" />
              </div>
            </div>

            {/* Step 03 */}
            <div class="bg-white border border-[#DEE6F0] p-5 flex flex-col relative overflow-hidden transition-all hover:shadow-sm">
              {/* 左上角三角折角 + 数字 */}
              <div class="absolute top-0 left-0 w-16 h-16 overflow-hidden">
                <div class="absolute top-0 left-0 w-[80px] h-[80px] bg-[#10B981] -translate-x-1/2 -translate-y-1/2 rotate-45"></div>
                <span class="absolute top-1.5 left-2 text-sm font-extrabold text-white">03</span>
              </div>
              <div class="flex justify-end items-start mb-4">
                <Icon name="code" class="text-[#10B981] p-2 bg-[#10B981]/5 rounded-xl" />
              </div>
              <h3 class="text-base font-extrabold mb-2" style={{ color: "#000000" }}>{language.t("workspace.home.step3.title")}</h3>
              <p class="text-xs text-[#424752] leading-relaxed mb-6">
                {language.t("workspace.home.step3.description")}
              </p>
              <div class="mt-auto">
                <button
                  class="rounded uppercase tracking-wider font-bold text-sm px-5 py-2.5 hover:opacity-90 active:scale-95 transition-all"
                  style={{ "background-color": "#2E6CC4", color: "#ffffff" }}
                >
                  {language.t("workspace.home.step3.button")}
                </button>
              </div>
            </div>
          </div>

          {/* 2-Column Section */}
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            {/* Quick Actions */}
            <div>
              <h4 class="text-xs font-bold text-[#424752] uppercase tracking-widest mb-4">
                {language.t("workspace.home.quickActions")}
              </h4>
              <div class="flex flex-col gap-3">
                <button
                  class="flex items-center justify-between px-4 py-3 border border-[#2E6CC4] text-[#2E6CC4] rounded-lg hover:bg-[#2E6CC4]/5 transition-all active:scale-[0.98]"
                  onClick={() => navigate("/store")}
                >
                  <span class="flex items-center gap-3 font-semibold text-sm">
                    <Icon name="store" />
                    {language.t("workspace.home.browseStore")}
                  </span>
                  <Icon name="arrow-right" />
                </button>
                <button
                  class="flex items-center justify-between px-4 py-3 border border-[#DEE6F0] text-[#424752] rounded-lg hover:bg-slate-50 transition-all active:scale-[0.98]"
                  onClick={() => platform.openLink("https://docs.costrict.ai")}
                >
                  <span class="flex items-center gap-3 font-semibold text-sm">
                    <Icon name="help" />
                    {language.t("workspace.home.viewDocs")}
                  </span>
                  <Icon name="square-arrow-top-right" />
                </button>
              </div>
            </div>

            {/* Pro Tip — mt aligns top with Browse Store button (h4 height + mb-4) */}
            <div class="bg-[#EFF6FF] border border-[#B6CAE3] border-l-4 border-l-[#2E6CC4] p-5 flex gap-4 mt-[36px] h-[112px]">
              <Icon name="warning" class="text-[#2E6CC4] mt-0.5" />
              <div>
                <h4 class="text-sm font-bold text-[#071d30] mb-1">{language.t("workspace.home.proTip")}</h4>
                <p class="text-xs text-[#35485d] leading-relaxed">
                  {language.t("workspace.home.proTipContent")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
