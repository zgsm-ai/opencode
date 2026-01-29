# CoStrict 品牌替换脚本

本项目fork自opencode。根据开源项目品牌替换、二次开发最佳实践，本目录下的脚本的目的：1、替换opencode相关品牌名（尤其是对外、对用户的，比如提示、logo、软件名等）为CoStrict/costrict。2、持续同步上游opencode 代码到本项目，最小化冲突。

---

## 原则

维持 "内 opencode,外 costrict" 混合架构:

保留: 内部包名 @opencode-ai/*、目录名 packages/opencode、相关品牌常量维护在config.ts，便于修改维护。
替换: 用户可见内容、CLI 命令、配置文件、用户数据目录路径
理由: 最小化与上游合并冲突,同时完成外部品牌统一


## 🚀 快速开始

### 首次初始化

```bash
# 1. 运行品牌应用脚本（自动完成所有可自动化的部分）
bun run script/costrict/replace-brand.ts

# 2. 手动修改 manual-checklist.md 中的部分

# 3. 验证品牌一致性
bun run script/costrict/verify-brand.ts

# 4. 类型检查
bun run typecheck

# 5. 提交修改
git add .
git commit -m "chore: initial branding setup"
```

---

## 📋 脚本说明

### 1. replace-brand.ts - 品牌应用脚本（主脚本）

**功能**：一键完成所有品牌替换（幂等操作，可重复运行）

**使用**：
```bash
# 预览模式
bun run script/costrict/replace-brand.ts --dry-run

# 实际执行
bun run script/costrict/replace-brand.ts
```

**自动处理内容**：

**Phase 0**: Package.json 仓库信息
- ✅ 更新所有 package.json 的 repository.url
- ✅ 保持内部包名 @opencode-ai/* 不变（避免破坏依赖）

**Phase 1**: 核心配置路径
- ✅ 应用名: `opencode` → `costrict`
- ✅ 配置文件: `opencode.json` → `costrict.json`
- ✅ 用户数据目录: `.opencode` → `.costrict`（路径检查和引用）
- ✅ CLI 入口文件自动重命名（首次运行时）

**Phase 2**: 环境变量
- ✅ `OPENCODE_*` → `COSTRICT_*`
- ✅ `__OPENCODE__` → `__COSTRICT__`

**Phase 3**: Rust 文件
- ✅ 桌面应用 Rust 代码中的环境变量替换

**Phase 4**: 域名替换
- ✅ `opencode.ai` → `costrict.ai`
- ✅ `api.opencode.ai` → `zgsm.sangfor.com`

**Phase 5**: 文档
- ✅ README 文件
- ✅ 文档站点 .mdx 文件

**Phase 6**: GitHub Actions 工作流
- ✅ 工作流文件中的环境变量

**Phase 7**: 构建和发布脚本
- ✅ CLI 构建脚本
- ✅ 发布相关脚本

**Phase 8**: Turborepo 和其他配置
- ✅ turbo.json
- ✅ sst.config.ts
- ✅ VS Code 扩展

**Phase 9**: 用户可见字符串
- ✅ Console、CLI、Server 等模块的用户界面文本
- ✅ 用户提示和帮助文本中的 `.opencode/` 路径引用
- ✅ Agent 配置中的 `.opencode/plan/` 权限路径
- ✅ Theme 配置中的目录搜索路径
- ✅ Installation、IDE、Skill 模块的路径检查
- ✅ Session HTTP 头 (User-Agent, originator)
- ✅ Codex Plugin HTTP 头
- ✅ 临时目录前缀 (tmpdir)
- ✅ Git 元数据路径 (.git/opencode → .git/costrict)
- ✅ CLI 入口点脚本名称和环境变量 (Phase 9.18)
- ✅ GitHub 自动化品牌 (Bot、Workflow、分支前缀等 8 处, Phase 9.19)
- ✅ Git Worktree 分支命名 (Phase 9.20)
- ✅ mDNS 服务名称和显示 (Phase 9.21)
- ✅ Worker 内部 URL (Phase 9.22)
- ✅ OAuth Provider 应用名称 (Phase 9.23)
- ✅ Clipboard 临时文件名 (Phase 9.24)
- ✅ CLI 命令描述文本 (Phase 9.25)
- ✅ Provider 请求头标识 (X-Title, X-Cerebras-3rd-Party-Integration, Phase 9.26)
- ✅ MCP 客户端/服务器配置 (Phase 9.27)
- ✅ Server 应用标题 (Phase 9.28)
- ✅ TUI 组件和对话框文本 (Phase 9.29)
- ✅ UI 主题和 Shiki 高亮器 (Phase 9.30)
- ✅ PWA Manifest 应用名称 (Phase 9.31)
- ✅ 邮件主题 (Console user.ts)
- ✅ UI 组件主题名和 Zen 提示 (pierre/index.ts, dialog-provider.tsx)
- ✅ ACP Agent 终端命令配置

**Phase 10**: Tauri 配置
- ✅ productName, identifier, mainBinaryName

**Phase 11**: Cargo 配置
- ✅ package name, lib name

**Phase 12**: Zed 扩展配置
- ✅ id, name, repository

**Phase 13**: Install 脚本
- ✅ 用户可见文本（Installer 名称、提示信息）
- ✅ 域名引用

**Phase 14**: AI 助手提示词
- ✅ 角色定义（You are OpenCode → You are CoStrict）
- ✅ 产品名提及
- ✅ GitHub 仓库和文档域名

**Phase 15**: ASCII Logo 替换
- ✅ CLI 用户界面中的 ASCII Logo
- ✅ 从 `opencode` 样式替换为 `COSTRICT` 样式

**Phase 16**: Console App 和 Enterprise 用户界面 (新增 2026-01-13)
- ✅ Console App 核心组件 (app.tsx, 404, temp, black 等)
- ✅ Console 下载页面安装命令 (npm, bun, AUR)
- ✅ Console 法律文档品牌名
- ✅ Console 主页和 Zen 页面
- ✅ Enterprise 分享页面元描述
- ✅ App 公共资源 localStorage 键名

**特性**：
- 失败时自动回滚
- 支持 dry-run 预览
- 跨平台兼容（Windows/Linux/macOS）

---

### 2. verify-brand.ts - 品牌验证脚本

**功能**：检测遗漏的品牌引用

**使用**：
```bash
# 全量检查
bun run script/costrict/verify-brand.ts

# 增量检查（推荐，速度快）
bun run script/costrict/verify-brand.ts --incremental

# 显示所有问题（不限制 10 条）
bun run script/costrict/verify-brand.ts --full
```

**检查项目**：
- ❌ 遗漏的 `opencode` 文本
- ❌ 遗漏的 `OPENCODE_` 环境变量
- ❌ 旧域名 `opencode.ai`
- ❌ 旧仓库 `anomalyco/opencode`
- ❌ 旧全局对象 `__OPENCODE__`

**白名单机制**：
- ✅ 自动排除内部包名 `@opencode-ai/*`
- ✅ 自动排除 monorepo 内部依赖 `"opencode": "workspace:*"`
- ✅ 自动排除内部主题标识符
- ✅ 自动排除 Vite 插件内部配置
- ✅ 自动排除品牌资产文件引用 (待重新设计) - **跨平台路径**
- ✅ 自动排除视频资产路径引用
- ✅ 支持 Windows 和 Linux 路径格式

---

## 🔄 日常维护流程

### 同步上游（手动 Git 操作）

```bash
# ========================================
# Step 1: 配置 upstream 远程仓库（首次）
# ========================================
git remote add upstream https://github.com/anomalyco/opencode.git
git fetch upstream

# ========================================
# Step 2: 同步 dev-sync 分支（纯上游镜像）
# ========================================

# 如果 dev-sync 不存在，从 upstream/dev 创建
git checkout -b dev-sync upstream/dev
git push -u origin dev-sync

# 如果 dev-sync 已存在，更新到最新
git checkout dev-sync
git fetch upstream
git merge --ff-only upstream/dev  # 快进合并（dev-sync 应该无本地提交）
git push origin dev-sync

# ========================================
# Step 3: 合并 dev-sync 到 dev
# ========================================
git checkout dev

# 尝试合并（可能有冲突）
git merge dev-sync --no-commit --no-ff

# 如果有冲突，查看冲突文件
git status
git diff --name-only --diff-filter=U

# ========================================
# Step 4: 处理冲突（如果有）
# ========================================

# 品牌文件：保持本地版本
git checkout --ours package.json
git checkout --ours README*.md
git checkout --ours LICENSE

# 代码文件：接受上游版本（稍后重新品牌化）
git checkout --theirs <code-file>

# 如果决定放弃合并
git merge --abort

# ========================================
# Step 5: 重新应用品牌
# ========================================
bun run script/costrict/replace-brand.ts

# ========================================
# Step 6: 验证品牌一致性
# ========================================
bun run script/costrict/verify-brand.ts --incremental

# ========================================
# Step 7: 完成合并并提交
# ========================================
git add .
git commit -m "chore: sync upstream $(date +%Y-%m-%d) and reapply branding"

# ========================================
# Step 8: 测试和推送
# ========================================
bun run typecheck
bun turbo build
git push origin dev
```

### 冲突处理策略

**品牌文件（保持本地版本）**：
- `package.json` - 包含自定义仓库和依赖
- `README*.md` - 品牌文档
- `LICENSE` - 法律声明
- `script/costrict/*` - 品牌脚本

**代码文件（使用上游版本 + 重新品牌化）**：
- `packages/**/src/**/*.{ts,tsx,rs}` - 源代码
- `packages/**/test/**/*` - 测试代码
- `.github/workflows/*` - CI/CD 工作流

**处理流程**：
```bash
# 1. 品牌文件用本地版本
git checkout --ours <brand-file>

# 2. 代码文件用上游版本
git checkout --theirs <code-file>

# 3. 重新应用品牌
bun run script/costrict/replace-brand.ts

# 4. 完成合并
git add .
git commit
```

---

## 📁 文件说明

- [replace-brand.ts](replace-brand.ts) - 品牌应用脚本（主脚本，Phase 0-15）
- [verify-brand.ts](verify-brand.ts) - 品牌验证脚本（日常检查）
- [config.ts](config.ts) - 品牌配置文件（包含新旧品牌信息和 ASCII Logo）
- [LogoExample.ts](LogoExample.ts) - ASCII Logo 示例（参考 Google 示例）
- [manual-checklist.md](manual-checklist.md) - **手动操作清单（仅 LICENSE 修改）**
- [README.md](README.md) - 本文档

---

## ⚠️ 注意事项

1. **首次运行**：直接运行 `replace-brand.ts` 即可，会自动完成所有可自动化的操作
2. **LICENSE 修改**：必须手动完成，参考 [manual-checklist.md](manual-checklist.md)
3. **CLI 入口文件重命名**：首次运行时会自动执行 `git mv packages/opencode/bin/opencode packages/opencode/bin/costrict-alpha`
4. **增量验证**：日常使用 `--incremental` 模式，速度更快
5. **冲突处理**：品牌文件用本地版本，代码文件用上游版本
6. **失败回滚**：脚本失败会自动回滚，无需担心
7. **手动同步上游**：使用 Git 命令手动同步，比自动脚本更可控

---

## 📝 TODO：待完成任务

### 🎨 品牌视觉资产重新设计

**当前状态**：
- ✅ **CLI ASCII Logo 已完成**：通过 Phase 15 自动替换为 COSTRICT 样式
- ❌ **图形文件仍为 OpenCode 品牌**：SVG/PNG 等图形资产需要重新设计

**需要重新设计的文件**：

#### Console App Brand Assets (`packages/console/app/src/asset/brand/`)
- [ ] `opencode-logo-light.svg` → 需要 CoStrict Logo（亮色主题）
- [ ] `opencode-logo-light.png` → 需要 CoStrict Logo PNG 版本
- [ ] `opencode-logo-dark.svg` → 需要 CoStrict Logo（暗色主题）
- [ ] `opencode-logo-dark.png` → 需要 CoStrict Logo PNG 版本
- [ ] `opencode-wordmark-light.svg` → 需要 CoStrict 文字标识（亮色）
- [ ] `opencode-wordmark-light.png`
- [ ] `opencode-wordmark-dark.svg` → 需要 CoStrict 文字标识（暗色）
- [ ] `opencode-wordmark-dark.png`
- [ ] `opencode-wordmark-simple-light.svg` → 需要简化版文字标识（亮色）
- [ ] `opencode-wordmark-simple-light.png`
- [ ] `opencode-wordmark-simple-dark.svg` → 需要简化版文字标识（暗色）
- [ ] `opencode-wordmark-simple-dark.png`
- [ ] `preview-opencode-logo-light.png` → 品牌页预览图（Logo 亮色）
- [ ] `preview-opencode-logo-dark.png` → 品牌页预览图（Logo 暗色）
- [ ] `preview-opencode-wordmark-light.png` → 品牌页预览图（Wordmark 亮色）
- [ ] `preview-opencode-wordmark-dark.png` → 品牌页预览图（Wordmark 暗色）
- [ ] `preview-opencode-wordmark-simple-light.png` → 品牌页预览图（简化版亮色）
- [ ] `preview-opencode-wordmark-simple-dark.png` → 品牌页预览图（简化版暗色）

#### Lander Assets (`packages/console/app/src/asset/lander/`)
- [ ] `opencode-logo-light.svg` → Landing 页 Logo（亮色）
- [ ] `opencode-logo-dark.svg` → Landing 页 Logo（暗色）
- [ ] `opencode-wordmark-light.svg` → Landing 页文字标识（亮色）
- [ ] `opencode-wordmark-dark.svg` → Landing 页文字标识（暗色）

#### Brand Assets Package
- [ ] `opencode-brand-assets.zip` → 需要打包所有新设计的 CoStrict 品牌资产

#### ~~Install Script ASCII Art~~ ✅ 已完成
- ~~`install` 文件 432-436 行~~
- ~~当前显示的是 "opencode" ASCII 艺术字~~
- ~~需要设计 "costrict" 的 ASCII 艺术字替代~~
- ✅ **已通过 Phase 13 自动处理用户可见文本**
- ✅ **ASCII Logo 通过 Phase 15 自动替换**

**设计要求**：
- Logo 应体现 CoStrict（Code Restriction / 代码约束）的品牌理念
- 需提供 SVG 矢量格式和 PNG 光栅格式
- 需同时提供亮色主题和暗色主题版本
- 文字标识需包含完整版和简化版
- 预览图尺寸需与原文件保持一致

**完成后操作**：
1. 将新设计的文件替换到对应目录
2. 文件名保持当前的 `opencode-*` 命名（脚本已更新引用路径）
3. 重新打包 `brand-assets.zip`
4. 运行 `bun run typecheck` 验证
5. 运行 `bun run script/costrict/verify-brand.ts` 验证品牌一致性

### 🔧 其他待优化项

- [ ] 检查 favicon 和 app icons 是否需要更新
- [ ] 检查 social share 图片是否包含 OpenCode 品牌元素
- [ ] 更新 install 脚本中的 ASCII Logo 艺术字

---

## 🛠️ 故障排除

### 问题 1：typecheck 失败

```bash
# 清理并重新安装依赖
rm -rf node_modules
bun install

# 重新运行 typecheck
bun run typecheck
```

### 问题 2：品牌验证失败

```bash
# 查看详细问题列表
bun run script/costrict/verify-brand.ts --full

# 重新应用品牌
bun run script/costrict/replace-brand.ts

# 再次验证
bun run script/costrict/verify-brand.ts
```

### 问题 3：合并冲突无法解决

```bash
# 放弃本次合并
git merge --abort

# 重新开始（参考上面的"同步上游"流程）
```

### 问题 4：CLI 入口文件重命名失败

```bash
# 手动重命名
git mv packages/opencode/bin/opencode packages/opencode/bin/costrict-alpha

# 手动更新 package.json 的 bin 字段
# 然后重新运行脚本
bun run script/costrict/replace-brand.ts
```

---

**祝使用顺利！🚀**
