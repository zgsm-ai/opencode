# Skills Store UI 重设计方案

## 概述

将技能商店从单一混合界面拆分为完全独立的前台浏览和后台管理两套页面，采用现代开源社区风格（Hugging Face / GitHub Marketplace 风格），提升发现性和管理效率。

## 设计决策

### 核心决策

1. **架构分离**：前台浏览（`/store`）和后台管理（`/store-admin`）完全独立，仅共享数据层和基础组件
2. **浏览风格**：Hugging Face 杂志风，网格卡片式发现布局，强调推荐和分类
3. **管理风格**：Dashboard 概览 + 管理表格，支持角色动态展示（Creator + Admin）
4. **详情页**：混合模式 — Sheet 快速预览 + 独立页面（URL 可分享）

### 美学方向

干净、专业、有呼吸感的开源社区风格。不追求华丽，但每个细节都经过打磨。参考 Hugging Face 的克制配色 + GitHub 的信息层次 + npm 的功能密度。

---

## 第一部分：架构与路由

### 目录结构

```
src/pages/store/                    # 前台浏览（发现/搜索/详情）
├── index.ts
├── lib/
│   ├── api.ts                      # 共享 API 层（不变）
│   └── constants.ts                # 共享常量
├── pages/
│   ├── home.tsx                    # 首页：发现 + 搜索（包含内联搜索结果）
│   ├── detail.tsx                  # 独立详情页 /store/:slug
│   └── search.tsx                  # 独立搜索结果页（URL: /store/search?q=...）
├── components/
│   ├── browse-layout.tsx           # 浏览布局壳
│   ├── hero-search.tsx             # 大搜索框组件
│   ├── type-tabs.tsx               # 类型标签切换
│   ├── featured-carousel.tsx       # 精选推荐轮播
│   ├── capability-card.tsx         # 卡片组件（网格用）
│   ├── capability-list-item.tsx    # 列表行组件（搜索结果用）
│   ├── category-grid.tsx           # 分类网格
│   ├── detail-sheet.tsx            # Sheet 快速预览
│   ├── detail-page.tsx             # 独立详情页面
│   └── search-filters.tsx          # 搜索结果页左侧筛选栏
└── hooks/
    └── use-store-browse.ts         # 浏览相关状态逻辑

src/pages/store-admin/              # 后台管理（CRUD/管理/数据）
├── index.ts
├── pages/
│   ├── dashboard.tsx               # 概览 Dashboard
│   ├── my-capabilities.tsx         # 我创建的能力
│   ├── favorites.tsx               # 我收藏的
│   ├── received.tsx                # 收到的推送
│   └── sent.tsx                    # 发出的推送
├── components/
│   ├── admin-layout.tsx            # 管理布局（左侧导航 + 右侧内容）
│   ├── admin-sidebar.tsx           # 管理导航栏
│   ├── stats-cards.tsx             # Dashboard 统计卡片
│   ├── admin-table.tsx             # 管理表格（独立于浏览表格）
│   ├── bulk-actions-bar.tsx        # 批量操作工具栏
│   ├── status-badge.tsx            # 状态徽章
│   └── admin/                      # 管理员专属组件
│       ├── review-queue.tsx        # 审核队列
│       └── space-manager.tsx       # 空间管理
└── hooks/
    └── use-store-admin.ts          # 管理相关状态逻辑
```

### 路由结构

```
/store                        → 首页（发现 + 搜索）
/store/:slug                  → 独立详情页
/store/search?q=...&type=...  → 搜索结果页

/store-admin                  → Dashboard 概览
/store-admin/capabilities     → 我创建的
/store-admin/favorites        → 我收藏的
/store-admin/received         → 收到的
/store-admin/sent             → 发出的
/store-admin/spaces           → 空间管理（管理员）
/store-admin/review           → 审核队列（管理员）
```

### 共享边界

两套页面**仅共享**以下内容，不共享任何页面级组件：
- `lib/api.ts` — API 调用层
- `lib/constants.ts` — 类型定义、颜色常量
- `lib/auth.ts` — 认证逻辑
- `components/security-tag.tsx` — 安全标签（纯展示）
- `components/health-radar.tsx` — 健康雷达图（纯展示）

---

## 第二部分：前台浏览 — 首页

### 页面结构

```
┌─────────────────────────────────────────────────────────┐
│  顶部导航栏                                              │
│  [Logo]  [Skills] [Subagents] [Commands] [MCP] [Plugins] │
│  [搜索图标]                    [管理入口] [用户头像]       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │                                                   │  │
│  │         Discover AI Capabilities                  │  │
│  │                                                   │  │
│  │  ┌─────────────────────────────────────────────┐  │  │
│  │  │  🔍  Search skills, subagents, commands...  │  │  │
│  │  └─────────────────────────────────────────────┘  │  │
│  │                                                   │  │
│  │     [Skills 4823] [Subagents 3210] [Commands...]  │  │
│  │                                                   │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  ── Featured ──────────────────────────────── See all → │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │  🔧      │ │  🤖      │ │  ⚡      │ │  🔌      │  │
│  │ Code     │ │ Review   │ │ Git      │ │ GitHub   │  │
│  │ Reviewer │ │ Agent    │ │ Smart    │ │ MCP      │  │
│  │          │ │          │ │          │ │          │  │
│  │ Automated│ │ Autono-  │ │ Smart git│ │ GitHub   │  │
│  │ code     │ │ mous PR  │ │ commands │ │ API int- │  │
│  │ review   │ │ review   │ │ with AI  │ │ egration │  │
│  │          │ │          │ │          │ │          │  │
│  │ ⭐756    │ │ ⭐498    │ │ ⭐534    │ │ ⭐612    │  │
│  │ ↓4.8k    │ │ ↓3.2k    │ │ ↓3.5k    │ │ ↓4.0k    │  │
│  │ 🔒 Clean │ │ 🔒 Clean │ │ 🔒 Clean │ │ 🔒 Clean │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
│                                                         │
│  ── Categories ───────────────────────────── See all →  │
│  ┌────────────────┐ ┌────────────────┐                  │
│  │  💻 Code Gen   │ │  🔍 Code Review│                  │
│  │                │ │                │                  │
│  │  API Designer  │ │  Code Reviewer │                  │
│  │  SQL Optimizer │ │  Refactoring   │                  │
│  │  +3 more  →    │ │  +5 more  →    │                  │
│  └────────────────┘ └────────────────┘                  │
│  ┌────────────────┐ ┌────────────────┐                  │
│  │  🧪 Testing    │ │  📚 Docs       │                  │
│  │  ...           │ │  ...           │                  │
│  └────────────────┘ └────────────────┘                  │
│                                                         │
│  ── Recently Updated ─────────────────────── See all →  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │  card    │ │  card    │ │  card    │ │  card    │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 能力卡片设计

```
┌──────────────────────────────────┐
│  ┌────┐                          │
│  │ 🤖 │  Review Agent            │
│  └────┘  Subagent · by Alice     │
│                                  │
│  Autonomous agent that reviews   │
│  pull requests and provides      │
│  detailed feedback on code       │
│  quality, security, and style.   │
│                                  │
│  ┌──────────┐ ┌────────┐        │
│  │#testing  │ │#review │        │
│  └──────────┘ └────────┘        │
│                                  │
│  ⭐ 498    ↓ 3.2k    👁 8.9k    │
│                         🔒 Clean │
└──────────────────────────────────┘
```

**卡片规格**：
- 固定高度 220-240px，4 列网格（响应式 3→2→1 列）
- 类型图标：左上角，用现有 5 色图标系统
- 描述：2 行截断
- 标签：最多 2-3 个，溢出用 `+N`
- 底部统计栏：⭐ 收藏 / ↓ 安装 / 👁 浏览，安全状态右对齐
- 悬停效果：微上浮 + 阴影加深 + 类型色边框

### 顶部导航栏

替换当前侧边栏（`store-sidebar.tsx`）：
- 左侧 Logo + 产品名
- 中间 5 个类型标签（带数量角标），点击跳转搜索结果页并过滤该类型
- 右侧：搜索图标（点击展开搜索框）、"管理"按钮（跳转 `/store-admin`）、用户头像

### 首页数据源

| 区域 | 数据来源 | 排序 |
|------|---------|------|
| Featured | `itemApi.list({ sortBy: "installCount", pageSize: 8 })` | 安装量降序 |
| Categories | 现有 `categoryApi.list()` + 每个分类下 Top 3 | 按 `sortOrder` |
| Recently Updated | `itemApi.list({ sortBy: "updatedAt", pageSize: 8 })` | 更新时间降序 |

### 交互细节

- **搜索框**：输入时实时搜索（300ms 防抖），回车或点击搜索图标跳转搜索结果页
- **卡片点击**：打开 Sheet 快速预览（保留当前行为）
- **Sheet 内**：顶部增加"打开完整页面 ↗"按钮，点击跳转 `/store/:slug`
- **类型标签**：切换时 URL 更新为 `/store?type=skill`，页面平滑切换到该类型的搜索结果

---

## 第三部分：前台浏览 — 搜索结果页 + 详情页

### 搜索结果页

```
┌─────────────────────────────────────────────────────────┐
│  顶部导航栏（同首页）                                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──── 筛选栏 ────┐  ┌──── 结果区 ────────────────────┐ │
│  │                │  │                                │ │
│  │  类型           │  │  2,341 results for "code"      │ │
│  │  ○ 全部        │  │  ┌─────────────────────────┐   │ │
│  │  ● Skills      │  │  │ 🔧 Code Reviewer        │   │ │
│  │  ○ Subagents   │  │  │ Automated code review   │   │ │
│  │  ○ Commands    │  │  │ ⭐756  ↓4.8k   #testing  │   │ │
│  │  ○ MCP         │  │  └─────────────────────────┘   │ │
│  │  ○ Plugins     │  │  ┌─────────────────────────┐   │ │
│  │                │  │  │ 🧪 Test Generator        │   │ │
│  │  分类           │  │  │ Generate comprehensive  │   │ │
│  │  ☐ 代码生成     │  │  │ ⭐542  ↓3.6k   #testing  │   │ │
│  │  ☐ 代码审查     │  │  └─────────────────────────┘   │ │
│  │  ☐ 测试        │  │  ...                           │ │
│  │  ...           │  │                                │ │
│  │                │  │                                │ │
│  │  安全等级       │  │                                │ │
│  │  ☐ 安全        │  │                                │ │
│  │  ☐ 低风险      │  │                                │ │
│  │  ☐ 中风险      │  │                                │ │
│  │                │  │                                │ │
│  │  标签           │  │                                │ │
│  │  ☐ productivity│  │                                │ │
│  │  ☐ testing     │  │                                │ │
│  │  ...           │  │                                │ │
│  │                │  │                                │ │
│  │  来源           │  │                                │ │
│  │  ☐ opencode-ai │  │                                │ │
│  │  ☐ internal    │  │                                │ │
│  └────────────────┘  └────────────────────────────────┘ │
│                                                         │
│  ┌─ 分页 ──────────────────────────────────────────────┐│
│  │  « ‹ 1 2 3 4 5 › »    Showing 1-15 of 2,341       ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

**搜索结果行设计**（区别于卡片，更紧凑）：

```
┌──────────────────────────────────────────────────────┐
│ ┌────┐                                               │
│ │ 🤖 │  Review Agent                    🔒 Clean     │
│ └────┘  Subagent · Code Review · by Alice Chen       │
│                                                      │
│  Autonomous agent that reviews pull requests and     │
│  provides detailed feedback on code quality,         │
│  security, and best practices.                       │
│                                                      │
│  #testing  #review  #security                        │
│                                                      │
│  ⭐ 498    ↓ 3.2k    👁 8.9k        Updated 3d ago   │
└──────────────────────────────────────────────────────┘
```

**设计要点**：
- 左侧筛选栏：固定在左侧（约 240px），可折叠。所有筛选项用 checkbox，实时更新结果
- 结果行：全宽行式布局，信息密度高于卡片，每行包含完整元数据
- 排序栏：结果区顶部有排序切换（安装量 / 收藏数 / 评分 / 最近更新）
- 空状态：搜索无结果时展示引导（换关键词、清除筛选等）

---

### 独立详情页 `/store/:slug`

参考 npm 包详情页和 GitHub repo 页：

```
┌─────────────────────────────────────────────────────────┐
│  顶部导航栏                                               │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ← Back to Store                                        │
│                                                         │
│  ┌────┐                                                 │
│  │ 🤖 │  Review Agent              [⭐ Favorite] [↗]   │
│  └────┘  Subagent · v1.0.0                              │
│         by Alice Chen · Updated Mar 15, 2026            │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  [Readme]  [Versions]  [Stats]  [Security]       │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──── 主内容区 ──────────┐  ┌── 侧边栏 ─────────────┐  │
│  │                        │  │                        │  │
│  │  # Review Agent        │  │  Install               │  │
│  │                        │  │  ┌──────────────────┐  │  │
│  │  An autonomous agent   │  │  │ cs plugin add    │  │  │
│  │  that reviews pull     │  │  │ subagent public/ │  │  │
│  │  requests and provides │  │  │ review-agent  [📋]│  │  │
│  │  detailed feedback...  │  │  └──────────────────┘  │  │
│  │                        │  │                        │  │
│  │  ## Features           │  │  ── Details ──         │  │
│  │                        │  │  Type      Subagent    │  │
│  │  - Automated PR review │  │  Category  Code Review │  │
│  │  - Security scanning   │  │  Version   1.0.0       │  │
│  │  - Style enforcement   │  │  License   MIT         │  │
│  │  - Multi-language      │  │  Visibility Public     │  │
│  │                        │  │  Source  github.com/... │  │
│  │  ## Usage              │  │                        │  │
│  │  ```bash               │  │  ── Stats ──           │  │
│  │  cs plugin add ...     │  │  ⭐ 498 favorites      │  │
│  │  ```                   │  │  ↓ 3,210 installs      │  │
│  │                        │  │  👁 8,900 views         │  │
│  │  ...                   │  │                        │  │
│  │                        │  │  ── Health ──          │  │
│  │                        │  │  [雷达图]               │  │
│  │                        │  │  Freshness: 0.8        │  │
│  │                        │  │  Popularity: 0.7       │  │
│  │                        │  │  Trust: 0.9            │  │
│  │                        │  │                        │  │
│  │                        │  │  ── Tags ──            │  │
│  │                        │  │  #testing  #review     │  │
│  │                        │  │  #security             │  │
│  │                        │  │                        │  │
│  │                        │  │  ── Security ──        │  │
│  │                        │  │  🔒 Clean              │  │
│  │                        │  │  Last scan: Mar 10     │  │
│  │                        │  │                        │  │
│  │                        │  │  ── Versions ──        │  │
│  │                        │  │  v1.0.0  Mar 15 ← latest│ │
│  │                        │  │  v0.9.0  Mar 8         │  │
│  │                        │  │  v0.8.0  Feb 20        │  │
│  └────────────────────────┘  └────────────────────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Tab 内容**：

| Tab | 内容 |
|-----|------|
| **Readme** | 渲染 `item.content` 的 Markdown，和当前行为一致 |
| **Versions** | 版本列表，每个版本展示 commit message、时间、diff 链接 |
| **Stats** | 评分维度条形图、健康雷达图。安装量趋势图在 Phase 4 中实现（需要后端聚合数据支持） |
| **Security** | 扫描结果详情、权限列表、风险建议 |

**Sheet 快速预览**（保留并简化）：
- 点击卡片/列表行 → 右侧 Sheet 滑出
- Sheet 顶部增加两个按钮：`← Back` 和 `Open full page ↗`
- Sheet 内容简化：只展示 Readme 摘要 + 安装命令 + 关键元数据
- 不展示完整 Versions/Stats/Security tab（引导用户打开完整页面）

---

## 第四部分：后台管理

### 管理布局

```
┌─────────────────────────────────────────────────────────┐
│  顶部导航栏（同前台，但高亮"管理"入口）                      │
├──────────┬──────────────────────────────────────────────┤
│          │                                              │
│  管理导航  │  右侧内容区                                   │
│          │                                              │
│  ─ 概览 ─ │                                              │
│  📊 Dashboard                                            │
│          │                                              │
│  ─ 我的 ─ │                                              │
│  📦 我的能力                                             │
│  ⭐ 收藏夹                                               │
│  📥 收到的                                               │
│  📤 发出的                                               │
│          │                                              │
│  ─ 管理 ─ │                                              │
│  📁 空间管理  ← 管理员可见                                  │
│  ✅ 审核队列  ← 管理员可见                                  │
│          │                                              │
└──────────┴──────────────────────────────────────────────┘
```

**左侧导航栏设计要点**：
- 宽约 220px，分组展示（概览 / 我的 / 管理）
- "管理"分组仅对 `systemRoles` 包含 `platform_admin` 的用户可见
- 每个导航项右侧可展示数量角标（如审核队列显示待审核数）
- 底部展示"← 返回商店"链接

---

### Dashboard 概览页

```
┌─────────────────────────────────────────────────────────┐
│  Dashboard                                              │
│                                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │  My      │ │  Total   │ │  This    │ │  Pending │  │
│  │  Skills  │ │  Installs│ │  Week    │ │  Review  │  │
│  │          │ │          │ │          │ │          │  │
│  │    12    │ │  24,521  │ │  +1,203  │ │    3     │  │
│  │  ↑2 new  │ │  ↑12%    │ │          │ │          │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
│                                                         │
│  ── Recent Activity ─────────────────────────────────── │
│  ┌────────────────────────────────────────────────────┐ │
│  │  🟢 Code Reviewer         Approved    2 hours ago  │ │
│  │  🟡 Test Generator        In Review   5 hours ago  │ │
│  │  🔵 API Designer          Published   1 day ago    │ │
│  │  🟣 GitHub MCP            Updated     2 days ago   │ │
│  │  🟢 Git Smart             Published   3 days ago   │ │
│  └────────────────────────────────────────────────────┘ │
│                                                         │
│  ── Top Performers ──────────────────────────────────── │
│  ┌──────────────────┐  ┌──────────────────┐            │
│  │ Most Installed   │  │ Most Favorited   │            │
│  │                  │  │                  │            │
│  │ 1. Code Reviewer │  │ 1. Code Reviewer │            │
│  │    ↓ 4,823       │  │    ⭐ 756          │            │
│  │ 2. Quick Fix     │  │ 2. GitHub MCP    │            │
│  │    ↓ 4,120       │  │    ⭐ 612          │            │
│  │ 3. GitHub MCP    │  │ 3. Git Smart     │            │
│  │    ↓ 4,012       │  │    ⭐ 534          │            │
│  └──────────────────┘  └──────────────────┘            │
└─────────────────────────────────────────────────────────┘
```

**Dashboard 数据**：
- 统计卡片：我的能力数 / 总安装量 / 本周增量 / 待审核数（管理员专属）
- 最近活动：最近创建、更新、审核的能力，按时间倒序
- Top Performers：我发布的能力中安装量和收藏量最高的

---

### "我的能力"页

```
┌─────────────────────────────────────────────────────────┐
│  My Capabilities                      [+ Create New]    │
│                                                         │
│  ┌─ 操作栏 ────────────────────────────────────────────┐│
│  │ 🔍 Search...    [Type ▾] [Status ▾] [Category ▾]   ││
│  │                                                     ││
│  │ ☐ Select all        ┌───────────────────────────┐  ││
│  │                     │ Bulk: [Publish] [Unpublish] │  ││
│  │                     │       [Push]    [Delete]    │  ││
│  │                     └───────────────────────────┘  ││
│  └─────────────────────────────────────────────────────┘│
│                                                         │
│  ┌─ 表格 ──────────────────────────────────────────────┐│
│  │ ☐ │ Name          │ Type    │ Status  │ Installs │  ││
│  │   │               │         │         │ Favorites│  ││
│  │   │               │         │         │ Updated  │  ││
│  │───┼───────────────┼─────────┼─────────┼──────────│  ││
│  │ ☐ │ 🔧 Code       │ Skill   │ 🟢 Live │ ↓ 4,823 │  ││
│  │   │   Reviewer    │         │         │ ⭐ 756    │  ││
│  │   │               │         │         │ Mar 15   │  ││
│  │   │               │         │         │ [Edit][⋯]│  ││
│  │───┼───────────────┼─────────┼─────────┼──────────│  ││
│  │ ☐ │ 🧪 Test       │ Skill   │ 🟡 Review│ ↓ 3,621 │  ││
│  │   │   Generator   │         │         │ ⭐ 542    │  ││
│  │   │               │         │         │ Mar 14   │  ││
│  │   │               │         │         │ [Edit][⋯]│  ││
│  └─────────────────────────────────────────────────────┘│
│                                                         │
│  « ‹ 1 2 3 › »    Showing 1-10 of 23                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**管理页 vs 浏览页对比**：

| 特性 | 浏览页 | 管理页 |
|------|-------|-------|
| 布局 | 网格卡片 | 管理表格 |
| 交互 | 点击查看详情 | checkbox 选择 + 批量操作 |
| 状态展示 | 无 | 状态徽章（Live / In Review / Draft） |
| 操作 | 收藏、分享 | 编辑、发布、下架、推送、删除 |
| 排序 | 智能推荐 | 用户自选排序列 |
| 每行高度 | 大（卡片） | 紧凑但信息分层（3 行/行） |

**每行 3 行信息**：
1. 名称 + 类型图标 | 类型 | 状态徽章 | 安装量
2. 描述（截断） | | | 收藏量
3. 标签 | | | 更新日期 + 操作按钮

**行末操作**：
- `[Edit]` — 跳转到 `/capabilities/:id/edit`
- `[⋯]` — 更多操作下拉菜单（查看、推送、转移、删除）

**批量操作栏**：
- 勾选 checkbox 后出现浮动操作栏
- 支持：批量发布、批量下架、批量推送、批量删除
- 管理员可见额外操作

**筛选器**：
- 表格顶部的下拉筛选（类型、状态、分类）
- 比浏览页的筛选更简洁，用下拉菜单而非左侧面板

---

### 管理员专属页面

**空间管理** `/store-admin/spaces`：
- 列表展示用户创建的空间（Repository）
- 每个空间展示：名称、可见性、同步状态、成员数
- 操作：编辑、成员管理、同步配置、删除

**审核队列** `/store-admin/review`：
- 展示所有待审核的能力（`status: "pending_review"`）
- 每个能力展示提交者、提交时间、变更摘要
- 操作：通过 / 拒绝（需填写原因）/ 查看详情

---

### "收藏的" / "收到的" / "发出的"

这三个页面复用管理表格组件，但简化：

| 页面 | 数据来源 | 特殊操作 |
|------|---------|---------|
| 收藏夹 | `itemApi.list({ favorited: true })` | 取消收藏 |
| 收到的 | `distributionApi.listMyReceived()` | 接受 / 忽略 / Fork |
| 发出的 | `distributionApi.listMySent()` | 撤回 / 查看详情 |

---

## 第五部分：视觉设计系统

### 配色方案

```css
/* 基础层（中性色） */
--bg-base:        #FAFAFA;         /* 页面底色，微暖灰 */
--bg-panel:       #FFFFFF;         /* 卡片、面板 */
--bg-muted:       #F3F4F6;         /* 次要区域、hover 背景 */
--border:         #E5E7EB;         /* 分割线 */
--border-strong:  #D1D5DB;         /* 强调边框 */
--text-primary:   #111827;         /* 主文字，近黑 */
--text-secondary: #6B7280;         /* 次要文字 */
--text-muted:     #9CA3AF;         /* 辅助文字、placeholder */

/* 品牌色 */
--accent:         #2563EB;         /* 主强调色（蓝），链接、按钮 */
--accent-hover:   #1D4ED8;         /* hover 态 */
--accent-subtle:  #EFF6FF;         /* 浅蓝背景 */

/* 类型色（保留现有系统） */
--type-skill:     #F59E0B;         /* 琥珀 */
--type-subagent:  #3B82F6;         /* 蓝 */
--type-command:   #10B981;         /* 翠绿 */
--type-mcp:       #8B5CF6;         /* 紫 */
--type-plugin:    #EC4899;         /* 粉 */

/* 状态色 */
--status-live:    #10B981;         /* 已发布 */
--status-review:  #F59E0B;         /* 审核中 */
--status-draft:   #6B7280;         /* 草稿 */
--status-error:   #EF4444;         /* 错误 */

/* 安全色（保留现有 SecurityTag） */
--security-clean: #10B981;
--security-low:   #F59E0B;
--security-medium:#F97316;
--security-high:  #EF4444;
```

### 排版

```css
/* 字体栈 */
--font-sans:    'Inter', system-ui, sans-serif;
--font-mono:    'JetBrains Mono', 'Fira Code', monospace;

/* 字号层次 */
/* Display:        28px / 700 / -0.025em     页面标题 */
/* H1:             22px / 700 / -0.02em      区域标题 */
/* H2:             18px / 600 / -0.015em     小节标题 */
/* H3:             15px / 600                卡片标题 */
/* Body:           14px / 400 / 1.6          正文 */
/* Small:          12px / 400 / 1.5          辅助文字、标签 */
/* Caption:        11px / 500 / 1.4          角标、极小标注 */
```

### 间距系统

```
基础单元: 4px
xs:   4px      图标与文字间距
sm:   8px      元素内间距
md:   12px     紧凑行间距
lg:   16px     区域间距
xl:   24px     区块间距
2xl:  32px     页面区域间距
3xl:  48px     大区域分隔
```

### 圆角

```
sm:   4px      标签、小按钮
md:   8px      卡片、输入框
lg:   12px     面板、对话框
full: 9999px   头像、圆形按钮、药丸标签
```

### 阴影

```css
--shadow-sm:   0 1px 2px rgba(0,0,0,0.04);
--shadow-md:   0 2px 8px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
--shadow-lg:   0 4px 16px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04);
--shadow-hover: 0 8px 24px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06);
```

### 动效

```css
/* 过渡时长 */
/* fast:    100ms    hover 色变 */
/* normal:  200ms    卡片悬浮、Sheet 滑出 */
/* slow:    300ms    页面切换、区域展开 */

/* 卡片悬浮效果 */
/* transform:  translateY(-2px) */
/* shadow:     --shadow-hover */
/* border:     类型色 20% 透明度 */
/* duration:   200ms ease-out */

/* Sheet 滑出 */
/* from:       translateX(100%) */
/* to:         translateX(0) */
/* duration:   300ms cubic-bezier(0.32, 0.72, 0, 1) */

/* 首页区域入场（stagger） */
/* Hero:       0ms    fade-in + translateY(8px) */
/* Featured:   100ms  fade-in + translateY(8px) */
/* Categories: 200ms  fade-in + translateY(8px) */
/* Recent:     300ms  fade-in + translateY(8px) */
/* duration:   400ms ease-out */
```

### 响应式断点

```
sm:   640px     卡片 1 列 → 2 列
md:   768px     导航栏折叠、筛选栏隐藏
lg:   1024px    卡片 2 列 → 3 列
xl:   1280px    卡片 3 列 → 4 列、侧边栏展开
2xl:  1536px    最大内容宽度
```

### 移动端适配

当前项目已有移动端路由（`/m/store`），本次重设计保持移动端独立路由不变，但做以下调整：

- **移动端首页**（`/m/store`）：复用新的 `capability-card` 组件，改为单列/双列布局
- **移动端详情页**（`/m/store/:slug`）：复用新的 `detail-page` 组件，侧边栏折叠到底部
- **管理页面**：移动端不支持 `/store-admin`，引导用户在桌面端操作
- **顶部导航**：移动端折叠为汉堡菜单

---

## 实施优先级

### Phase 1: 基础架构（1-2 周）

1. 创建 `store-admin` 目录结构
2. 设置新路由配置
3. 实现共享组件迁移（security-tag、health-radar 保持不变）
4. 实现基础布局组件（browse-layout、admin-layout）

### Phase 2: 前台浏览（2-3 周）

1. 实现顶部导航栏（替换侧边栏）
2. 实现首页（Hero 搜索 + Featured + Categories + Recent）
3. 实现能力卡片组件
4. 实现搜索结果页（左侧筛选 + 结果列表）
5. 实现独立详情页（Tab 切换 + 侧边栏）
6. 简化 Sheet 预览（保留但增加"打开完整页面"按钮）

### Phase 3: 后台管理（2-3 周）

1. 实现管理布局（左侧导航 + 右侧内容）
2. 实现 Dashboard 概览页
3. 实现"我的能力"页（管理表格 + 批量操作）
4. 实现收藏/收到/发出页面
5. 实现管理员专属页面（空间管理、审核队列）

### Phase 4: 视觉打磨（1 周）

1. 应用完整配色系统
2. 实现动效（卡片悬浮、Sheet 滑出、页面入场）
3. 响应式适配测试
4. 可访问性检查

---

## 技术考虑

### 性能

- 首页区域使用 `createResource` 懒加载数据
- 卡片网格使用虚拟化（如果项目数 > 50）
- 搜索结果页使用防抖（300ms）
- 图片和图标使用懒加载

### 可访问性

- 所有交互元素支持键盘导航
- 卡片和按钮有清晰的 focus 状态
- 筛选器使用语义化 HTML（fieldset、legend）
- 状态徽章同时使用颜色和图标（色盲友好）

### 国际化

- 所有文本使用 `useLanguage().t()` 获取
- 新增 i18n key 按模块组织（`store.browse.*`、`store.admin.*`）
- 支持中英文切换

### 测试

- 单元测试：新组件的核心逻辑
- E2E 测试：关键用户流程（搜索、查看详情、管理能力）
- 视觉回归测试：使用 Playwright 截图对比

---

## 成功指标

### 用户体验

- 首页加载时间 < 2s
- 搜索结果返回时间 < 500ms
- 用户能找到目标能力的平均点击次数减少 30%

### 管理效率

- 批量操作支持率 > 80%（发布、下架、推送）
- 管理员审核单个能力的平均时间 < 2 分钟
- 创建新能力的步骤数减少 20%

### 开发体验

- 前台和后台代码完全独立，可并行开发
- 新组件复用率 > 60%（基于共享基础组件）
- TypeScript 类型覆盖率 > 95%
