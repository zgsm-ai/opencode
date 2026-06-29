# Prompt Input 中文符号输入 Bug 排查

## 问题描述

在 session view 的 prompt input 控件(`packages/app-ai-native/src/components/prompt-input.tsx`)中:

1. 先输入一段内容(如"牛牛牛牛...")
2. 把光标移到内容**中间**
3. 按中文符号键(如 `[` → 期望输出 `【`)
4. **第一下无回显,第二下才出现**

`<input>` / `<textarea>` 控件在相同场景下表现正常,只有 `contenteditable` 的 prompt input 有此问题。

## 已确认的事实(来自诊断日志)

通过 `[ime-debug]` 系列日志捕获到完整事件序列:

```
editor FOCUS txt="牛牛..." sel=txt#5
selectionchange sel=txt#10
KEYDOWN key="ArrowLeft" code="" keyCode=37 isComposing=false
KEYUP   key="ArrowLeft" code="" keyCode=37 isComposing=false
selectionchange sel=txt#9
KEYUP   key="[" code="BracketLeft" keyCode=219 isComposing=false   ← 只有 keyup,没有 keydown!
```

**关键结论:**

- `[` 键的 `keydown` 事件**完全缺失** —— IME 在 OS 层就吞掉了这个按键,浏览器根本没有 dispatch
- 没有任何 `compositionstart` / `beforeinput` / `input` / `MUTATION` 事件触发
- ArrowLeft 的 `code=""` 说明 IME 正在拦截所有按键事件
- **我们的 JS 代码在 ArrowLeft 和 `[` 之间什么都没做** —— 不是代码在两次按键之间干扰了 IME
- 问题出在 IME ↔ contenteditable 交互层面:光标移动后 IME context 被"失效",第一下按键用于重新建立 context,第二下才真正插入

## 排查策略

虽然日志显示我们的代码在两次按键之间没有运行,但**某个功能可能在更早的时机设置了某种状态**(比如改了 CSS、属性、或者注册了某种监听),对 IME context 产生了延迟影响。因此需要逐项注释功能来排除。

**测试方法:** 每次只注释一项 → 刷新页面 → 输入"牛牛..." → ArrowLeft 移到中间 → 按 `[` → 观察第一下是否回显。

## 排查跟踪表

| 序号 | 功能项 | 位置 | 可疑度 | 状态 | Bug 复现? | 备注 |
|------|--------|------|--------|------|-----------|------|
| 1 | 诊断 MutationObserver 块 | `prompt-input.tsx:400-483` | 高 | 待测 | — | 先排除自身干扰;整段 `createEffect` 注释 |
| 2 | `composing` 信号 + composition handlers | `prompt-input.tsx:493` + `:1507-1508` | 高 | 待测 | — | IME 事件时唯一直接触发 SolidJS 响应式的功能 |
| 3 | DOM↔store 同步 effect | `prompt-input.tsx:894` | 高 | 待测 | — | 每次 prompt.set 触发;有 composing 守卫 |
| 4 | `queueScroll` + `scrollCursorIntoView` | `prompt-input.tsx:167-169` | 高 | 待测 | — | 每次 handleInput 调度 rAF |
| 5 | 编辑器属性 `spellcheck={false}` | `prompt-input.tsx:1503` | 中高 | 待测 | — | 某些 IME 会因此改变行为 |
| 6 | 编辑器属性 `autocorrect="off"` | `prompt-input.tsx:1502` | 中高 | 待测 | — | 非标准 contenteditable 属性 |
| 7 | 编辑器属性 `autocapitalize="off"` | `prompt-input.tsx:1501` | 中高 | 待测 | — | 非标准 contenteditable 属性 |
| 8 | `contenteditable="true"` → `"plaintext-only"` | `prompt-input.tsx:1500` | 中高 | 待测 | — | 改属性值,不改逻辑 |
| 9 | `handleKeyDown` Backspace 分支 | `prompt-input.tsx:1274-1290` | 中 | 待测 | — | 直接操作 selection |
| 10 | 全局 "t" 快捷键监听 | `prompt-input.tsx:383-398` | 中 | 待测 | — | document.addEventListener keydown |
| 11 | Placeholder 轮播 setInterval | `prompt-input.tsx:485-491` | 中 | 待测 | — | 每 10s 触发 store 更新 |
| 12 | `role="textbox"` 属性 | `prompt-input.tsx:1498` | 低中 | 待测 | — | ARIA 属性,理论上不影响 IME |
| 13 | Popover 滚动到可视区 | `prompt-input.tsx:847-864` | 低 | 待测 | — | 仅 popover 打开时触发 |
| 14 | Queue 自动重交 effect | `prompt-input.tsx:1246-1264` | 低 | 待测 | — | 仅 status idle 时触发 |
| 15 | `handleKeyDown` 其他分支 | `prompt-input.tsx:1266+` | 低 | 待测 | — | Enter/!/Escape/Ctrl+U 等 |
| 16 | Pills(file/agent/workspace) | `prompt-input.tsx:760+` | 低 | 待测 | — | 文本无 pill 时可排除 |
| 17 | @-mention 自动补全 | `prompt-input.tsx:520-560` | 低 | 待测 | — | 仅 `@` 触发 |
| 18 | Workspace 文件搜索 | `prompt-input.tsx:620-660` | 低 | 待测 | — | 仅特定场景触发 |
| 19 | Slash 命令 | `prompt-input.tsx:780+` | 低 | 待测 | — | 仅 `/` 开头触发 |
| 20 | Shell 模式 | `store.mode === "shell"` | 低 | 待测 | — | 仅 `!` 前缀触发 |
| 21 | History 导航 | `savedPrompt`/`historyIndex` | 低 | 待测 | — | 仅上/下箭头触发 |
| 22 | 图片附件 | drag-drop/paste/picker | 低 | 待测 | — | 不动编辑器文本 |
| 23 | Context items | `PromptContextItems` | 低 | 待测 | — | 独立区域,不动编辑器 |
| 24 | `whitespace-pre-wrap` CSS | `prompt-input.tsx:1511` | 低 | 待测 | — | 仅影响排版 |

## 建议排查顺序

1. **第 1 项**(诊断 observer)→ 排除自身干扰
2. **第 2 项**(`composing` 信号)→ IME 最直接嫌疑
3. **第 5-8 项**(编辑器属性)→ 依次试 `spellcheck` → `autocorrect`/`autocapitalize` → `contenteditable="plaintext-only"`
4. **第 9 项**(Backspace 分支)→ 直接操作 selection
5. **第 3-4 项**(同步 effect + queueScroll)
6. **第 10-11 项**(全局监听 + 轮播)
7. 其余低可疑项

## 状态标记说明

- **待测** — 尚未测试
- **测试中** — 正在测试(已注释,正在复现)
- **已排除** — 注释后 Bug 仍复现,不是元凶
- **元凶** — 注释后 Bug 消失,确认是元凶
- **部分缓解** — 注释后 Bug 减轻但未完全消失

## 测试记录

(每次测试后在此追加日期、测试项、结果)

-
