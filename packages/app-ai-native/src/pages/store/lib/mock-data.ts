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
  DistributionReceipt,
  ResourcePermission,
  PermissionGrant,
  AdminUser,
  AdminUserProfile,
  AdminOrganization,
  AdminDept,
  AdminDeptMember,
  SystemNotificationChannel,
  AdminAuditLog,
  AdminItem,
  AdminEnterpriseCustomer,
  EnterpriseMember,
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
// Display names mirror the admin-users seed (Chinese) so demo authorship labels
// and role-grant search resolve consistently.
const MOCK_USERS: Record<string, UserBasicInfo> = {
  "demo-user-001": { id: "demo-user-001", name: "Demo User", avatarUrl: "" },
  "user-002": { id: "user-002", name: "陈爱丽", avatarUrl: "" },
  "user-003": { id: "user-003", name: "张博文", avatarUrl: "" },
  "user-004": { id: "user-004", name: "李卡罗", avatarUrl: "" },
  "user-005": { id: "user-005", name: "王大伟", avatarUrl: "" },
  "user-006": { id: "user-006", name: "赵艾玛", avatarUrl: "" },
  "user-007": { id: "user-007", name: "孙弗兰克", avatarUrl: "" },
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
  const query = q.trim().toLowerCase()
  if (!query) return []
  // Source from the richer admin-users seed so demo search mirrors the backend
  // (which matches username / display_name / email) and resolves Chinese names.
  return seedAdminUsers()
    .filter((u) => {
      const haystack = [u.displayName, u.username, u.email, u.subject_id].filter(Boolean).join(" ").toLowerCase()
      return haystack.includes(query)
    })
    .map((u) => ({
      id: u.subject_id,
      name: u.displayName || u.username,
      avatarUrl: u.avatarUrl || undefined,
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
  const freshItem = MOCK_ITEMS[0]!
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
    {
      id: "receipt-2", distributionId: "dist-r2", userId: "demo-user-001",
      receiptStatus: "unread",
      distribution: {
        id: "dist-r2", itemId: freshItem.id, distributorId: "user-003",
        permissionMode: "readonly", status: "active", scopeType: "user",
        targetId: "demo-user-001", message: "刚推送给你一个新技能",
        createdAt: new Date(Date.now() - 2 * 60000).toISOString(),
        item: freshItem,
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

// ===========================================================================
// Admin console seed data (M1 members / M2 permissions / M3 distributions /
// M5 ops). Consumed by the in-memory stores in mock-api.ts so demo mode renders
// real-looking data and write operations actually mutate state.
// ===========================================================================

const daysAgoIso = (d: number) => new Date(Date.now() - d * 86400000).toISOString()

// ---------------------------------------------------------------------------
// M3 · Distributions (global admin view)
// ---------------------------------------------------------------------------
export function seedAdminDistributions(): (DistributionResult["distribution"] & { status: string })[] {
  const pick = (i: number) => MOCK_ITEMS[i]!
  return [
    {
      id: "adist-1", itemId: pick(0).id, distributorId: "demo-user-001",
      permissionMode: "readonly", status: "active", scopeType: "user",
      targetId: "user-003", message: "团队代码审查规范，请大家采用",
      createdAt: daysAgoIso(1), item: pick(0),
    },
    {
      id: "adist-2", itemId: pick(1).id, distributorId: "demo-user-001",
      permissionMode: "dismissible", status: "active", scopeType: "organization",
      targetId: "研发一部", message: "测试用例自动生成器，提升覆盖率",
      createdAt: daysAgoIso(3), item: pick(1),
    },
    {
      id: "adist-3", itemId: pick(6).id, distributorId: "user-002",
      permissionMode: "readonly", status: "paused", scopeType: "user",
      targetId: "user-004", message: "PR 自动审查代理（暂停灰度中）",
      createdAt: daysAgoIso(6), item: pick(6),
    },
    {
      id: "adist-4", itemId: pick(3).id, distributorId: "demo-user-001",
      permissionMode: "dismissible", status: "revoked", scopeType: "organization",
      targetId: "平台架构组", message: "文档生成器（已收回，等待新版本）",
      createdAt: daysAgoIso(12), item: pick(3),
    },
    {
      id: "adist-5", itemId: pick(5).id, distributorId: "user-003",
      permissionMode: "readonly", status: "active", scopeType: "user",
      targetId: "user-005", message: "SQL 优化助手，慢查询必备",
      createdAt: daysAgoIso(2), item: pick(5),
    },
  ]
}

// Per-distribution receipts (keyed by distribution id) for the detail drawer.
export function seedAdminReceipts(): Record<string, DistributionReceipt[]> {
  return {
    "adist-1": [
      { id: "arc-1", distributionId: "adist-1", userId: "user-003", receiptStatus: "accepted", forkedItemId: "fork-001", createdAt: daysAgoIso(1) },
      { id: "arc-2", distributionId: "adist-1", userId: "user-004", receiptStatus: "read", createdAt: daysAgoIso(1) },
      { id: "arc-3", distributionId: "adist-1", userId: "user-005", receiptStatus: "unread", createdAt: daysAgoIso(1) },
    ],
    "adist-2": [
      { id: "arc-4", distributionId: "adist-2", userId: "user-002", receiptStatus: "accepted", createdAt: daysAgoIso(3) },
      { id: "arc-5", distributionId: "adist-2", userId: "user-004", receiptStatus: "dismissed", createdAt: daysAgoIso(2) },
    ],
    "adist-3": [
      { id: "arc-6", distributionId: "adist-3", userId: "user-004", receiptStatus: "read", createdAt: daysAgoIso(6) },
    ],
    "adist-5": [
      { id: "arc-7", distributionId: "adist-5", userId: "user-005", receiptStatus: "unread", createdAt: daysAgoIso(2) },
    ],
  }
}

// ---------------------------------------------------------------------------
// M2 · Resource permission matrix + per-user system roles
// ---------------------------------------------------------------------------
export function seedResourcePermissions(): ResourcePermission[] {
  return [
    { id: "rp-1", resourceCode: "repositories", resourceType: "menu", allowedRoles: [] },
    { id: "rp-2", resourceCode: "projects", resourceType: "menu", allowedRoles: [] },
    { id: "rp-3", resourceCode: "capabilities", resourceType: "menu", allowedRoles: ["platform_admin"] },
    { id: "rp-4", resourceCode: "devices", resourceType: "menu", allowedRoles: [] },
    { id: "rp-5", resourceCode: "notifications", resourceType: "menu", allowedRoles: ["platform_admin"] },
    { id: "rp-6", resourceCode: "kanban", resourceType: "menu", allowedRoles: ["business_admin", "platform_admin"] },
    { id: "rp-7", resourceCode: "admin", resourceType: "menu", allowedRoles: ["platform_admin"] },
    { id: "rp-8", resourceCode: "admin.system-roles", resourceType: "api", allowedRoles: ["platform_admin"] },
    { id: "rp-9", resourceCode: "admin.notification-channels", resourceType: "api", allowedRoles: ["platform_admin"] },
    { id: "rp-10", resourceCode: "api.kanban.overview", resourceType: "api", allowedRoles: ["business_admin", "platform_admin"] },
  ]
}

// Per-user system role grants, keyed by subject id.
export function seedUserSystemRoles(): Record<string, string[]> {
  return {
    "demo-user-001": ["platform_admin"],
    "user-002": ["business_admin"],
    "user-003": [],
    "user-004": [],
    "user-005": ["business_admin"],
  }
}

// Fine-grained permission grants (mentor RBAC Phase 2). Seeds the canonical
// mentor examples so the admin "department/fine-grained grant" tab is populated
// in demo mode:
//   - kanban/admin  → user 邓彬 (subject_id user-009)
//   - kanban/reader → department Costrict研发部 (dept_id 6560, the materialized
//     dept_path lets descendants like 开发组 inherit it)
export function seedPermissionGrants(): PermissionGrant[] {
  const COS = "/深信服科技股份有限公司/研发体系/Costrict研发部"
  return [
    {
      id: "pg-1", permissionCode: "kanban/admin", subjectType: "user",
      subjectId: "user-009", deptPath: "", grantedBy: "demo-user-001", createdAt: daysAgoIso(2),
    },
    {
      id: "pg-2", permissionCode: "kanban/reader", subjectType: "department",
      subjectId: "6560", deptPath: COS, grantedBy: "demo-user-001", createdAt: daysAgoIso(2),
    },
  ]
}

// ---------------------------------------------------------------------------
// M1 · Members + organizations
// ---------------------------------------------------------------------------
export function seedAdminUsers(): AdminUser[] {
  // universalId = Casdoor 锚定标识；user-007 故意留空以验证「无 universal_id 不可绑定」分支。
  return [
    {
      subject_id: "demo-user-001", universalId: "uni-demo-001", username: "demo_user", displayName: "Demo User",
      email: "demo@example.com", avatarUrl: "", organization: "研发一部",
      status: "active", roles: ["platform_admin"], lastLoginAt: daysAgoIso(0), createdAt: daysAgoIso(420),
    },
    {
      subject_id: "user-002", universalId: "uni-002", username: "alice.chen", displayName: "陈爱丽",
      email: "alice.chen@example.com", avatarUrl: "", organization: "研发一部",
      status: "active", roles: ["business_admin"], lastLoginAt: daysAgoIso(1), createdAt: daysAgoIso(310),
    },
    {
      subject_id: "user-003", universalId: "uni-003", username: "bob.zhang", displayName: "张博文",
      email: "bob.zhang@example.com", avatarUrl: "", organization: "研发二部",
      status: "active", roles: [], lastLoginAt: daysAgoIso(2), createdAt: daysAgoIso(260),
    },
    {
      subject_id: "user-004", universalId: "uni-004", username: "carol.li", displayName: "李卡罗",
      email: "carol.li@example.com", avatarUrl: "", organization: "平台架构组",
      status: "disabled", roles: [], lastLoginAt: daysAgoIso(45), createdAt: daysAgoIso(190),
    },
    {
      subject_id: "user-005", universalId: "uni-005", username: "david.wang", displayName: "王大伟",
      email: "david.wang@example.com", avatarUrl: "", organization: "研发二部",
      status: "active", roles: ["business_admin"], lastLoginAt: daysAgoIso(0), createdAt: daysAgoIso(150),
    },
    {
      subject_id: "user-006", universalId: "uni-006", username: "emma.zhao", displayName: "赵艾玛",
      email: "emma.zhao@example.com", avatarUrl: "", organization: "平台架构组",
      status: "banned", roles: [], lastLoginAt: daysAgoIso(90), createdAt: daysAgoIso(120),
    },
    {
      subject_id: "user-007", universalId: "", username: "frank.sun", displayName: "孙弗兰克",
      email: "frank.sun@example.com", avatarUrl: "", organization: "研发一部",
      status: "active", roles: [], lastLoginAt: daysAgoIso(5), createdAt: daysAgoIso(80),
    },
  ]
}

const ADMIN_USER_PROFILES: Record<string, AdminUserProfile> = {
  "demo-user-001": { createdItemCount: 8, distributedCount: 12, receivedCount: 3 },
  "user-002": { createdItemCount: 5, distributedCount: 2, receivedCount: 6 },
  "user-003": { createdItemCount: 3, distributedCount: 0, receivedCount: 9 },
  "user-004": { createdItemCount: 1, distributedCount: 0, receivedCount: 2 },
  "user-005": { createdItemCount: 4, distributedCount: 1, receivedCount: 4 },
  "user-006": { createdItemCount: 0, distributedCount: 0, receivedCount: 1 },
  "user-007": { createdItemCount: 2, distributedCount: 0, receivedCount: 3 },
}

export function getMockAdminUserProfile(id: string): AdminUserProfile {
  return ADMIN_USER_PROFILES[id] ?? { createdItemCount: 0, distributedCount: 0, receivedCount: 0 }
}

export function getMockAdminOrganizations(users: AdminUser[]): AdminOrganization[] {
  const counts = new Map<string, number>()
  for (const u of users) {
    if (!u.organization) continue
    counts.set(u.organization, (counts.get(u.organization) ?? 0) + 1)
  }
  return [...counts.entries()].map(([organization, memberCount]) => ({ organization, memberCount }))
}

// ---------------------------------------------------------------------------
// M1 · Department tree (dept-sync demo) — mirrors the real 深信服 org sample from
// research/dept-sync.md so demo mode renders a believable nested tree without a
// live dept-sync service.
// ---------------------------------------------------------------------------
const dept = (
  deptId: string,
  deptName: string,
  deptPath: string,
  parentDeptId: string,
  deptLevel: number,
  children: AdminDept[] = [],
): AdminDept => ({
  deptId,
  deptName,
  deptPath,
  parentDeptId,
  deptLevel,
  childDeptCount: children.length,
  leaderId: "",
  orderNum: 0,
  children: children.length ? children : undefined,
})

export function seedAdminDeptTree(): AdminDept[] {
  const SF = "/深信服科技股份有限公司"
  const RD = `${SF}/研发体系`
  const ET = `${RD}/工程技术部`
  const UEDC = `${ET}/用户体验驱动中心`
  const AI = `${ET}/AI效能部`
  const COS = `${RD}/Costrict研发部`
  return [
    dept("49", "深信服科技股份有限公司", SF, "", 1, [
      dept("1416", "研发体系", RD, "49", 2, [
        dept("3099", "工程技术部", ET, "1416", 3, [
          dept("1492", "用户体验驱动中心", UEDC, "3099", 4, [
            dept("2681", "UEDC-大安全分部", `${UEDC}/UEDC-大安全分部`, "1492", 5),
          ]),
          dept("5889", "AI效能部", AI, "3099", 4, [
            dept("6652", "AI Native组", `${AI}/AI Native组`, "5889", 5),
          ]),
        ]),
        dept("6560", "Costrict研发部", COS, "1416", 3, [
          dept("6571", "开发组", `${COS}/开发组`, "6560", 4),
          dept("6572", "客户成功组", `${COS}/客户成功组`, "6560", 4),
        ]),
      ]),
    ]),
  ]
}

// Department members keyed by dept_id. Members link back to local users (the
// adminUsers seed) by universal id where applicable; unregistered dept-sync
// users carry linked=null so the UI can mark them "not registered".
const linkMember = (
  userId: string,
  username: string,
  universalId: string,
  position: string,
  isMain: boolean,
  local?: AdminUser,
): AdminDeptMember => ({
  userId,
  username,
  universalId,
  isMain,
  position,
  registered: !!local,
  linked: local
    ? {
        subjectId: local.subject_id,
        displayName: local.displayName,
        email: local.email,
        avatarUrl: local.avatarUrl,
        organization: local.organization,
        status: local.status,
        roles: [...local.roles],
      }
    : null,
})

export function getMockAdminDeptMembers(deptId: string, users: AdminUser[]): AdminDeptMember[] {
  const byId = (id: string) => users.find((u) => u.subject_id === id)
  switch (deptId) {
    case "6560": // Costrict研发部
      return [linkMember("u-wtd", "韦体东", "demo-user-001", "研发主管", true, byId("demo-user-001"))]
    case "6571": // 开发组
      return [
        linkMember("u-zhj", "朱海俊", "user-002", "实习生", true, byId("user-002")),
        linkMember("u-yhf", "杨航锋", "user-003", "开发工程师", true, byId("user-003")),
        linkMember("u-xlm", "谢黎明", "uid-xlm", "开发工程师", true),
        linkMember("u-yqz", "鄢桥志", "uid-yqz", "开发工程师", true),
        linkMember("u-cx", "陈烜", "user-007", "开发工程师", true, byId("user-007")),
      ]
    case "6572": // 客户成功组
      return [linkMember("u-cs1", "李成功", "user-005", "客户成功经理", true, byId("user-005"))]
    case "6652": // AI Native组
      return [linkMember("u-zk", "周凯", "uid-zk", "TMO", true)]
    case "2681": // UEDC-大安全分部
      return [linkMember("u-ux1", "赵安全", "user-004", "体验设计师", true, byId("user-004"))]
    default:
      return []
  }
}

// ---------------------------------------------------------------------------
// M5 · Ops: notification channels / settings / audit logs
// ---------------------------------------------------------------------------
export function seedSystemNotificationChannels(): SystemNotificationChannel[] {
  return [
    {
      id: "snc-1", type: "wecom", name: "企业微信 · 全员群", workspaceId: "ws-default",
      enabled: true, systemConfig: { webhookUrl: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=demo" },
      createdBy: "demo-user-001", createdAt: daysAgoIso(60), updatedAt: daysAgoIso(4),
    },
    {
      id: "snc-2", type: "webhook", name: "运维告警 Webhook", workspaceId: "ws-default",
      enabled: false, systemConfig: { url: "https://hooks.example.com/admin-alerts", secret: "demo-secret" },
      createdBy: "demo-user-001", createdAt: daysAgoIso(30), updatedAt: daysAgoIso(30),
    },
  ]
}

export function seedSystemSettings(): Record<string, unknown> {
  return {
    maintenance_mode: false,
    announcement_enabled: true,
  }
}

export function seedAuditLogs(): AdminAuditLog[] {
  return [
    { id: "al-1", actorId: "demo-user-001", action: "enterprise.create", targetType: "enterprise_customer", targetId: "ent-招商银行", payload: { name: "招商银行", ids: 3 }, createdAt: daysAgoIso(0) },
    { id: "al-2", actorId: "demo-user-001", action: "system_role.grant", targetType: "user", targetId: "user-002", payload: { role: "business_admin" }, createdAt: daysAgoIso(1) },
    { id: "al-3", actorId: "user-005", action: "distribution.create", targetType: "distribution", targetId: "adist-5", payload: { item: "SQL Optimizer", recipients: 1 }, createdAt: daysAgoIso(2) },
    { id: "al-4", actorId: "demo-user-001", action: "resource_permission.update", targetType: "resource_permission", targetId: "kanban", payload: { allowedRoles: ["business_admin", "platform_admin"] }, createdAt: daysAgoIso(3) },
    { id: "al-5", actorId: "demo-user-001", action: "setting.update", targetType: "setting", targetId: "announcement_enabled", payload: { value: true }, createdAt: daysAgoIso(4) },
    { id: "al-6", actorId: "demo-user-001", action: "notification_channel.update", targetType: "notification_channel", targetId: "snc-1", payload: { enabled: true }, createdAt: daysAgoIso(5) },
    { id: "al-7", actorId: "demo-user-001", action: "announcement.send", targetType: "announcement", targetId: "broadcast", payload: { scope: "all", sentCount: 128 }, createdAt: daysAgoIso(6) },
    { id: "al-8", actorId: "user-002", action: "distribution.revoke", targetType: "distribution", targetId: "adist-4", payload: { reason: "等待新版本" }, createdAt: daysAgoIso(12) },
  ]
}

// ---------------------------------------------------------------------------
// M6 · Content management: cross-registry capability items
// ---------------------------------------------------------------------------
export function seedAdminItems(): AdminItem[] {
  return [
    {
      id: "aitem-1", name: "Code Reviewer", itemType: "skill", status: "active",
      securityStatus: "clean", experienceScore: 4.8, createdBy: "user-002",
      registryId: "reg-public", repoName: "公共商店", updatedAt: daysAgoIso(1), createdAt: daysAgoIso(180),
    },
    {
      id: "aitem-2", name: "SQL Optimizer", itemType: "skill", status: "active",
      securityStatus: "low", experienceScore: 4.2, createdBy: "user-003",
      registryId: "reg-public", repoName: "公共商店", updatedAt: daysAgoIso(2), createdAt: daysAgoIso(150),
    },
    {
      id: "aitem-3", name: "Deployment Agent", itemType: "subagent", status: "active",
      securityStatus: "medium", experienceScore: 3.9, createdBy: "user-004",
      registryId: "reg-public", repoName: "公共商店", updatedAt: daysAgoIso(3), createdAt: daysAgoIso(120),
    },
    {
      id: "aitem-4", name: "Shell Runner", itemType: "command", status: "active",
      securityStatus: "high", experienceScore: 2.6, createdBy: "user-005",
      registryId: "reg-team", repoName: "研发一部", updatedAt: daysAgoIso(4), createdAt: daysAgoIso(90),
    },
    {
      id: "aitem-5", name: "Crypto Miner Helper", itemType: "plugin", status: "archived",
      securityStatus: "extreme", experienceScore: 1.1, createdBy: "user-006",
      registryId: "reg-team", repoName: "研发一部", updatedAt: daysAgoIso(8), createdAt: daysAgoIso(70),
    },
    {
      id: "aitem-6", name: "Filesystem MCP", itemType: "mcp", status: "active",
      securityStatus: "clean", experienceScore: 4.5, createdBy: "demo-user-001",
      registryId: "reg-public", repoName: "公共商店", updatedAt: daysAgoIso(5), createdAt: daysAgoIso(60),
    },
    {
      id: "aitem-7", name: "Legacy Doc Writer", itemType: "skill", status: "archived",
      securityStatus: "unscanned", experienceScore: 0, createdBy: "user-007",
      registryId: "reg-public", repoName: "公共商店", updatedAt: daysAgoIso(40), createdAt: daysAgoIso(220),
    },
    {
      id: "aitem-8", name: "API Designer", itemType: "skill", status: "active",
      securityStatus: "clean", experienceScore: 4.6, createdBy: "demo-user-001",
      registryId: "reg-public", repoName: "公共商店", updatedAt: daysAgoIso(6), createdAt: daysAgoIso(45),
    },
  ]
}

// Coarse security-risk groups understood by the demo content list filter,
// mirroring the backend securityStatusGroups expansion.
export const ADMIN_ITEM_SECURITY_GROUPS: Record<string, string[]> = {
  unknown: ["unscanned", "pending", "scanning", "error", "skipped"],
  low: ["clean", "low"],
  medium: ["medium"],
  high: ["high", "extreme"],
}

// ---------------------------------------------------------------------------
// M4 · Enterprise customers (大客户) — demo seed + admin-shape resolver.
// The demo store keeps customers anchored on universal_id (matching the real
// backend); resolveAdminEnterprise() enriches each universal_id into a member
// row by looking it up in the seeded admin user roster. A universal_id with no
// local user yields subjectId="" so the UI can mark it "not registered".
// ---------------------------------------------------------------------------

// 1×1 transparent PNG data URI — a valid image/png logo for demo seeds.
const DEMO_LOGO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

export type DemoEnterpriseCustomer = { id: string; name: string; logo: string; ids: string[] }

export function seedEnterpriseCustomers(): DemoEnterpriseCustomer[] {
  return [
    { id: "ent-001", name: "招商银行", logo: DEMO_LOGO, ids: ["uni-002", "uni-003"] },
    // Bound to uni-006 (a local user) + uni-unknown-001 (not yet a local user → unregistered).
    { id: "ent-002", name: "工商银行", logo: DEMO_LOGO, ids: ["uni-006", "uni-unknown-001"] },
  ]
}

// Resolve a universal_id list into the admin-shape member roster (one entry per id,
// order-stable), enriching from the seeded admin user roster when possible.
export function resolveEnterpriseMembers(universalIds: string[]): EnterpriseMember[] {
  // Skip users whose universalId is empty (e.g. frank.sun) when building the lookup map, and
  // never look up an empty-string uid below — otherwise an empty input id would collide with the
  // empty-string key and wrongly enrich that slot. Mirrors the real backend ResolveMembersBatch,
  // which drops empty universal_ids and leaves unresolved members with an empty subjectId.
  const byUniversal = new Map(seedAdminUsers().filter((u) => u.universalId).map((u) => [u.universalId, u]))
  return universalIds.map((uid) => {
    const u = uid ? byUniversal.get(uid) : undefined
    return {
      universalId: uid,
      subjectId: u?.subject_id ?? "",
      username: u?.username ?? "",
      displayName: u?.displayName ?? "",
      avatarUrl: u?.avatarUrl ?? "",
    }
  })
}

export function toAdminEnterprise(c: DemoEnterpriseCustomer): AdminEnterpriseCustomer {
  return {
    id: c.id,
    name: c.name,
    logo: c.logo,
    universalIds: [...c.ids],
    members: resolveEnterpriseMembers(c.ids),
  }
}
