# Session Status 兜底机制提案

## 背景

客户端偶发异常导致会话状态错位：UI 显示「进行中（busy）」，但实际任务早已结束。表现为 spinner 永久旋转、计时器无限累加、输入框持续被 `blocked` 锁住，用户只能手动刷新页面。

当前架构完全依赖 `session.status` 事件驱动状态变更。一旦 idle 事件在任意一跳丢失或 csc 自身漏发，客户端 store 永远停在 busy，没有任何自愈路径。

## 目标

为 busy 状态加兜底：会话长时间无更新时，主动查询权威状态并按需矫正为 idle。

## 非目标

- 不修改 csc 的核心 status 状态机（仅在方案 C 评估，且证明 A+B 不足时才动）。
- 不替换现有事件驱动模型，仅在事件缺失时兜底。
- 不解决「retry 抖动」或权限/问题 dock 相关问题。

## 现状（按层梳理）

### csc（权威源）

- 真值：`SessionHandle.getEffectiveBusyStatus()`（`src/server/sessionHandle.ts:217-225`）。
  - `_prompting` 为 true → `{type:'busy'}`
  - `_status === 'stopped'` → `{type:'idle'}`
  - 否则用 `_busyStatus`
- 现成 HTTP：
  - `GET /session/status`（`src/server/routes/session.ts:357-365`）：返回 `Record[id]→status`。
  - `GET /session/:sessionID`（同文件 :366+）：单会话详情含 `busy_status`。
- RCS 已有 watchdog 范例：`packages/remote-control-server/src/__tests__/disconnect-monitor.test.ts:94-117`，长期无更新的 session 会被标记 inactive 并发布 `session_status` 事件。

### cs-cloud（透明转发）

- 仅代理 `session.status` 事件：`internal/agent/csc/adapter_sse_stream.go:54`、`adapter_sse_message.go:330`。
- 关键约束：`adapter_sse.go:279-284` 明确注释「idle 链路由 csc 拥有，cs-cloud 不合成 idle 帧」。即 cs-cloud 不会补发丢失的 idle。
- HTTP 反代已就绪：`/conversations/status` → csc `/session/status`（`internal/agent/csc/driver.go:115,117`，`internal/agent/cs/driver.go:117`）。

### costrict-web（网关桥接）

- `SessionService.GetSessionStatus`（`server/internal/gateway/session_service.go:165-179`）已实现，proxy 到设备 `GET /session/status`。
- `GetWorkspaceSessionStatus`（同文件 :313-323）封装了 workspace→device 解析。
- **公开代理路由（关键）**：两条方法无关的透明代理已就绪（`server/cmd/api/main.go:1053,1057`）：
  - `r.Any("/cloud/device/:deviceID/proxy/*path", ..., gateway.DeviceProxyHandler(...))` —— 设备归属鉴权。
  - `r.Any("/cloud/sessions/:sessionID/proxy/*path", ..., gateway.SessionProxyHandler(...))` —— Multica workspace 级权限校验，适合「只知 sessionID」的场景。
  - handler 内 `client.ProxyRequest(...)`（`server/internal/gateway/handlers.go:429`）原样透传 method/path/body/header，所以客户端可直接 `GET /cloud/device/:deviceID/proxy/session/status?directory=<encoded>` 或 `GET /cloud/sessions/:sessionID/proxy/session/status` 命中 csc 的现成接口，**无需新增任何网关路由**。
- `SessionService.GetSessionStatus`（`session_service.go:165-179`）/ `GetWorkspaceSessionStatus`（:313-323）只是给 Go 内部代码用的封装（包了一层 `ProxyDeviceSessionRequest`），不影响公开 HTTP 表面。
- SSE 订阅：`cloud.POST("/session/:sessionID/subscribe", SubscribeHandler(...))`（`server/internal/cloud/cloud.go:31`）。
- 事件常量：`EventSessionStatus = "session.status"`（`server/internal/cloud/types.go:37`）。

### app-ai-native（客户端）

- 状态唯一持有者：`src/context/device-workspace.tsx` 的 store `sessionStatus: Record[string, SessionStatus]`（:38, :113）。
- 事件流分支：`device-workspace.tsx:792-829`。
  - `idle` 立即落地，busy→idle 时标记 unread。
  - `busy`/`retry` 走 150ms debounce（`STATUS_DEBOUNCE_MS`，:591）。
- View 层派生：`pages/workspace/components/device-session-view.tsx:140-168` 从 status 派生 `isWorking`、`busySince`。
- **无任何 watchdog**。

## 根因分析

idle 丢失的可能路径：

1. **网络抖动**：SSE 链路重连时 csc 已发完 idle 帧，重连后不会回放 → 客户端永远停在重连前的 busy。
2. **csc 进程异常退出**：`sessionHandle.ts:361-362, 388-389` 在 process close/error 时会置 idle 并 emit，但如果 emit 路径本身出错（如 EventBus 已销毁），idle 就丢了。
3. **cs-cloud 适配层异常**：`adapter_sse.go:279-284` 注释明确 cs-cloud 不补 idle，依赖 csc；若 csc 那一帧格式异常被 cs-cloud 丢弃，下游就丢了。
4. **客户端 store 错位**：debounce timer 异常、effect 清理顺序错误等导致 `pendingStatus` 残留。
5. **新标签页首次加载**：从持久化摘要恢复状态时拿到了已被污染的快照（`device-workspace.tsx:512-525` 的 reconcile 直接吃下错误值）。

无论哪一种，**最终表现都是 store 里某个 id 长时间停在 busy 而无任何后续事件**——这是兜底机制可观测的信号。

## 方案设计（分层防御）

按「最快见效 → 最彻底」顺序，建议组合 A + B，C 缓做。

---

### 方案 A：客户端 watchdog（主方案）

**位置**：`packages/app-ai-native/src/context/device-workspace.tsx`

**核心逻辑**：

1. 在 store 旁维护 `lastEventAt: Record[id, number]`，每次 `session.status` 落地时刷新（在 `:792-829` 那个 case 内顺手 set）。
2. 启动一个 sweep 定时器（建议 60s），遍历 `store.sessionStatus`：
   - 仅对 `status.type === 'busy' || 'retry'` 且 `Date.now() - lastEventAt[id] > STALE_MS`（建议 90s，比单步 LLM 最坏延迟还宽松）的 id 触发拉取。
   - 调 `chat.refreshSessionStatus(id)` 命中方案 B 暴露的 HTTP（B 未上线时可直接命中 csc 的 `/session/status` 兜底）。
   - 返回 `idle` 而本地 `busy` 时，**绕过 150ms debounce**，直接 `setSessionStatus(id, {type:'idle'})`，并复用 `flushStatus` 的 wasBusy→idle unread 副作用（:632-645）。
3. 额外触发时机：
   - `visibilitychange` / `window.focus`：用户切回标签页是发现错位概率最高的时刻，立即跑一次 sweep。
   - workspace mount/unmount：照搬 `clearDebounceTimers`（:664-671）的模式做 cleanup。
4. 错误处理：拉取失败时 **不动**当前 status（避免把真 busy 误杀）；连续 N 次失败后退避到更长间隔，避免设备离线时空轮询。

**为什么放客户端**：

- 用户感知发生在这里，反馈路径最短。
- 改动局限在一个 context 文件 + chat 接口扩展一个方法。
- 按工作区作用域天然限流（同时打开多个 workspace 互不干扰）。

**局限**：

- 解决不了「新打开标签页首次 reconcile 吃下污染快照」（需 B-2）。
- 每个客户端各拉一次，设备并发压力 = 客户端数（需 B-2 在网关侧去重）。

---

### 方案 B：网关层补全（覆盖多客户端 + 首次加载）

#### B-1：复用现成的透明代理路由（无需新增网关代码）

**前置结论**：costrict-web 已有两条透明代理（`server/cmd/api/api/main.go:1053,1057`），方法无关，**B-1 无需在网关注册任何新路由**。

| 代理路由 | 鉴权 | 适用场景 |
|---------|------|---------|
| `GET /cloud/device/:deviceID/proxy/session/status?directory=<encoded>` | 设备归属 | 客户端已知 deviceID + directory，sweep 批量拉整个工作区 status map |
| `GET /cloud/sessions/:sessionID/proxy/session/status` | Multica workspace 级 | 只知 sessionID，拉单 session；或走 `GET /cloud/sessions/:id/proxy/session/:id` 取 `busy_status` |

透传后命中的就是 csc `/session/status`（`csc/src/server/routes/session.ts:357`）和 cs-cloud 的 `/conversations/status` 反代（`cs-cloud/internal/agent/csc/driver.go:115`），响应 `Record[sessionID]→SessionStatus` 与客户端 store 同构。

**app-ai-native 侧**：

- `src/context/session-chat.tsx` 的 `SessionChatBackend` 接口加 `refreshSessionStatus(id?): Promise<Record[id]→SessionStatus | SessionStatus | undefined>`。
- 实现在 `device-session-chat.tsx`，调 `useDeviceWorkspace().client`（或现有 HTTP 封装）命中上述代理路由。
- 建议默认走批量（device proxy + 整个工作区 status map），sweep 时一次请求 diff 全部 busy session；关心单 session 时再切到 session proxy。

#### B-2：网关 SSE 订阅器 per-session watchdog

**位置**：`costrict-web/server/internal/cloud`，`ConnectionManager`（`handlers.go:76` 周边）。

1. 订阅器维护每个 sessionID 的 `lastEventAt`，SSE 帧到达时刷新。
2. 后台 goroutine（30~60s 间隔）扫描所有「订阅中 + lastEventAt > STALE_MS + 最近见过 busy」的 session：
   - 主动 GET 设备 `/session/status`（已有 `SessionService.GetSessionStatus`）。
   - 若服务端确为 idle 而订阅流上次是 busy：**向所有订阅者重发一帧合成 `session.status{idle}`**，payload 加 `synthetic: true` 标记便于排障。
3. 事件常量复用 `EventSessionStatus`（`cloud/types.go:37`）。

**收益**：

- N 个客户端只触发 1 次设备拉取，去重。
- 新打开标签页首次 reconcile 时，摘要已被网关矫正过，从源头避免污染传播。
- 对所有协议接入方（不只 app-ai-native）生效。

**风险**：

- 合成事件必须严格鉴权（仅网关自己生成），避免外部伪造。
- `synthetic` 字段需在客户端识别（不强制要求 UI 区分，仅日志/排障用）。

---

### 方案 C：源头自愈（可选，仅在 A+B 不足时启动）

只在数据表明 csc 自身状态真的错乱（而非纯事件丢失）时才动，避免一开始就动最复杂的 state machine。

#### C-1：csc SessionHandle 自检

**位置**：`csc/src/server/sessionHandle.ts`。

- 加自检：若 `_busyStatus.type === 'busy'` 但底层任务队列空、距上次 `_busyStatus` 设置已超阈值（建议 5 分钟），则 `setBusyStatus({type:'idle'})` 并 emit。
- 风险：与现有 `_prompting` 状态机竞态，需要在 `sessionMessageRouter.ts` 那些设置点之外加锁或用原子比较交换。

#### C-2：cs-cloud adapter sweep

**位置**：`cs-cloud/internal/agent/csc/`。

- 参考 RCS 的 `disconnect-monitor` 思路：对长期无 `message.part.updated` 心搏的 busy session，主动拉 `/session/status` 并按需补发 idle。
- 注意：`adapter_sse.go:279-284` 注释明确「不合成 idle」，此处需在注释中说明例外——**仅当 HTTP 拉取证实过的 idle 才合成**，且需要带 synthetic 标记。

---

## 推荐落地顺序

| 阶段 | 内容 | 收益 | 风险 |
|------|------|------|------|
| 1 | **B-1（零网关改动）+ A** | 立即覆盖最常见的「标签页长时间挂着」场景 | 低，仅客户端改动 |
| 2 | **B-2** | 覆盖多客户端、新标签页首次加载 | 中，需注意合成事件鉴权 |
| 3 | **C（可选）** | 根治 csc 自身错乱 | 高，触及核心状态机 |

## 参数建议

| 参数 | 建议值 | 理由 |
|------|--------|------|
| 客户端 sweep 间隔 | 60s | 平衡响应速度与 CPU |
| `STALE_MS`（客户端） | 90s | 比单步 LLM 最坏延迟宽松 |
| 网关 sweep 间隔 | 30~60s | 服务端可更激进 |
| `STALE_MS`（网关） | 120s | 给客户端 sweep 留余地，避免双触发 |
| 拉取失败退避 | 指数退避，上限 5 min | 设备离线时避免空转 |
| 连续失败上限 | 5 次 | 超过后停止 sweep，记录告警 |

## 监控与可观测

- 客户端：每次 sweep 触发的矫正打点（sessionID、原 status、新 status、stale 时长）。
- 网关：合成事件计数 + 设备拉取成功率。
- 告警：单 workspace 内 1 小时矫正次数 > 阈值时触发，提示某设备/链路有系统性问题。

## 已确认事项

### 1. 批量拉取（已定）

走批量。一次 `conversation.status()` 拉整个工作区 status map，sweep 时 diff 所有 busy/retry session。

### 2. retry 字段已暴露

`packages/sdk/js/src/v2/gen/types.gen.ts:126-138` 定义 `SessionStatus.retry` 带 `next: number`（Unix ms 时间戳）。可做精准 retry staleness 判定：

```ts
if (s.type === "retry") return Date.now() > s.next + GRACE_MS
```

比单纯靠 `lastEventAt` 更准——retry 超过 next 还没新事件几乎必然是丢了。

### 3. deviceID / directory 无需关心

`device-workspace.tsx` 通过 `useDeviceSDK()` 拿到已配置好 baseUrl 的 SDK client（`packages/app-ai-native/src/context/device-sdk.tsx:5`），透明代理路由自动带 deviceID context。`device.client.conversation.status()`（`packages/sdk/js/src/v2/gen/sdk.gen.ts:1505`）就是命中 `GET /session/status`，由 costrict-web `/cloud/device/:deviceID/proxy/*`（`server/cmd/api/main.go:1053`）透传到 csc。

**关键**：bootstrap 里早就在用同一调用（`device-workspace.tsx:191`），所以 watchdog 实质上就是「把已有的初始化拉取放到定时器里再调一次」，零新接口、零新路由、零参数透传。

```ts
const fresh = (await device.client.conversation.status()) as Record<string, SessionStatus> ?? {}
```

### 4. 失败保守 + 退避

拉取失败绝不降级 idle（宁可保持错误 busy 也不杀真 busy）。记录 `failures` 连续次数，指数退避；连续 5 次后暂停 sweep 并打告警。

### 5. 子 agent session

`device-session-view.tsx` viewingStack 子 session 同样在 `store.sessionStatus` 里，sweep 自动覆盖，无需特殊处理。

### 6. 离线设备

设备离线时拉取必然失败，退避策略自然生效。可选优化：结合 device 在线状态跳过，但 sweep 本身轻量，依赖退避即可。

## 后续

下一步先实现 A（客户端 watchdog，复用 `/cloud/device/:deviceID/proxy/session/status` 透明代理），可作为单个 PR 合入，无需任何服务端改动。B-2 视线上后跟进。
