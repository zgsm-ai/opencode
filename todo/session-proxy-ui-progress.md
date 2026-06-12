# Session Proxy UI 适配任务计划

> 对接 `costrict-web/proxy` 的 Session Proxy，UI 侧需要的改动。
>
> 设计文档：`costrict-web/docs/proposals/SESSION_PROXY_DESIGN.md`
>
> 涉及仓库：`packages/ui`（共享组件库）+ `packages/app-ai-native`（主应用）

---

## 一、API 流量指向 Proxy

> 所有客户端请求从直连 server 改为经过 proxy，proxy 透传到 server。

- [x] **部署配置** — 无代码改动，通过 `.env` / Docker 环境变量指向 proxy 端口

---

## 二、Terminal 禁用处理

> Proxy 对 `*/terminal/*` 路径返回 403 `{ "error": "terminal disabled", "code": "TERMINAL_DISABLED" }`。
> UI 需检测此错误码，渲染禁用提示。

### 二.1 Terminal API 层

- [x] **`src/lib/cloud-terminal-api.ts`**
  - 新增 `TerminalDisabledError` class、`isTerminalDisabledError()`、`checkTerminalDisabled()` helper
  - `create()` 捕获 403 + `TERMINAL_DISABLED` 并 throw `TerminalDisabledError`

### 二.2 Terminal 状态管理层

- [x] **`src/context/device-terminal.tsx`**
  - 新增 `disabled` signal
  - `new()` 捕获 `TerminalDisabledError` 并设置 disabled=true
  - context value 暴露 `disabled()` 及类型

### 二.3 Terminal UI 层

- [x] **`src/pages/workspace/components/workspace-content-layout.tsx`**
  - "New Terminal" 按钮用 `<Show when={!terminal.disabled()}>` 包裹
  - `Alt+T` 快捷键 guarded：`if (terminal.disabled()) return`

### 二.4 Terminal Tab

- [x] **`src/pages/workspace/components/terminal-tab.tsx`**
  - 外层 `<Show when={terminal.disabled()}>` 渲染锁图标 + 禁用文案
  - 内层 fallback 渲染正常终端

---

## 三、Markdown `filtered-*` / `streaming-*` 前缀识别（核心）

> Proxy 过滤后在 TextPart 的 code block 语言标识中注入前缀：
> - `filtered` / `filtered-<lang>` → 已过滤的 code block
> - `streaming` / `streaming-<lang>` → 未闭合的 code block（SSE 流式中）
>
> UI 匹配规则：`filtered*` → 过滤提示卡片，`streaming*` → 骨架屏动画。

### 三.1 Shiki highlight 拦截（JS parser 路径）

- [x] **`packages/ui/src/context/marked.tsx`** — `markedShiki` 回调
  - 在 `highlight(code, lang)` 开头添加 `filtered`/`streaming` 前缀检测
  - 返回 `renderFilteredCard` / `renderStreamingSkeleton` 替代 Shiki 高亮

### 三.2 highlightCodeBlocks 拦截（native parser 路径）

- [x] **`packages/ui/src/context/marked.tsx`** — `highlightCodeBlocks()` 函数
  - for 循环中检测 `lang` 前缀，匹配时 continue 跳过高亮

### 三.3 渲染函数

- [x] **`packages/ui/src/context/marked.tsx`** — 新增 `extractLangFromPrefix()`、`langDisplayName()`、`renderFilteredCard()`、`renderStreamingSkeleton()`
  - 修复了重复的 `escapeHtml` 函数（删除 line ~464 的重复定义）

### 三.4 CSS 样式

- [x] **`packages/ui/src/components/markdown.css`** — 新增
  - `[data-component="code-filtered"]` 卡片样式（锁图标 + 标签 + 语言标识）
  - `[data-component="code-streaming"]` 骨架屏样式（pulse 动画）

### 三.5 markdown-stream.ts 兼容性验证

- [x] **`packages/ui/src/components/markdown-stream.ts`** — 已审查
  - `open()` 基于 markdown 语法判断未闭合，与语言前缀无关 → 兼容
  - `heal()` / `stream()` 不修改语言标识 → 兼容

---

## 四、ToolPart `_filtered` 标记识别

> Proxy 过滤 ToolPart 后在 `state.metadata` 中注入 `_filtered` 对象：
> ```json
> { "strategy": "redact", "reason": "tool_output", "toolName": "read_file", "originalSize": 3842 }
> ```

### 四.1 Tool 分发层

- [x] **`packages/ui/src/components/message-part.tsx`** — `ToolPartDisplay`
  - 新增 `filtered` memo 检测 `state.metadata._filtered`
  - 当 `_filtered` 存在时，渲染 `<div data-component="tool-filtered">` 卡片（SVG 锁图标 + label + toolName + size）
  - 正常渲染用 `<Show when={!filtered()}>` 包裹，不渲染时跳过所有 Dynamic 组件

### 四.2 CSS

- [x] **`packages/ui/src/components/message-part.css`** — 新增 `tool-filtered` 样式

### 四.3 GenericTool / 各工具渲染器

- [x] ~~统一在分发层拦截，无需单独修改 GenericTool / 各工具渲染器~~

---

## 五、Runtime 文件 / Diff 查看器 `_filtered` 标记识别

> Proxy 过滤 Runtime 接口后注入顶层 `_filtered`：
> ```json
> { "content": "[code filtered]", "_filtered": { "strategy": "redact", "reason": "runtime_file", "path": "src/main.go", "originalSize": 5120 } }
> ```

### 五.1 文件内容查看器

- [x] **`app-ai-native/src/context/file/types.ts`** — 新增 `FilteredInfo` 类型 + `FileState.filtered` 字段
- [x] **`app-ai-native/src/context/file.tsx`** — `load()` 函数提取 `_filtered` 并存入 state
- [x] **`app-ai-native/src/pages/workspace/components/file-preview-tab.tsx`** — `FilePreviewTab`
  - 新增 `filtered` memo
  - Switch 中优先匹配 `filtered()` → 渲染过滤提示卡片（Tailwind inline）
  - 匹配时跳过 CodeMirror / Markdown 预览

### 五.2 Diff 查看器

- [x] **`app-ai-native/src/client/device-client.ts`** — `DiffContentData` 新增 `_filtered?: FilteredInfo`
- [x] **`app-ai-native/src/pages/workspace/components/diff-preview-tab.tsx`** — `DiffPreviewTab`
  - Switch 中优先匹配 `diffResult()?._filtered` → 渲染过滤提示卡片（Tailwind inline）
  - 匹配时跳过 Dynamic diff 组件

---

## 六、错误边界与降级

> Proxy 自身返回错误时的 UI 处理。

### 六.1 Proxy 错误识别

- [x] **`app-ai-native/src/client/device-transport.ts`**
  - 新增 `PROXY_ERROR_CODES` Set（`UPSTREAM_ERROR`、`FILTER_ERROR`、`TERMINAL_DISABLED`）
  - 新增 `isProxyError()` 类型守卫

### 六.2 SSE 连接错误

- [x] **`app-ai-native/src/client/device-client.ts`** — `event.stream()`
  - SSE 连接失败时尝试解析 response body 提取 `proxyCode`
  - 将 `proxyCode` 挂载到 Error 对象上传递给 `onSseError` 回调

- [x] **`app-ai-native/src/context/device-workspace.tsx`** — `startEventStream()`
  - 新增 `proxyError` signal，暴露在 `DeviceWorkspaceValue` 接口
  - SSE `onSseError` 回调检测 `proxyCode`，设置 `proxyError`
  - `FILTER_ERROR` 视为致命错误，停止自动重试
  - `UPSTREAM_ERROR` 使用更长退避（5s）重试
  - 连接成功时自动清除 `proxyError`

### 六.3 代理错误横幅

- [x] **`app-ai-native/src/pages/workspace/components/workspace-content-layout.tsx`** — `WorkspaceContentLayout`
  - 内容区顶部渲染 `proxyError` 横幅
  - 根据 error code 显示不同文案（UPSTREAM_ERROR / FILTER_ERROR / 其他）
  - 横幅带图标 + 警告色背景

---

## 优先级与实施建议

### MVP（最小可行，可独立上线）

仅需 **阶段一 + 二 + 三**：

| 优先级 | 阶段 | 工作量 | 说明 |
|--------|------|--------|------|
| P0 | 一、API 指向 Proxy | 0.5h | 改 env 文件 |
| P0 | 二、Terminal 禁用 | 2h | API 层 + 状态 + UI |
| P0 | 三、Markdown filtered/streaming | 4h | highlight 拦截 + 渲染 + CSS |

### 完整版（后续迭代）

| 优先级 | 阶段 | 工作量 | 说明 |
|--------|------|--------|------|
| P1 | 四、ToolPart _filtered | 3h | 分发层 + 各工具渲染器 |
| P1 | 五、Runtime _filtered | 2h | 文件查看器 + Diff 查看器 |
| P2 | 六、错误边界 | 1h | proxy 特有错误处理 |

---

## 依赖关系图

```
一（API 指向 Proxy）
├── 二（Terminal 禁用）
└── 三（Markdown filtered/streaming）
    ├── 四（ToolPart _filtered）     ← 可后续迭代
    └── 五（Runtime _filtered）     ← 可后续迭代

六（错误边界）— 独立，可并行
```

---

## 验证清单

- [x] API 指向 proxy 后，所有非 session 功能正常（设备管理、能力项 store、认证）— 部署时验证
- [x] Terminal 创建返回 403 时，UI 渲染禁用提示，无 crash
- [x] TextPart 含 `filtered-python` code block 时，渲染过滤卡片而非语法高亮
- [x] TextPart 含 `streaming-python` code block 时，渲染骨架屏动画
- [ ] SSE 流式中 `streaming-*` → `filtered-*` 过渡平滑，无闪烁 — 集成测试
- [x] ToolPart 含 `state.metadata._filtered` 时，output 区域显示过滤提示
- [x] Runtime 文件内容含 `_filtered` 时，文件查看器显示过滤提示
- [x] Proxy 错误（502）时 UI 不 crash，显示合理错误提示横幅
