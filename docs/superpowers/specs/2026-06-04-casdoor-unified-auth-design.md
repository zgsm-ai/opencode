# Casdoor 统一认证 — opencode 跳转 security 平台设计

## 背景

opencode (app-ai-native) 和 security 平台 (security-frontend + security-backend) 是两个独立项目，目前各自使用不同的认证体系：

- **opencode**: Casdoor OAuth 认证
- **security 平台**: UC OAuth 认证 (`/uc3/auth/oauth2/login/`)

用户从 opencode 跳转到 security 平台时需要重复登录。需要打通认证，实现免登录跳转。

## 需求

1. opencode 左侧导航栏新增 CodeReview 按钮
2. 点击后当前窗口跳转到 security-frontend（同域 `/llm_sast/` 路径下）
3. 统一使用 Casdoor 认证，跳转时携带 Casdoor token，security 后端验证后自动登录
4. security 平台保留原有 UC 登录方式不变，Casdoor 作为新增认证通道

## 认证方案

**方案 A：URL 携带 Casdoor Token 直接跳转**

1. opencode 前端获取当前 Casdoor access token
2. 拼接 URL：`/llm_sast/?casdoor_token=<token>`，当前窗口跳转
3. security-frontend 收到 `casdoor_token` 参数，调后端 `/v1/casdoor-login/` 接口
4. security-backend 验证 Casdoor token（调 Casdoor API 校验），创建/查找用户，返回内部 token
5. security-frontend 存储内部 token，完成登录
6. 清除 URL 中的 `casdoor_token` 参数

选择理由：实现简单，一次跳转完成；Casdoor 已部署；token 参数可立即清除，风险可控。

---

## 第1部分：opencode (app-ai-native) 改动

### 1.1 环境变量

`packages/app-ai-native/src/lib/env.ts` 新增：

```ts
// security-frontend 的路径前缀（同域部署，实际为 /llm_sast）
get SECURITY_FRONTEND_URL() {
  return getEnv("VITE_SECURITY_FRONTEND_URL", "/llm_sast")
}
```

Dockerfile 和 docker-entrypoint.sh 对应注入 `VITE_SECURITY_FRONTEND_URL` 环境变量。

### 1.2 导航栏按钮

`packages/app-ai-native/src/pages/root-layout.tsx` 左侧导航栏新增 CodeReview 按钮，位于 Workspace 和 Multica 之间：

```
Store → Workspace → CodeReview（盾牌图标 Shield）→ Multica → Kanban → ...
```

点击行为：

1. 从 auth context 获取当前 Casdoor access token
2. 拼接 URL：`${env.SECURITY_FRONTEND_URL}/?casdoor_token=${token}`
3. `window.location.href = URL`（当前窗口跳转）
4. 加 loading 状态防止重复点击
5. 错误时显示 toast 提示

### 1.3 i18n

`packages/app-ai-native/src/i18n/en.ts` 和 `zh.ts` 新增：

- `sidebar.codeReview` → "CodeReview" / "代码审查"
- `sidebar.codeReview.jumpFailed` → "Failed to jump to CodeReview" / "跳转代码审查平台失败"

### 1.4 auth context

需要确认 auth context 能暴露 Casdoor access token 给跳转逻辑使用。如当前未暴露，需新增获取 token 的方法。

---

## 第2部分：security-frontend 改动

### 2.1 App.vue 登录流程

在 `onBeforeMount` 中新增 Casdoor token 登录通道，排在最前面：

```
检测顺序：
1. casdoor_token 参数（来自 opencode 跳转）  ← 新增
2. 现有 UC token 处理逻辑（保持不变）
3. 未登录 → 显示登录弹窗
```

Casdoor token 处理逻辑：

1. 从 URL query 获取 `casdoor_token` 参数
2. 调用 `API.casdoorLogin(casdoorToken)`
3. 后端返回 `{ id, token, username, sn, role, is_superuser }`
4. 存储 token 和 userId
5. 初始化用户数据（`initializeUserData()`）
6. 清除 URL 中的 `casdoor_token` 参数（`history.replaceState`）
7. 跳转到 `agent-scan-issues` 页面
8. 失败时显示错误提示

### 2.2 API 层

`src/utils/api.js`（或对应 API 文件）新增：

```js
casdoorLogin(casdoorToken) {
  return axiosInstance.post('/casdoor-login/', { casdoor_token: casdoorToken })
}
```

### 2.3 环境变量

`.env.development` 新增 Casdoor 配置（供未来独立 Casdoor OAuth 登录使用）：

```env
VITE_CASDOOR_ENDPOINT=http://localhost:18000
VITE_CASDOOR_CLIENT_ID=
VITE_CASDOOR_APP_NAME=security-sast
VITE_CASDOOR_ORG_NAME=built-in
```

### 2.4 保持不变

- 现有 UC OAuth 登录流程完整保留
- 现有临时登录功能保留
- Router 配置不改
- Store 结构不改
- Axios 拦截器不改

---

## 第3部分：security-backend 改动

### 3.1 新增 API 接口

**URL**: `POST /v1/casdoor-login/`

**认证**: 无需认证（此接口本身用于登录）

**请求体**:

```json
{ "casdoor_token": "<casdoor_access_token>" }
```

**处理流程**:

1. 接收 `casdoor_token`
2. 调用 Casdoor API 验证 token：`GET <CASDOOR_ENDPOINT>/api/get-user?accessToken=<token>`
3. 获取 Casdoor 用户信息（username, displayName 等）
4. 在本地 User 表按 `username` 查找用户
5. 找到 → 更新用户信息，重新生成内部 token
6. 找不到 → 自动创建新用户（角色设为 `common_user`），生成内部 token
7. 将 token 存入 User 模型的 `token` 字段
8. 返回用户信息 + 内部 token

**响应体**（复用现有 `/account/login/` 格式）:

```json
{
  "id": 1,
  "token": "xxx",
  "username": "zhangsan",
  "sn": "10001",
  "role": "common_user",
  "is_superuser": false
}
```

**错误响应**:

- `400`: 缺少 `casdoor_token` 参数
- `401`: Casdoor token 验证失败

### 3.2 Casdoor 配置

`settings.py` 或 `.env` 新增：

```python
CASDOOR_ENDPOINT = os.getenv("CASDOOR_ENDPOINT", "http://localhost:18000")
CASDOOR_CLIENT_ID = os.getenv("CASDOOR_CLIENT_ID", "")
CASDOOR_APP_NAME = os.getenv("CASDOOR_APP_NAME", "security-sast")
CASDOOR_ORG_NAME = os.getenv("CASDOOR_ORG_NAME", "built-in")
```

### 3.3 URL 路由

`llm_scan/urls.py` 新增：

```python
path('casdoor-login/', views.CasdoorLoginView.as_view(), name='casdoor-login'),
```

### 3.4 保持不变

- 现有 `/account/login/` 接口完整保留
- `AccountTokenAuthentication` 不改
- Session 管理、权限体系不改
- 现有 middleware 不改

---

## 数据流示意

```
opencode (app-ai-native)          security-frontend              security-backend       Casdoor
        |                               |                            |                    |
        |--- 点击 CodeReview ---------->|                            |                    |
        |   获取 Casdoor token          |                            |                    |
        |   location.href =             |                            |                    |
        |   /llm_sast/?casdoor_token=X  |                            |                    |
        |                               |--- 提取 casdoor_token ---->|                    |
        |                               |                            |--- 验证 token ---->|
        |                               |                            |<-- 返回用户信息 ----|
        |                               |                            |                    |
        |                               |                            | 查找/创建本地用户    |
        |                               |                            | 生成内部 token      |
        |                               |<-- 返回 {id, token} -------|                    |
        |                               | 存储 token                  |                    |
        |                               | 清除 URL 参数               |                    |
        |                               | 跳转到 scan 页面            |                    |
```

## 错误处理

| 场景 | 处理 |
|------|------|
| opencode 用户未登录 | auth context 会自动重定向到登录页，不会到达跳转逻辑 |
| Casdoor token 过期 | security-backend 返回 401，frontend 显示错误提示 |
| security-backend 不可达 | frontend 捕获网络错误，显示 toast |
| 用户在 security 已存在 | 按 username 匹配，更新信息，返回内部 token |
| 用户在 security 不存在 | 自动创建，角色为 common_user |

## 部署注意事项

- Casdoor 服务需在 security-backend 可访问的网络范围内
- 同域部署需确保 Nginx/网关正确代理 `/llm_sast/` 路径到 security-frontend
- `VITE_SECURITY_FRONTEND_URL` 需在 opencode 的 Docker 环境变量中配置
- security-backend 的 `CASDOOR_ENDPOINT` 需在部署环境中配置为实际 Casdoor 地址
