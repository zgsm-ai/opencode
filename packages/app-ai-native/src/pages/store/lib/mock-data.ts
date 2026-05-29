/**
 * Mock data for demo mode - provides static data for all store-related API calls.
 * No backend dependency required.
 */

import type {
  CapabilityItem,
  Category,
  ItemFilterOptions,
  ItemTag,
  CapabilityVersion,
  ScanResult,
  CapabilityRegistry,
  Repository,
  DistributionResult,
  UserBasicInfo,
  SearchedUser,
} from "./api"

// ---------------------------------------------------------------------------
// Mock user
// ---------------------------------------------------------------------------
export const MOCK_USER = {
  id: "demo-user-001",
  subjectId: "demo-user-001",
  username: "demo_user",
  avatarUrl: "",
  casdoorUniversalId: "demo-casdoor-001",
  systemRoles: ["admin"],
  sub: "demo-user-001",
  name: "Demo User",
  preferred_username: "demo_user",
  email: "demo@example.com",
  picture: "",
  owner: "demo-org",
}

export const MOCK_PERMISSIONS = {
  menus: ["kanban", "console"],
  apis: ["*"],
  capabilities: ["*"],
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------
const TAGS: ItemTag[] = [
  { id: "tag-1", slug: "productivity", tagClass: "system", createdBy: "system", createdAt: "2025-01-15T00:00:00Z" },
  { id: "tag-2", slug: "code-quality", tagClass: "system", createdBy: "system", createdAt: "2025-01-15T00:00:00Z" },
  { id: "tag-3", slug: "testing", tagClass: "system", createdBy: "system", createdAt: "2025-01-15T00:00:00Z" },
  { id: "tag-4", slug: "documentation", tagClass: "system", createdBy: "system", createdAt: "2025-01-15T00:00:00Z" },
  { id: "tag-5", slug: "devops", tagClass: "system", createdBy: "system", createdAt: "2025-01-15T00:00:00Z" },
  { id: "tag-6", slug: "security", tagClass: "system", createdBy: "system", createdAt: "2025-01-15T00:00:00Z" },
  { id: "tag-7", slug: "ai-assistant", tagClass: "custom", createdBy: "demo-user-001", createdAt: "2025-02-01T00:00:00Z" },
  { id: "tag-8", slug: "automation", tagClass: "custom", createdBy: "demo-user-001", createdAt: "2025-02-01T00:00:00Z" },
  { id: "tag-9", slug: "frontend", tagClass: "system", createdBy: "system", createdAt: "2025-01-20T00:00:00Z" },
  { id: "tag-10", slug: "backend", tagClass: "system", createdBy: "system", createdAt: "2025-01-20T00:00:00Z" },
]

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
export const MOCK_CATEGORIES: Category[] = [
  {
    id: "cat-1", slug: "code-generation", icon: "code", sortOrder: 1,
    names: { en: "Code Generation", zh: "代码生成" },
    descriptions: { en: "Generate code snippets and templates", zh: "生成代码片段和模板" },
    createdBy: "system", createdAt: "2025-01-01T00:00:00Z", updatedAt: "2025-01-01T00:00:00Z",
  },
  {
    id: "cat-2", slug: "code-review", icon: "search", sortOrder: 2,
    names: { en: "Code Review", zh: "代码审查" },
    descriptions: { en: "Review and improve code quality", zh: "审查和提高代码质量" },
    createdBy: "system", createdAt: "2025-01-01T00:00:00Z", updatedAt: "2025-01-01T00:00:00Z",
  },
  {
    id: "cat-3", slug: "testing", icon: "test-tube", sortOrder: 3,
    names: { en: "Testing", zh: "测试" },
    descriptions: { en: "Testing tools and frameworks", zh: "测试工具和框架" },
    createdBy: "system", createdAt: "2025-01-01T00:00:00Z", updatedAt: "2025-01-01T00:00:00Z",
  },
  {
    id: "cat-4", slug: "documentation", icon: "book", sortOrder: 4,
    names: { en: "Documentation", zh: "文档" },
    descriptions: { en: "Documentation generation and management", zh: "文档生成和管理" },
    createdBy: "system", createdAt: "2025-01-01T00:00:00Z", updatedAt: "2025-01-01T00:00:00Z",
  },
  {
    id: "cat-5", slug: "devops", icon: "cloud", sortOrder: 5,
    names: { en: "DevOps", zh: "运维" },
    descriptions: { en: "CI/CD and infrastructure tools", zh: "CI/CD 和基础设施工具" },
    createdBy: "system", createdAt: "2025-01-01T00:00:00Z", updatedAt: "2025-01-01T00:00:00Z",
  },
  {
    id: "cat-6", slug: "data-analysis", icon: "chart-bar", sortOrder: 6,
    names: { en: "Data Analysis", zh: "数据分析" },
    descriptions: { en: "Data processing and analysis", zh: "数据处理和分析" },
    createdBy: "system", createdAt: "2025-01-01T00:00:00Z", updatedAt: "2025-01-01T00:00:00Z",
  },
  {
    id: "cat-7", slug: "security", icon: "shield", sortOrder: 7,
    names: { en: "Security", zh: "安全" },
    descriptions: { en: "Security scanning and protection", zh: "安全扫描和防护" },
    createdBy: "system", createdAt: "2025-01-01T00:00:00Z", updatedAt: "2025-01-01T00:00:00Z",
  },
  {
    id: "cat-8", slug: "productivity", icon: "zap", sortOrder: 8,
    names: { en: "Productivity", zh: "效率" },
    descriptions: { en: "Productivity enhancement tools", zh: "效率提升工具" },
    createdBy: "system", createdAt: "2025-01-01T00:00:00Z", updatedAt: "2025-01-01T00:00:00Z",
  },
]

// ---------------------------------------------------------------------------
// Filter options
// ---------------------------------------------------------------------------
export const MOCK_FILTER_OPTIONS: ItemFilterOptions = {
  categories: MOCK_CATEGORIES,
  securityStatuses: [
    { value: "clean", names: { en: "Clean", zh: "安全" } },
    { value: "low", names: { en: "Low Risk", zh: "低风险" } },
    { value: "medium", names: { en: "Medium Risk", zh: "中风险" } },
    { value: "high", names: { en: "High Risk", zh: "高风险" } },
    { value: "unscanned", names: { en: "Unscanned", zh: "未扫描" } },
  ],
  securityRiskGroups: [
    { value: "low", names: { en: "Low", zh: "低" } },
    { value: "medium", names: { en: "Medium", zh: "中" } },
    { value: "high", names: { en: "High", zh: "高" } },
    { value: "unknown", names: { en: "Unknown", zh: "未知" } },
  ],
  sources: [
    { value: "github.com/opencode-ai/skills", label: "opencode-ai/skills", url: "https://github.com/opencode-ai/skills" },
    { value: "github.com/anthropic/courses", label: "anthropic/courses", url: "https://github.com/anthropic/courses" },
    { value: "github.com/community/plugins", label: "community/plugins", url: "https://github.com/community/plugins" },
    { value: "internal", label: "Internal Registry", url: "" },
  ],
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
const MOCK_USERS: Record<string, UserBasicInfo> = {
  "demo-user-001": { id: "demo-user-001", name: "Demo User", avatarUrl: "" },
  "user-002": { id: "user-002", name: "Alice Chen", avatarUrl: "" },
  "user-003": { id: "user-003", name: "Bob Zhang", avatarUrl: "" },
  "user-004": { id: "user-004", name: "Carol Li", avatarUrl: "" },
  "user-005": { id: "user-005", name: "David Wang", avatarUrl: "" },
  system: { id: "system", name: "System", avatarUrl: "" },
}

// ---------------------------------------------------------------------------
// Helper to generate mock items
// ---------------------------------------------------------------------------
function makeItem(overrides: Partial<CapabilityItem> & Pick<CapabilityItem, "id" | "slug" | "name" | "itemType">): CapabilityItem {
  const now = new Date()
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000).toISOString()
  const item: CapabilityItem = {
    registryId: "reg-public",
    description: `A powerful ${overrides.itemType} for ${overrides.name.toLowerCase()}`,
    descriptions: {
      en: `A powerful ${overrides.itemType} for ${overrides.name.toLowerCase()}`,
      zh: `用于${overrides.name}的强大${overrides.itemType}`,
    },
    category: "code-generation",
    version: "1.0.0",
    content: `# ${overrides.name}\n\nThis is a demo ${overrides.itemType} that showcases the store capabilities.\n\n## Usage\n\n\`\`\`bash\ncs plugin add ${overrides.itemType} public/${overrides.slug}\n\`\`\`\n\n## Features\n\n- Feature one: Automated code generation\n- Feature two: Smart context awareness\n- Feature three: Multi-language support\n`,
    visibility: "public",
    repoVisibility: "public",
    status: "active",
    currentRevision: 3,
    sourceType: "registry",
    source: "github.com/opencode-ai/skills",
    repoName: "public",
    installCount: Math.floor(Math.random() * 5000) + 100,
    favoriteCount: Math.floor(Math.random() * 800) + 10,
    previewCount: Math.floor(Math.random() * 10000) + 500,
    favorited: false,
    securityStatus: "clean",
    experienceScore: Math.round((3.5 + Math.random() * 1.5) * 10) / 10,
    createdBy: "user-002",
    createdAt: daysAgo(Math.floor(Math.random() * 180) + 30),
    updatedAt: daysAgo(Math.floor(Math.random() * 14)),
    tags: [TAGS[0]!, TAGS[1]!],
    health: {
      score: Math.floor(Math.random() * 30) + 70,
      signals: { freshness: 0.8, popularity: 0.7, source_trust: 0.9 },
      freshness_label: "Active",
      last_commit: daysAgo(Math.floor(Math.random() * 7)),
    },
    evaluation: {
      coding_relevance: 0.85,
      doc_completeness: 0.78,
      desc_accuracy: 0.92,
      writing_quality: 0.88,
      specificity: 0.75,
      install_clarity: 0.9,
      final_score: 85,
      decision: "approved",
      model_id: "claude-sonnet-4-20250514",
      evaluated_at: daysAgo(5),
    },
    ...overrides,
  }
  return item
}

// ---------------------------------------------------------------------------
// Mock store items (20 items across all types)
// ---------------------------------------------------------------------------
export const MOCK_ITEMS: CapabilityItem[] = [
  // --- Skills (6) ---
  makeItem({
    id: "item-skill-1", slug: "code-reviewer", name: "Code Reviewer", itemType: "skill",
    description: "Automated code review with best practices enforcement and security scanning",
    descriptions: { en: "Automated code review with best practices enforcement and security scanning", zh: "自动代码审查，执行最佳实践和安全扫描" },
    category: "code-review", installCount: 4823, favoriteCount: 756, previewCount: 12400,
    favorited: true, experienceScore: 4.8, securityStatus: "clean",
    tags: [TAGS[1]!, TAGS[5]!], createdBy: "user-002",
  }),
  makeItem({
    id: "item-skill-2", slug: "test-generator", name: "Test Generator", itemType: "skill",
    description: "Generate comprehensive unit tests and integration tests from source code",
    descriptions: { en: "Generate comprehensive unit tests and integration tests from source code", zh: "从源代码生成全面的单元测试和集成测试" },
    category: "testing", installCount: 3621, favoriteCount: 542, previewCount: 9800,
    experienceScore: 4.6, securityStatus: "clean",
    tags: [TAGS[2]!, TAGS[7]!], createdBy: "user-003",
  }),
  makeItem({
    id: "item-skill-3", slug: "api-designer", name: "API Designer", itemType: "skill",
    description: "Design RESTful and GraphQL APIs with OpenAPI spec generation",
    descriptions: { en: "Design RESTful and GraphQL APIs with OpenAPI spec generation", zh: "设计 RESTful 和 GraphQL API，生成 OpenAPI 规范" },
    category: "code-generation", installCount: 2987, favoriteCount: 421, previewCount: 8200,
    experienceScore: 4.5, securityStatus: "clean",
    tags: [TAGS[0]!, TAGS[9]!], createdBy: "demo-user-001",
  }),
  makeItem({
    id: "item-skill-4", slug: "doc-writer", name: "Documentation Writer", itemType: "skill",
    description: "Auto-generate comprehensive documentation from code comments and structure",
    descriptions: { en: "Auto-generate comprehensive documentation from code comments and structure", zh: "从代码注释和结构自动生成全面文档" },
    category: "documentation", installCount: 2456, favoriteCount: 389, previewCount: 7600,
    experienceScore: 4.3, securityStatus: "clean",
    tags: [TAGS[3]!, TAGS[7]!], createdBy: "user-004",
  }),
  makeItem({
    id: "item-skill-5", slug: "refactoring-assistant", name: "Refactoring Assistant", itemType: "skill",
    description: "Intelligent code refactoring suggestions with safe migration paths",
    descriptions: { en: "Intelligent code refactoring suggestions with safe migration paths", zh: "智能代码重构建议，提供安全迁移路径" },
    category: "code-review", installCount: 1834, favoriteCount: 267, previewCount: 5400,
    experienceScore: 4.4, securityStatus: "low",
    tags: [TAGS[1]!, TAGS[0]!], createdBy: "user-005",
  }),
  makeItem({
    id: "item-skill-6", slug: "sql-optimizer", name: "SQL Optimizer", itemType: "skill",
    description: "Analyze and optimize SQL queries for better performance",
    descriptions: { en: "Analyze and optimize SQL queries for better performance", zh: "分析和优化 SQL 查询以提高性能" },
    category: "data-analysis", installCount: 1567, favoriteCount: 198, previewCount: 4300,
    experienceScore: 4.2, securityStatus: "clean",
    tags: [TAGS[9]!, TAGS[0]!], createdBy: "user-002",
  }),

  // --- Subagents (4) ---
  makeItem({
    id: "item-subagent-1", slug: "code-review-agent", name: "Code Review Agent", itemType: "subagent",
    description: "Autonomous agent that reviews pull requests and provides detailed feedback",
    descriptions: { en: "Autonomous agent that reviews pull requests and provides detailed feedback", zh: "自主代理，审查拉取请求并提供详细反馈" },
    category: "code-review", installCount: 3210, favoriteCount: 498, previewCount: 8900,
    experienceScore: 4.7, securityStatus: "clean",
    tags: [TAGS[1]!, TAGS[6]!], createdBy: "user-003",
  }),
  makeItem({
    id: "item-subagent-2", slug: "testing-agent", name: "Testing Agent", itemType: "subagent",
    description: "Agent that automatically writes and runs tests for your codebase",
    descriptions: { en: "Agent that automatically writes and runs tests for your codebase", zh: "自动为代码库编写和运行测试的代理" },
    category: "testing", installCount: 2876, favoriteCount: 412, previewCount: 7800,
    favorited: true, experienceScore: 4.5, securityStatus: "clean",
    tags: [TAGS[2]!, TAGS[7]!], createdBy: "demo-user-001",
  }),
  makeItem({
    id: "item-subagent-3", slug: "deploy-agent", name: "Deployment Agent", itemType: "subagent",
    description: "Automated deployment agent with rollback and health check capabilities",
    descriptions: { en: "Automated deployment agent with rollback and health check capabilities", zh: "自动部署代理，具有回滚和健康检查功能" },
    category: "devops", installCount: 2134, favoriteCount: 356, previewCount: 6200,
    experienceScore: 4.4, securityStatus: "medium",
    tags: [TAGS[4]!, TAGS[7]!], createdBy: "user-004",
  }),
  makeItem({
    id: "item-subagent-4", slug: "research-agent", name: "Research Agent", itemType: "subagent",
    description: "Research and summarize technical documentation and papers",
    descriptions: { en: "Research and summarize technical documentation and papers", zh: "研究和总结技术文档和论文" },
    category: "documentation", installCount: 1789, favoriteCount: 289, previewCount: 5100,
    experienceScore: 4.3, securityStatus: "clean",
    tags: [TAGS[3]!, TAGS[6]!], createdBy: "user-005",
  }),

  // --- Commands (4) ---
  makeItem({
    id: "item-command-1", slug: "quick-fix", name: "Quick Fix", itemType: "command",
    description: "One-command fix for common linting and formatting issues",
    descriptions: { en: "One-command fix for common linting and formatting issues", zh: "一键修复常见的代码检查和格式化问题" },
    category: "code-review", installCount: 4120, favoriteCount: 623, previewCount: 11200,
    experienceScore: 4.6, securityStatus: "clean",
    tags: [TAGS[1]!, TAGS[7]!], createdBy: "user-002",
  }),
  makeItem({
    id: "item-command-2", slug: "db-migrate", name: "DB Migrate", itemType: "command",
    description: "Database migration command with rollback support and dry-run mode",
    descriptions: { en: "Database migration command with rollback support and dry-run mode", zh: "数据库迁移命令，支持回滚和试运行模式" },
    category: "devops", installCount: 2345, favoriteCount: 345, previewCount: 6700,
    experienceScore: 4.3, securityStatus: "low",
    tags: [TAGS[4]!, TAGS[9]!], createdBy: "user-003",
  }),
  makeItem({
    id: "item-command-3", slug: "git-smart", name: "Git Smart", itemType: "command",
    description: "Smart git commands with automatic commit message generation and branch management",
    descriptions: { en: "Smart git commands with automatic commit message generation and branch management", zh: "智能 Git 命令，自动生成提交信息和分支管理" },
    category: "productivity", installCount: 3567, favoriteCount: 534, previewCount: 9400,
    favorited: true, experienceScore: 4.7, securityStatus: "clean",
    tags: [TAGS[0]!, TAGS[7]!], createdBy: "demo-user-001",
  }),
  makeItem({
    id: "item-command-4", slug: "env-setup", name: "Environment Setup", itemType: "command",
    description: "Automated development environment setup with dependency management",
    descriptions: { en: "Automated development environment setup with dependency management", zh: "自动开发环境设置和依赖管理" },
    category: "devops", installCount: 1890, favoriteCount: 267, previewCount: 5200,
    experienceScore: 4.1, securityStatus: "clean",
    tags: [TAGS[4]!, TAGS[0]!], createdBy: "user-004",
  }),

  // --- MCP Servers (3) ---
  makeItem({
    id: "item-mcp-1", slug: "filesystem-mcp", name: "Filesystem MCP", itemType: "mcp",
    description: "MCP server for advanced filesystem operations with pattern matching",
    descriptions: { en: "MCP server for advanced filesystem operations with pattern matching", zh: "用于高级文件系统操作和模式匹配的 MCP 服务器" },
    category: "productivity", installCount: 2678, favoriteCount: 412, previewCount: 7300,
    experienceScore: 4.5, securityStatus: "clean",
    tags: [TAGS[0]!, TAGS[7]!], createdBy: "user-002",
  }),
  makeItem({
    id: "item-mcp-2", slug: "database-mcp", name: "Database MCP", itemType: "mcp",
    description: "MCP server for database operations supporting PostgreSQL, MySQL, and SQLite",
    descriptions: { en: "MCP server for database operations supporting PostgreSQL, MySQL, and SQLite", zh: "支持 PostgreSQL、MySQL 和 SQLite 的数据库操作 MCP 服务器" },
    category: "data-analysis", installCount: 3456, favoriteCount: 523, previewCount: 9100,
    experienceScore: 4.6, securityStatus: "medium",
    tags: [TAGS[9]!, TAGS[5]!], createdBy: "user-003",
  }),
  makeItem({
    id: "item-mcp-3", slug: "github-mcp", name: "GitHub MCP", itemType: "mcp",
    description: "MCP server for GitHub API integration with PR management and issue tracking",
    descriptions: { en: "MCP server for GitHub API integration with PR management and issue tracking", zh: "GitHub API 集成的 MCP 服务器，支持 PR 管理和 Issue 跟踪" },
    category: "devops", installCount: 4012, favoriteCount: 612, previewCount: 10800,
    favorited: true, experienceScore: 4.8, securityStatus: "clean",
    tags: [TAGS[4]!, TAGS[7]!], createdBy: "demo-user-001",
  }),

  // --- Plugins (3) ---
  makeItem({
    id: "item-plugin-1", slug: "theme-engine", name: "Theme Engine", itemType: "plugin",
    description: "Advanced theming plugin with dark mode, custom palettes, and CSS variable management",
    descriptions: { en: "Advanced theming plugin with dark mode, custom palettes, and CSS variable management", zh: "高级主题插件，支持深色模式、自定义调色板和 CSS 变量管理" },
    category: "productivity", installCount: 2890, favoriteCount: 445, previewCount: 7800,
    experienceScore: 4.4, securityStatus: "clean",
    tags: [TAGS[8]!, TAGS[0]!], createdBy: "user-004",
  }),
  makeItem({
    id: "item-plugin-2", slug: "i18n-toolkit", name: "i18n Toolkit", itemType: "plugin",
    description: "Internationalization toolkit with auto-detection, plural rules, and RTL support",
    descriptions: { en: "Internationalization toolkit with auto-detection, plural rules, and RTL support", zh: "国际化工具包，支持自动检测、复数规则和 RTL" },
    category: "code-generation", installCount: 1987, favoriteCount: 312, previewCount: 5600,
    experienceScore: 4.3, securityStatus: "clean",
    tags: [TAGS[8]!, TAGS[3]!], createdBy: "user-005",
  }),
  makeItem({
    id: "item-plugin-3", slug: "security-scanner", name: "Security Scanner", itemType: "plugin",
    description: "Comprehensive security scanner plugin for vulnerability detection and remediation",
    descriptions: { en: "Comprehensive security scanner plugin for vulnerability detection and remediation", zh: "全面的安全扫描插件，用于漏洞检测和修复" },
    category: "security", installCount: 3234, favoriteCount: 498, previewCount: 8900,
    experienceScore: 4.7, securityStatus: "clean",
    tags: [TAGS[5]!, TAGS[6]!], createdBy: "user-002",
  }),
]

// ---------------------------------------------------------------------------
// Mock registries
// ---------------------------------------------------------------------------
export const MOCK_REGISTRIES: CapabilityRegistry[] = [
  {
    id: "reg-public", name: "public", description: "Public skill registry",
    sourceType: "internal", externalUrl: "https://github.com/opencode-ai/skills", externalBranch: "main",
    syncEnabled: true, syncInterval: 3600, lastSyncedAt: new Date(Date.now() - 3600000).toISOString(),
    lastSyncSha: "abc123def456", syncStatus: "success", visibility: "public",
    repoId: "repo-public", ownerId: "system",
    createdAt: "2025-01-01T00:00:00Z", updatedAt: new Date().toISOString(),
  },
]

// ---------------------------------------------------------------------------
// Mock repositories
// ---------------------------------------------------------------------------
export const MOCK_REPOSITORIES: Repository[] = [
  {
    id: "repo-public", name: "public", displayName: "Public Registry",
    description: "Default public skill registry", visibility: "public",
    repoType: "normal", ownerId: "system",
    createdAt: "2025-01-01T00:00:00Z", updatedAt: "2025-01-01T00:00:00Z",
  },
  {
    id: "repo-demo", name: "demo-team-skills", displayName: "Demo Team Skills",
    description: "Our team's shared skills and configurations", visibility: "private",
    repoType: "normal", ownerId: "demo-user-001",
    createdAt: "2025-02-15T00:00:00Z", updatedAt: "2025-03-01T00:00:00Z",
  },
]

// ---------------------------------------------------------------------------
// Helper: filter items by query parameters
// ---------------------------------------------------------------------------
export function filterMockItems(params: {
  type?: string
  search?: string
  category?: string
  categories?: string[]
  source?: string[]
  tags?: string[]
  securityStatuses?: string[]
  registryId?: string
  page?: number
  pageSize?: number
  status?: string
  sortBy?: string
  sortOrder?: string
  favorited?: boolean
  paginated?: boolean
}): { items: CapabilityItem[]; total: number; hasMore: boolean } {
  let items = [...MOCK_ITEMS]

  // Filter by type
  if (params.type && params.type !== "all") {
    items = items.filter((item) => item.itemType === params.type)
  }

  // Filter by search
  if (params.search) {
    const q = params.search.toLowerCase()
    items = items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.slug.toLowerCase().includes(q),
    )
  }

  // Filter by category
  if (params.category) {
    items = items.filter((item) => item.category === params.category)
  }
  if (params.categories?.length) {
    items = items.filter((item) => params.categories!.includes(item.category))
  }

  // Filter by source
  if (params.source?.length) {
    items = items.filter((item) => item.source && params.source!.includes(item.source))
  }

  // Filter by tags
  if (params.tags?.length) {
    items = items.filter((item) =>
      item.tags?.some((tag) => params.tags!.includes(tag.slug)),
    )
  }

  // Filter by security status
  if (params.securityStatuses?.length) {
    items = items.filter((item) => item.securityStatus && params.securityStatuses!.includes(item.securityStatus))
  }

  // Filter by favorited
  if (params.favorited) {
    items = items.filter((item) => item.favorited)
  }

  // Sort
  const sortBy = params.sortBy || "favoriteCount"
  const sortOrder = params.sortOrder || "desc"
  items.sort((a, b) => {
    const aVal = (a as unknown as Record<string, unknown>)[sortBy] as number ?? 0
    const bVal = (b as unknown as Record<string, unknown>)[sortBy] as number ?? 0
    return sortOrder === "asc" ? aVal - bVal : bVal - aVal
  })

  const total = items.length
  const page = params.page || 1
  const pageSize = params.pageSize || 20
  const start = (page - 1) * pageSize
  const paged = items.slice(start, start + pageSize)

  return { items: paged, total, hasMore: start + pageSize < total }
}

// ---------------------------------------------------------------------------
// Helper: get mock item by ID
// ---------------------------------------------------------------------------
export function getMockItemById(id: string): CapabilityItem | undefined {
  return MOCK_ITEMS.find((item) => item.id === id)
}

// ---------------------------------------------------------------------------
// Helper: get user info
// ---------------------------------------------------------------------------
export function getMockUserInfo(id: string): UserBasicInfo {
  return MOCK_USERS[id] ?? { id, name: id, avatarUrl: "" }
}

export function getMockUserNames(ids: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (const id of ids) {
    result[id] = getMockUserInfo(id).name
  }
  return result
}

export function getMockSearchedUsers(q: string): SearchedUser[] {
  const query = q.toLowerCase()
  return Object.values(MOCK_USERS)
    .filter((u) => u.name.toLowerCase().includes(query))
    .map((u) => ({
      email: `${u.name.toLowerCase().replace(" ", ".")}@example.com`,
      id: u.id,
      name: u.name,
      owner: "demo-org",
      picture: u.avatarUrl ?? "",
      preferred_username: u.name.toLowerCase().replace(" ", "_"),
      sub: u.id,
    }))
}

// ---------------------------------------------------------------------------
// Mock versions for an item
// ---------------------------------------------------------------------------
export function getMockVersions(itemId: string): CapabilityVersion[] {
  const item = getMockItemById(itemId)
  if (!item) return []
  return [
    {
      id: `${itemId}-v3`, itemId, revision: 3, version: item.version,
      description: item.description, category: item.category, content: item.content,
      commitMsg: "Update with improved features", createdBy: item.createdBy,
      createdAt: item.updatedAt,
    },
    {
      id: `${itemId}-v2`, itemId, revision: 2, version: "0.9.0",
      description: item.description, category: item.category,
      commitMsg: "Fix edge cases and improve error handling", createdBy: item.createdBy,
      createdAt: new Date(new Date(item.updatedAt).getTime() - 7 * 86400000).toISOString(),
    },
    {
      id: `${itemId}-v1`, itemId, revision: 1, version: "0.8.0",
      description: "Initial release", category: item.category,
      commitMsg: "Initial release", createdBy: item.createdBy,
      createdAt: item.createdAt,
    },
  ]
}

// ---------------------------------------------------------------------------
// Mock scan results
// ---------------------------------------------------------------------------
export function getMockScanResults(itemId: string): ScanResult[] {
  return [
    {
      id: `scan-${itemId}-1`, itemId, itemRevision: 3,
      riskLevel: "low", verdict: "pass", summary: "No critical issues found. Minor recommendations for improvement.",
      scanModel: "claude-sonnet-4-20250514", triggerType: "auto", durationMs: 4500,
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      finishedAt: new Date(Date.now() - 86400000 + 4500).toISOString(),
      permissions: { filesystem: "read", network: "none" },
      recommendations: [{ type: "info", message: "Consider adding input validation" }],
      redFlags: [],
    },
  ]
}

// ---------------------------------------------------------------------------
// Mock distributions (for manager page)
// ---------------------------------------------------------------------------
export function getMockDistributions(): DistributionResult["distribution"][] {
  const item = MOCK_ITEMS[0]!
  return [
    {
      id: "dist-1", itemId: item.id, distributorId: "demo-user-001",
      permissionMode: "readonly", status: "active", scopeType: "user",
      targetId: "user-003", message: "Check out this great skill!",
      createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      item,
    },
  ]
}

export function getMockReceipts() {
  const item = MOCK_ITEMS[2]!
  return [
    {
      id: "receipt-1", distributionId: "dist-r1", userId: "demo-user-001",
      receiptStatus: "accepted",
      distribution: {
        id: "dist-r1", itemId: item.id, distributorId: "user-002",
        permissionMode: "readonly", status: "active", scopeType: "user",
        targetId: "demo-user-001", message: "Sharing this useful skill with you",
        createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
        item,
      },
    },
  ]
}

// ---------------------------------------------------------------------------
// Mock tags response
// ---------------------------------------------------------------------------
export function getMockTags(params?: { query?: string; page?: number; pageSize?: number; tagClass?: string }) {
  let tags = [...TAGS]
  if (params?.query) {
    const q = params.query.toLowerCase()
    tags = tags.filter((t) => t.slug.includes(q))
  }
  if (params?.tagClass) {
    tags = tags.filter((t) => t.tagClass === params.tagClass)
  }
  const page = params?.page || 1
  const pageSize = params?.pageSize || 50
  const start = (page - 1) * pageSize
  return {
    tags: tags.slice(start, start + pageSize),
    total: tags.length,
    page,
    pageSize,
    hasMore: start + pageSize < tags.length,
  }
}
