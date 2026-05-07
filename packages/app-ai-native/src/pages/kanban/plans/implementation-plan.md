## Plan: Kanban 组件迁移细化

在 app-ai-native 内按 feature-local 方式搭建 kanban 页面，把 6 个 Vue 组件迁到 kanban/components 下，但不做模板级直译。迁移策略是先补足 3 个共享底座能力：Popover 驱动的日期范围控件、四级组织级联、可搜索可创建的 headless 选择器；再用这些底座重组 FilterBar、CorrectionDialog、KbFilterTable。弹窗统一走 dialog context + Modal，筛选面板统一走 Popover，表格先基于现有 semantic Table 原语，不引入额外表格框架。

**Steps**
1. Phase 1 - 建立 kanban 页面骨架。新增 `c:\workspace\opencode\packages\app-ai-native\src\pages\kanban\index.ts` 作为出口文件，并建立 `components/`, `pages/`, `lib/`, `hooks/` 目录。页面结构建议对齐 projects/workspace：`components/layout.tsx` 负责页面外壳，`pages/home.tsx` 负责组装筛选栏、表格、弹窗状态。此步骤还需在 `c:\workspace\opencode\packages\app-ai-native\src\routes.tsx` 增加 `/kanban` 路由和懒加载入口。后续全部组件都依赖这个目录和路由约定。
2. Phase 1 - API 迁移。在 `packages/app-ai-native/src/api/kanban.ts` 中新增 kanban 专属的 API 包装层，统一处理后端参数转换、响应归一化。主要 API 包括：
   - `getOrgV2(params)` → `listOrgs(level, parent, dateRange?)` —— 转换日期格式为 `YYYYMMDD`，返回 `org_name[]`
   - `getAggregateKeys(params)` → `loadDimensionKeys(dimension, startDate, endDate)` —— 转换日期，返回 `{ keys: string[] }`
   - `getEfficiency(params)` → `queryEfficiencyRows(filters, page, pageSize)` —— 服务端查询整理过的表格数据行
   - `correctEfficiency(data)` → `submitCorrection(payload)` —— 统一封装纠偏请求，payload 中的日期和 trim 逻辑在 API 层处理
   - `getEfficiencyHistory(params)` → `loadCorrectionHistory(dimension, dimensionId, dateRange?)` —— 查询纠偏历史，统一响应结构
   - 所有 API 层在接收参数时做 `.trim()`，在返回时统一错误处理和响应结构验证
3. Phase 1 - 定义 kanban feature 的类型层。新增 `lib/types.ts`，集中定义 `DateRangeValue`、`OrgCascadeValue`、`FilterType`、`FilterValueMap`、`KanbanColumn`、`CorrectionPayload`、`CorrectionHistoryItem`、`EfficiencyRow` 等类型，避免把 Vue 里的隐式对象结构散落到多个组件中。`KbFilterTable`、`FilterBar`、`CorrectionDialog` 都依赖这些类型。
4. Phase 2 - 共享底座 1：日期范围控件。新增 `components/filters/date-range-picker.tsx` 作为公开组件；内部拆成 `components/filters/date-range-panel.tsx` 和 `lib/date-range.ts`。公开组件只暴露 `value`, `onChange`, `clearable`, `placeholder`, `size`。面板层负责快捷项、双日期输入或后续日历区域、关闭逻辑。格式化与 shortcut 计算放进 `lib/date-range.ts`，确保 `FilterBar` 和 `KbFilterTable` 复用同一套日期文案与快捷行为。
5. Phase 2 - 共享底座 2：组织级联。新增 `components/filters/org-cascade-select.tsx` 与 `hooks/use-org-cascade.ts`。hook 负责 4 级选项、选中值、重置下级、根据父路径加载子级以及日期变更后的 reload；组件只负责渲染 4 个选择器并把 `onChange` 向上抛。这个底座必须同时服务于 `FilterBar` 和 `KbFilterTable` 的 `cascade-org` filter，不能复制两份状态机。
6. Phase 2 - 共享底座 3：可搜索可创建选择器。新增 `components/filters/search-create-select.tsx` 与 `hooks/use-aggregate-keys.ts`。这个组件基于 `@opencode-ai/ui` 的 `Popover`、`List`、`use-filtered-list` 组合实现，不直接复用现有 `Select`，因为现有 `Select` 不支持真正的文本输入和 allow-create。`DimensionSelect` 直接基于它封装；`KbFilterTable` 的 `search-select` 过滤器也复用它。
7. Phase 2 - 迁移简单展示件。新增 `components/filters/collapsed-tag-bar.tsx`，直接对标 Vue 的 `CollapsedTagBar.vue`。它应保持纯受控：入参 `tags`，事件 `onExpand(key)`，不承担任何业务数据查询。样式上用 Tailwind 固定在右侧，通过 Solid 的 `Show` 和类切换实现过渡即可。
8. Phase 3 - 迁移 DateRangePicker。对应 Vue 的 `DateRangePicker.vue`，但目标组件要收敛为一个公共受控输入，而不是在调用方里处理格式细节。建议 public API 保留 `change` 与清空行为，内部显示文案继续使用 `start  To  end` 形式，确保行为兼容。
9. Phase 3 - 迁移 DimensionSelect。新增 `components/filters/dimension-select.tsx`。它不直接请求 API，而是组合 `search-create-select.tsx` 和 `use-aggregate-keys.ts`：hook 接收 `dimension`, `startDate`, `endDate` 并产出 `options`, `loading`, `reload`, `filter(query)`；组件只处理当前值、清空、选择和创建新值。这样 KbFilterTable 的 search-select 与独立 DimensionSelect 共用查询逻辑。
10. Phase 3 - 迁移 FilterBar。新增 `components/filters/filter-bar.tsx`。它只负责编排 `org-cascade-select.tsx`、`date-range-picker.tsx` 和右侧 actions 区域，不再自己保留复杂选项加载逻辑。推荐由页面层持有 `dateRange` 与 `orgValue`，FilterBar 仅通过 props + callbacks 回传聚合后的变更对象。
11. Phase 3 - 迁移 CorrectionDialog。新增 `components/dialogs/correction-dialog.tsx`，通过 `useDialog().show(() => <CorrectionDialog ... />)` 打开，内部用 `c:\workspace\opencode\packages\app-ai-native\src\components\modal.tsx` 承载，不自己管理 visible 布尔值。组件内部只保留 3 组本地状态：表单草稿、历史加载态、提交态。历史记录在打开后加载，成功提交后调用 `onCorrected()` 并关闭。历史表格首版直接使用 `c:\workspace\opencode\packages\app-ai-native\src\components\ui\table.tsx` 渲染，不额外抽 history table。
12. Phase 4 - 重构式迁移 KbFilterTable。不要把 Vue 单文件直接翻译。建议拆成以下文件：`components/table/filter-table.tsx` 负责 table shell 与分页；`components/table/filter-tag-bar.tsx` 负责活跃 tag 展示与清空；`components/table/filter-trigger.tsx` 负责列头 trigger 与 active 样式；`components/table/filter-panel.tsx` 负责按 filter type 分发具体 UI；`hooks/use-table-filters.ts` 负责 `filters`, `draft`, `openColumn`, `tagEdit`, `apply`, `reset`, `clearAll`；`lib/filter-utils.ts` 负责 tag 文案、值格式化、客户端过滤判断。对于 `text`, `number`, `enum`, `date`, `search-select`, `multi-select`, `cascade-org` 统一走 panel-dispatch 模式，不再写成一个 300 行大条件块。
13. Phase 4 - 明确 KbFilterTable 的状态归属。页面层拥有原始 `rows`, `page`, `pageSize`, `total`, `loading` 与服务端查询参数；`use-table-filters.ts` 拥有本地筛选状态和 tag 编辑状态；`filter-table.tsx` 只接受列定义、可见数据和事件回调。这样可以保留 Vue 版“部分列客户端过滤、部分列服务端过滤”的混合模式，但边界更清楚。
14. Phase 4 - 定义筛选器的最小可复用契约。`KanbanColumn.filter` 建议统一为 `{ type, options?, shortcuts?, serverSide?, valueGetter?, placeholder? }`。`filter-panel.tsx` 按 `type` 渲染：`text` 用输入框，`number` 用 min/max 输入，`enum` 用 checkbox 组，`date` 复用 `date-range-picker.tsx`，`search-select` 复用 `search-create-select.tsx`，`cascade-org` 复用 `org-cascade-select.tsx`。这样新列只需配 schema，不需再扩张主组件分支。
15. Phase 5 - 页面级组装。`pages/home.tsx` 应持有这些顶层状态：`dateRange`, `orgValue`, `tableQuery`, `selectedRow`, `collapsedPanels`, `correctionTarget`。页面通过 `dialog.show` 打开 `correction-dialog.tsx`，通过 props 驱动 `filter-bar.tsx` 和 `filter-table.tsx`。该页面同时负责初始数据加载、筛选变化后的刷新策略以及客户端/服务端过滤协同。
16. Phase 5 - 验证顺序。先单测/手工验证底座组件，再联调组合组件，最后联调页面。推荐顺序是 `date-range-picker` -> `org-cascade-select` -> `search-create-select` -> `dimension-select` -> `filter-bar` -> `correction-dialog` -> `filter-table` -> `kanban home`。每一步都要检查类型、焦点行为和关闭策略，避免最后一起爆问题。

**Relevant files**
- `c:\workspace\efficiency-dashboard\frontend\src\api\es.js` — 源 API 调用集合，包含 `getOrgV2`, `getAggregateKeys`, `getEfficiency`, `correctEfficiency`, `getEfficiencyHistory`
- `c:\workspace\efficiency-dashboard\frontend\src\components\CollapsedTagBar.vue` — 对应迁移目标 `kanban/components/filters/collapsed-tag-bar.tsx`。
- `c:\workspace\efficiency-dashboard\frontend\src\components\DateRangePicker.vue` — 对应迁移目标 `kanban/components/filters/date-range-picker.tsx`、`date-range-panel.tsx`、`kanban/lib/date-range.ts`。
- `c:\workspace\efficiency-dashboard\frontend\src\components\DimensionSelect.vue` — 对应迁移目标 `kanban/components/filters/dimension-select.tsx`、`search-create-select.tsx`、`kanban/hooks/use-aggregate-keys.ts`。
- `c:\workspace\efficiency-dashboard\frontend\src\components\FilterBar.vue` — 对应迁移目标 `kanban/components/filters/filter-bar.tsx`、`org-cascade-select.tsx`、`kanban/hooks/use-org-cascade.ts`。
- `c:\workspace\efficiency-dashboard\frontend\src\components\CorrectionDialog.vue` — 对应迁移目标 `kanban/components/dialogs/correction-dialog.tsx`、`kanban/lib/correction-api.ts` 或 `kanban/lib/api.ts`。
- `c:\workspace\efficiency-dashboard\frontend\src\components\KbFilterTable.vue` — 对应迁移目标 `kanban/components/table/filter-table.tsx`、`filter-panel.tsx`、`filter-tag-bar.tsx`、`filter-trigger.tsx`、`kanban/hooks/use-table-filters.ts`、`kanban/lib/filter-utils.ts`。
- `c:\workspace\opencode\packages\app-ai-native\src\pages\kanban` — 目标目录，建议新增 `index.ts`, `components/layout.tsx`, `pages/home.tsx`, `components/filters/*`, `components/dialogs/*`, `components/table/*`, `hooks/*`, `lib/*`，`api/kanban.ts`。
- `c:\workspace\opencode\packages\app-ai-native\src\routes.tsx` — 新增 kanban 路由与 lazy import。
- `c:\workspace\opencode\packages\app-ai-native\src\components\modal.tsx` — CorrectionDialog 的首选承载容器。
- `c:\workspace\opencode\packages\app-ai-native\src\styles\modal.css` — CorrectionDialog 样式基线；尽量继承，不单独造一套弹窗视觉。
- `c:\workspace\opencode\packages\app-ai-native\src\components\ui\button.tsx` — 所有 trigger、toolbar button、footer button 的统一按钮基线。
- `c:\workspace\opencode\packages\app-ai-native\src\components\ui\table.tsx` — KbFilterTable 首版的 semantic table 基线。
- `c:\workspace\opencode\packages\ui\src\components\popover.tsx` — DateRangePicker 和 KbFilterTable 筛选面板的统一弹层原语。
- `c:\workspace\opencode\packages\ui\src\components\list.tsx` — 搜索列表和键盘导航基线，用于 search-create-select。
- `c:\workspace\opencode\packages\ui\src\hooks\use-filtered-list.tsx` — search-create-select 的过滤与键盘导航核心逻辑。
- `c:\workspace\opencode\packages\ui\src\components\dialog.tsx` — 如果后续需要比 Modal 更轻的标准对话框，可作为备选；但当前推荐继续走 Modal + dialog context。
- `c:\workspace\opencode\packages\ui\src\context\dialog.tsx` — 明确 `show/close` 生命周期，CorrectionDialog 与其他 modal 都应遵循这个打开方式。
- `c:\workspace\opencode\packages\app-ai-native\src\pages\projects\components\create-project-dialog.tsx` — 表单弹窗实现参考。
- `c:\workspace\opencode\packages\app-ai-native\src\pages\console\components\device-edit-dialog.tsx` — `createStore` + modal footer + trim 校验参考。
- `c:\workspace\opencode\packages\app-ai-native\src\components\status-popover.tsx` — Popover 作为复杂浮层承载的现成参考。

**Verification**
1. 目录验证：kanban 目录落地后，确认 `index.ts` 导出模式与 `projects/index.ts`、`workspace/index.ts` 一致，路由可通过 lazy import 正常进入页面。
2. 底座验证：`date-range-picker.tsx` 必须通过 4 个行为检查，快捷项生效、手动修改范围生效、clear 生效、outside/Escape 关闭一致；`org-cascade-select.tsx` 必须验证选上级后下级重置；`search-create-select.tsx` 必须验证输入过滤、键盘选择、创建新值、清空。
3. 组合组件验证：`filter-bar.tsx` 验证日期和组织联动后的回调聚合值；`dimension-select.tsx` 验证日期切换后 keys 重载；`correction-dialog.tsx` 验证打开即拉历史、提交前 trim 校验、成功回调和关闭。
4. 表格验证：`filter-table.tsx` 验证列头打开 panel、active tag 展示、tag 再编辑、clearAll、分页与过滤联动、客户端过滤与 serverSide filter 并存。
5. 页面验证：在 `pages/home.tsx` 中串联全部组件，验证筛选 -> 数据刷新 -> 表格 tag 回显 -> 打开纠偏弹窗 -> 提交成功 -> 刷新列表的完整链路。
6. 工程验证：在 `c:\workspace\opencode\packages\app-ai-native` 下执行类型检查并本地运行页面，确认无类型错误、无明显样式漂移、移动宽度下 popover/modal/table 不溢出。

**Decisions**
- kanban 首版组件全部放在 feature 目录内，不提前上收全局 UI 库。
- CorrectionDialog 按仓库现有习惯使用 `dialog.show` + `Modal`，不保留 Vue 风格 `visible` 双向绑定。
- 所有筛选面板统一使用 `Popover`，不混用 `DropdownMenu` 承担复杂表单职责。
- `DimensionSelect` 与 `search-select` 共享一套 headless searchable-createable 组件，不重复实现两套搜索逻辑。
- `KbFilterTable` 必须拆 hook 和 panel，避免再次形成超大单体组件。
- 日期、组织、聚合 key、纠偏历史相关 API 都走 kanban/lib 包装层，组件内不直接拼后端参数。

**Further Considerations**
1. **API 层设计细节**：
   - `listOrgs` 同时接收 `dateRange` 参数是为了支持"某段时间内存在的组织"的过滤，后端通过 `startDate/endDate` 参数补充；确认后端返回 `{ data: Array<{ org_name: string }> }` 的响应格式
   - `correctEfficiency` 的请求体需包括 `dimension, dimensionId, field, oldValue, newValue, reason, operator, startDate, endDate`；确认后端返回 `{ code: 0, message: string }`，而不是 Vue 版本中的隐式解包
   - 所有 API 在 error 时应返回统一的错误对象 `{ code, message }`，在 hook/component 层通过 try-catch 处理并调用 toast/notification
2. 如果实现阶段发现 date range 首版缺少月视图日历，建议先保证受控行为和快捷项，月视图作为第二阶段增强，不要阻塞整个迁移。
3. 如果 `KbFilterTable` 后续行数明显超过当前语义表格可承受范围，再评估切换 `@tanstack/solid-table`；本轮规划不建议一开始引入。
4. 如果 kanban 未来不止一个页面，当前 `components/layout.tsx + pages/home.tsx` 结构可以自然扩展；如果只有一个入口，也仍建议保留这层结构，避免组件直接堆到根目录。