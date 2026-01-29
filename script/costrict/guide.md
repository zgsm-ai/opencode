# Costrict 项目开发指南

> 本文档提供完整的开发、测试、构建和调试流程

---

## 📋 目录

- [开发环境设置](#开发环境设置)
- [开发工作流](#开发工作流)
- [项目测试](#项目测试)
- [项目构建](#项目构建)
- [开发调试](#开发调试)
- [常见问题](#常见问题)
- [快速命令参考](#快速命令参考)

---

## 💻 开发环境设置

### 环境要求

- **Bun 1.3+** (包管理器和运行时)
- **Node.js** (某些工具依赖)
- **Rust 工具链** (仅构建桌面应用时需要,参见 [Tauri 先决条件](https://v2.tauri.app/start/prerequisites/))

### 项目结构

这是一个 **monorepo** 项目,使用 **Bun** 和 **Turbo** 进行包管理和任务编排:

- **opencode** - CLI 核心工具 (`packages/opencode`)
  - 核心业务逻辑和服务器
  - TUI 代码 (`src/cli/cmd/tui/`) - 使用 SolidJS + [OpenTUI](https://github.com/sst/opentui)
- **app** - 共享 Web UI 组件 (SolidJS)
- **desktop** - Tauri 桌面应用 (封装 app)
- **web** - Astro 文档站点
- **enterprise** - 企业版 (Vite/Nitro)
- **plugin** - `@opencode-ai/plugin` 源码
- **sdk** - TypeScript SDK

### 快速开始

```bash
# 1. 安装所有依赖
bun install

# 2. 启动开发服务器(默认在 packages/opencode 目录)
bun dev

# 3. 在其他目录运行
bun dev <directory>
bun dev .  # 在项目根目录运行
```

---

## 🚀 开发工作流

### 典型开发流程

#### 1. 修改 CLI 代码 (opencode)

```bash
cd packages/opencode

# 开发模式
bun dev

# 运行测试 (监听模式)
bun test --watch

# 类型检查
bun run typecheck

# 构建 (仅当前平台)
bun run build --single

# 验证构建产物
./dist/opencode-<platform>-<arch>/bin/opencode --version
```

#### 2. 修改前端代码 (app/desktop)

```bash
cd packages/app

# 开发模式 (http://localhost:5173,支持热重载)
bun run dev

# 类型检查
bun run typecheck

# 运行测试
bun test

# 构建
bun run build
```

#### 3. 修改桌面应用 (desktop)

```bash
cd packages/desktop

# 仅 Web 开发模式
bun run dev

# 原生窗口开发模式 (需要 Rust 工具链)
bun run tauri dev

# 构建
bun run build              # Web 资源
bun run tauri build        # 原生应用打包
```

#### 4. 修改 API/SDK

```bash
# 编辑 packages/opencode/src/server/server.ts 后

# 重新生成 SDK 和类型定义
./script/generate.ts

# 这会更新:
# - packages/sdk/js/src/gen/types.gen.ts
# - packages/sdk/js/src/v2/gen/types.gen.ts
```

### 提交代码前检查

```bash
# 1. 类型检查
bun turbo typecheck

# 2. 运行所有测试
bun --cwd packages/opencode test
bun --cwd packages/app test
bun --cwd packages/enterprise test

# 3. (可选) 构建验证
cd packages/opencode && bun run build --single
```

### 代码风格建议

遵循 [STYLE_GUIDE.md](../../STYLE_GUIDE.md) 的一般性指导原则:

- **函数**: 保持逻辑集中,除非拆分有明确复用价值
- **解构**: 避免不必要的解构
- **控制流**: 避免 `else`,优先使用提前返回
- **错误处理**: 优先 `.catch(...)` 而非 `try`/`catch`
- **类型**: 使用精确类型,避免 `any`
- **变量**: 使用 `const`,避免 `let`
- **命名**: 简洁且描述性
- **运行时**: 适当使用 Bun 工具如 `Bun.file()`

---

## 🧪 项目测试

### 测试文件分布

- `packages/opencode/test/` - 主要测试 (~40 个文件)
- `packages/app/src/` - 前端测试 (2 个文件)
- `packages/enterprise/test/` - 企业版测试 (2 个文件)

### 运行测试

```bash
# 运行所有测试
bun --cwd packages/opencode test
bun --cwd packages/app test
bun --cwd packages/enterprise test

# 监听模式 (开发时推荐)
cd packages/opencode && bun test --watch

# 带覆盖率
bun test --coverage

# 特定测试文件
bun test test/agent/agent.test.ts

# 详细日志
bun test --verbose

# 类型检查
bun turbo typecheck
```

### opencode 测试模块

| 模块 | 路径 | 说明 |
|------|------|------|
| Agent | `test/agent/` | Agent 功能 |
| CLI | `test/cli/` | CLI 命令 |
| Config | `test/config/` | 配置管理 |
| File | `test/file/` | 文件处理 |
| IDE | `test/ide/` | IDE 集成 |
| LSP | `test/lsp/` | 语言服务器 |
| MCP | `test/mcp/` | MCP 协议 |
| Patch | `test/patch/` | 补丁系统 |
| Permission | `test/permission/` | 权限管理 |
| Plugin | `test/plugin/` | 插件系统 |
| Project | `test/project/` | 项目管理 |
| Provider | `test/provider/` | Provider |
| Tool | `test/tool/` | 工具 |
| Util | `test/util/` | 工具函数 |

---

## 🏗️ 项目构建

### 快速构建

```bash
# 类型检查所有包
bun turbo typecheck

# 构建所有包 (Turbo 自动处理依赖)
bun turbo run build

# 仅构建 opencode CLI (当前平台)
cd packages/opencode && bun run build --single
```

### 各包构建详情

#### opencode (CLI 核心)

```bash
cd packages/opencode

# 构建独立可执行文件 (当前平台)
./script/build.ts --single
bun run build --single

# 构建所有平台 (Linux x64/arm64, macOS x64/arm64, Windows x64)
bun run build

# 构建参数
bun run build --single            # 仅当前平台
bun run build --baseline          # 不需要 AVX2
bun run build --skip-install      # 跳过依赖安装
bun run build --single --baseline --skip-install  # 组合

# 构建产物: packages/opencode/dist/opencode-<platform>-<arch>/
# 运行: ./dist/opencode-<platform>-<arch>/bin/opencode
```

#### app (Web UI)

```bash
cd packages/app
bun run dev      # 开发 (http://localhost:5173)
bun run build    # 构建到 dist/
bun run serve    # 预览
```

#### desktop (Tauri)

```bash
cd packages/desktop
bun run dev              # Web 开发模式
bun run tauri dev        # 原生窗口 (http://localhost:1420)
bun run build            # 构建 Web 资源到 dist/
bun run tauri build      # 打包原生应用到 src-tauri/target/release/
```

#### web (文档站点)

```bash
cd packages/web
bun run dev          # 开发
bun run dev:remote   # 远程 API 模式
bun run build        # 构建到 dist/
bun run preview      # 预览
```

#### enterprise

```bash
cd packages/enterprise
bun run dev                  # 开发
bun run build                # 构建到 dist/
bun run build:cloudflare     # Cloudflare Workers 构建
```

#### sdk

```bash
cd packages/sdk/js
bun run build  # 构建到 dist/
```

### 发布构建流程

```bash
# 完整验证
bun turbo typecheck
bun --cwd packages/opencode test
bun --cwd packages/app test
bun --cwd packages/enterprise test

# 构建 opencode 所有平台
cd packages/opencode && bun run build

# 构建其他包
cd ../.. && bun turbo run build
```

---

## 🐛 开发调试

### 基本调试方法

```bash
# 启动调试服务器
bun run --inspect=ws://localhost:6499/ dev

# 等待调试器连接
bun run --inspect-wait=ws://localhost:6499/ dev

# 在第一行暂停
bun run --inspect-brk=ws://localhost:6499/ dev

# 设置环境变量简化命令
export BUN_OPTIONS=--inspect=ws://localhost:6499/
bun dev
```

### 调试服务器代码

```bash
# 方法1: 使用 spawn 模式 (推荐)
bun dev spawn

# 方法2: 分离调试 - 服务器
bun run --inspect=ws://localhost:6499/ ./src/index.ts serve --port 4096
# 然后在另一终端: opencode attach http://localhost:4096

# 方法3: 分离调试 - TUI
bun run --inspect=ws://localhost:6499/ --conditions=browser ./src/index.ts
```

### VSCode 配置

参考项目示例配置:
- `.vscode/settings.example.json`
- `.vscode/launch.example.json`

**注意**: 某些调试方法 (如 `"request": "launch"` 或 JavaScript Debug Terminal) 可能存在断点映射问题,但仍值得尝试。

---

## 🔧 常见问题

### 测试失败

```bash
# 1. 重新安装依赖
bun install

# 2. 类型检查
bun turbo typecheck

# 3. 详细日志
bun test --verbose test/specific-file.test.ts
```

### 构建失败

```bash
# 1. 清理并重装
rm -rf node_modules packages/*/node_modules && bun install

# 2. 类型检查
bun turbo typecheck

# 3. 单独构建
cd packages/<包名> && bun run build
```

### 只构建特定平台

```bash
# Windows 用户
cd packages/opencode && bun run build --single

# 或修改 script/build.ts 中的 allTargets 数组
```

### 构建速度优化

```bash
# 跳过依赖安装
bun run build --single --skip-install

# 使用 Turbo 缓存
bun turbo run build --cache-dir=.turbo
```

### 验证构建产物

```bash
# 检查文件
ls -lh packages/opencode/dist/

# 测试运行
./packages/opencode/dist/opencode-<platform>-<arch>/bin/opencode --version

# 检查大小
du -sh packages/opencode/dist/*
```

### 开发时是否需要构建

**不需要!** 开发时使用:

```bash
# 前端: 开发模式 (热重载)
cd packages/app && bun run dev

# CLI: 直接运行源码
bun dev
```

仅在以下情况需要构建:
- 发布新版本
- 测试最终二进制文件
- 分发给他人使用

### 清理构建产物

```bash
# 清理 dist
find packages -name "dist" -type d -exec rm -rf {} +

# 清理 node_modules
find . -name "node_modules" -type d -exec rm -rf {} +

# 完整重置
rm -rf node_modules packages/*/node_modules packages/*/dist && bun install
```

---

## ⚡ 快速命令参考

### 开发

```bash
bun install                      # 安装依赖
bun dev                          # 启动开发服务器
bun dev <directory>              # 在指定目录运行
cd packages/app && bun run dev   # Web UI 开发 (5173)
cd packages/desktop && bun run tauri dev  # 桌面应用开发 (1420)
```

### 测试

```bash
bun --cwd packages/opencode test           # 运行测试
bun --cwd packages/opencode test --watch   # 监听模式
bun turbo typecheck                        # 类型检查
```

### 构建

```bash
bun turbo typecheck              # 类型检查
bun turbo run build              # 构建所有包
cd packages/opencode && bun run build --single  # CLI (当前平台)
cd packages/opencode && bun run build           # CLI (所有平台)
```

### 调试

```bash
bun run --inspect=ws://localhost:6499/ dev      # 启动调试
bun dev spawn                                   # Spawn 模式调试
export BUN_OPTIONS=--inspect=ws://localhost:6499/  # 环境变量
```

### 完整流程

```bash
# 提交前检查
bun turbo typecheck && \
bun --cwd packages/opencode test && \
bun --cwd packages/app test && \
bun --cwd packages/enterprise test

# 发布构建
bun turbo typecheck && \
bun --cwd packages/opencode test && \
cd packages/opencode && bun run build && \
cd ../.. && bun turbo run build
```

---

## 🎓 相关文档

- [CONTRIBUTING.md](../../CONTRIBUTING.md) - 贡献指南
- [STYLE_GUIDE.md](../../STYLE_GUIDE.md) - 代码风格指南
- [Bun 文档](https://bun.sh/docs)
- [Turbo 文档](https://turbo.build/repo/docs)
- [Tauri 文档](https://tauri.app/) | [先决条件](https://v2.tauri.app/start/prerequisites/)
- [SolidJS 文档](https://solidjs.com/)
- [OpenTUI](https://github.com/sst/opentui)
- [Vite 文档](https://vitejs.dev/)
- [Astro 文档](https://astro.build/)

---

## 📞 获取帮助

遇到问题时:
1. 查看本文档[常见问题](#常见问题)部分
2. 检查 [GitHub Issues](https://github.com/wantWhatBike/costrict-alpha/issues)
3. 参考 [CONTRIBUTING.md](../../CONTRIBUTING.md)

---

**维护者**: Costrict Team
**最后更新**: 2026-01-13

## 📋 变更日志

### 2026-01-13 (v2.0)
- **重构文档结构**: 新增"开发工作流"章节,整合典型开发场景
- **消除冗余**: 合并重复的命令和说明,减少文档篇幅约 40%
- **优化导航**: 简化目录结构,从 7 个章节优化为 6 个核心章节
- **精简内容**:
  - 测试章节: 合并 3 种运行方法为单一最佳实践
  - 构建章节: 整合各包说明,移除重复的产物位置说明
  - 调试章节: 浓缩核心方法,移除冗余解释
  - 常见问题: 从 Q&A 格式改为简洁的标题格式
- **新增内容**: API/SDK 变更说明整合到开发工作流中

### 2026-01-13 (v1.0)
- 添加开发环境设置章节
- 补充调试指南 (Bun 调试、VSCode 配置)
- 完善各包的开发模式说明
- 添加构建"localcode"独立可执行文件的指导
- 补充 Web App 和 Desktop App 的开发流程
- 添加代码风格建议
- 更新相关文档链接

### 2026-01-12
- 初始版本发布
