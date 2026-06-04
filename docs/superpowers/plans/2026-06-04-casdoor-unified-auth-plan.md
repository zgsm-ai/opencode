# Casdoor 统一认证跳转 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 opencode 左侧导航栏新增 CodeReview 按钮，点击后携带 Casdoor token 跳转到 security 平台，实现免登录。

**Architecture:** URL 携带 Casdoor Token 方案。opencode 前端通过 cloud API 获取 Casdoor access token，拼接到 security-frontend URL 中跳转。security-frontend 接收 token 后调 security-backend 新增的 `/v1/casdoor-login/` 接口完成登录。

**Tech Stack:** SolidJS (opencode frontend), Vue 3 + Pinia (security-frontend), Django REST Framework (security-backend), Casdoor OAuth

**涉及项目：**
- `e:\Projects\opencode` — opencode 主项目 (feat/sdl-web 分支)
- `e:\Projects\security-frontend` — 安全平台前端 (feat/sdl-web 分支)
- `e:\Projects\security-backend` — 安全平台后端 (feat/sdl-web 分支)

---

## File Structure

### opencode (`e:\Projects\opencode`)

| 操作 | 文件 | 职责 |
|------|------|------|
| Modify | `packages/app-ai-native/src/lib/env.ts` | 新增 SECURITY_FRONTEND_URL 环境变量 |
| Create | `packages/app-ai-native/src/lib/security-jump.ts` | Casdoor token 获取 + 跳转 URL 构建 |
| Modify | `packages/app-ai-native/src/pages/root-layout.tsx` | 导航栏新增 CodeReview 按钮 |
| Modify | `packages/app-ai-native/src/i18n/en.ts` | 英文 i18n |
| Modify | `packages/app-ai-native/src/i18n/zh.ts` | 中文 i18n |
| Modify | `packages/app-ai-native/Dockerfile` | 新增 VITE_SECURITY_FRONTEND_URL |
| Modify | `packages/app-ai-native/docker-entrypoint.sh` | 注入 VITE_SECURITY_FRONTEND_URL |
| Modify | `packages/app-ai-native/index.html` | window.__ENV__ 新增 VITE_SECURITY_FRONTEND_URL |

### security-frontend (`e:\Projects\security-frontend`)

| 操作 | 文件 | 职责 |
|------|------|------|
| Modify | `src/utils/api.js` | 新增 casdoorLogin API |
| Modify | `src/App.vue` | onBeforeMount 新增 casdoor_token 处理 |
| Modify | `.env.development` | 新增 Casdoor 环境变量 |

### security-backend (`e:\Projects\security-backend`)

| 操作 | 文件 | 职责 |
|------|------|------|
| Modify | `llm_sast_plat_backend/settings.py` | 新增 Casdoor 配置项 |
| Modify | `account/views.py` | 新增 casdoor_login_view |
| Modify | `account/urls.py` | 新增 casdoor-login 路由 |
| Modify | `.env` | 新增 Casdoor 环境变量 |

---

## 前置条件

Cloud API 服务需要新增一个端点 `GET /api/auth/casdoor-token`，返回当前用户的 Casdoor access token。app-ai-native 通过已有的反向代理机制（Bun server / Vite proxy）访问此端点。响应格式：

```json
{ "access_token": "eyJhbGciOi..." }
```

---

## Task 1: security-backend — Casdoor 配置

**Files:**
- Modify: `e:\Projects\security-backend\llm_sast_plat_backend\settings.py`
- Modify: `e:\Projects\security-backend\.env`

- [ ] **Step 1: 在 settings.py 新增 Casdoor 配置**

在 `settings.py` 的 `UC_SERVER_ADDR` 行下方新增：

```python
UC_SERVER_ADDR = os.getenv("UC_SERVER_ADDR")
# Casdoor 配置
CASDOOR_ENDPOINT = os.getenv("CASDOOR_ENDPOINT", "http://localhost:18000")
CASDOOR_CLIENT_ID = os.getenv("CASDOOR_CLIENT_ID", "")
```

- [ ] **Step 2: 在 .env 新增 Casdoor 环境变量**

在 `.env` 文件末尾新增：

```env
# Casdoor
CASDOOR_ENDPOINT=http://localhost:18000
CASDOOR_CLIENT_ID=
```

- [ ] **Step 3: 提交**

```bash
cd /e/Projects/security-backend
git add llm_sast_plat_backend/settings.py .env
git commit -m "feat: add Casdoor configuration to settings"
```

---

## Task 2: security-backend — Casdoor 登录接口

**Files:**
- Modify: `e:\Projects\security-backend\account\views.py`
- Modify: `e:\Projects\security-backend\account\urls.py`

- [ ] **Step 1: 在 account/views.py 新增 casdoor_login_view**

在 `temp_login_view` 函数之后（约 189 行后），新增：

```python
def get_user_info_by_casdoor(access_token):
    """
    通过 Casdoor access token 获取用户信息
    """
    from llm_sast_plat_backend.settings import CASDOOR_ENDPOINT
    casdoor_user_url = f"{CASDOOR_ENDPOINT}/api/get-user"
    headers = {
        'Authorization': f'Bearer {access_token}'
    }
    try:
        response = requests.get(casdoor_user_url, headers=headers, timeout=10)
        resp = response.json()
        if resp.get('status') != 'ok':
            logger.warning(f"Casdoor token 验证失败: {resp}")
            return {}
        return resp.get('data', {})
    except Exception as err:
        logger.warning(f"Casdoor 认证失败: {err}")
        return {}


@api_view(['POST'])
@authentication_classes([])
@permission_classes([])
def casdoor_login_view(request):
    """
    Casdoor token 登录接口
    接收 Casdoor access token，验证后创建/查找用户并返回内部 token
    """
    casdoor_token = request.data.get('casdoor_token')
    if not casdoor_token:
        return Response(
            data={},
            code=status.HTTP_400_BAD_REQUEST,
            msg="缺少 casdoor_token 参数",
        )

    casdoor_user = get_user_info_by_casdoor(casdoor_token)
    if not casdoor_user:
        return Response(
            data={},
            code=status.HTTP_401_UNAUTHORIZED,
            msg="Casdoor 认证失败",
        )

    # Casdoor 用户名字段: name 或 username
    casdoor_username = casdoor_user.get('name') or casdoor_user.get('username') or casdoor_user.get('displayName', '')
    casdoor_display = casdoor_user.get('displayName') or casdoor_username
    casdoor_email = casdoor_user.get('email', '')

    if not casdoor_username:
        return Response(
            data={},
            code=status.HTTP_401_UNAUTHORIZED,
            msg="Casdoor 用户信息不完整",
        )

    try:
        user = User.objects.get(username=casdoor_username)
        user.login_time += 1
        user.last_login = timezone.now()
        token = user.token
        user.save()
    except User.DoesNotExist:
        token = generate_key()
        user = User.objects.create(
            sn=casdoor_username,
            username=casdoor_display,
            email=casdoor_email,
            token=token,
            pinyin='',
            pinyin_initials='',
            first_login=timezone.now(),
            last_login=timezone.now(),
            role=const.ROLE_COMMON_USER,
            login_time=1,
        )

    # 设置会话信息
    request.session['sn'] = user.sn
    request.session['username'] = user.username
    request.session['session_expiry'] = (timezone.now() + timezone.timedelta(
        seconds=SESSION_COOKIE_AGE)).isoformat()

    return Response(
        data={
            'id': user.id,
            'sn': user.sn,
            'username': user.username,
            'email': user.email,
            'token': token,
            'is_superuser': user.is_superuser,
            'role': user.role,
        },
        code=status.HTTP_200_OK,
        msg="登录成功",
    )
```

- [ ] **Step 2: 在 account/urls.py 注册路由**

在 `urlpatterns` 列表中 `path('temp_login/', ...)` 行之后新增：

```python
    path('casdoor-login/', views.casdoor_login_view, name='casdoor-login'),
```

- [ ] **Step 3: 提交**

```bash
cd /e/Projects/security-backend
git add account/views.py account/urls.py
git commit -m "feat: add Casdoor login endpoint POST /v1/account/casdoor-login/"
```

---

## Task 3: security-frontend — 新增 casdoorLogin API

**Files:**
- Modify: `e:\Projects\security-frontend\src\utils\api.js`

- [ ] **Step 1: 在 api.js 新增 casdoorLogin 函数**

在 `accountLogout` 函数之后新增：

```javascript
export const casdoorLogin = async (casdoorToken) => {
    return request.post("/account/casdoor-login/", { casdoor_token: casdoorToken });
};
```

- [ ] **Step 2: 提交**

```bash
cd /e/Projects/security-frontend
git add src/utils/api.js
git commit -m "feat: add casdoorLogin API function"
```

---

## Task 4: security-frontend — App.vue 处理 casdoor_token

**Files:**
- Modify: `e:\Projects\security-frontend\src\App.vue`

- [ ] **Step 1: 在 onBeforeMount 中新增 casdoor_token 处理逻辑**

在 `onBeforeMount` 回调中，`if (!store.loggedIn) {` 之后、`const ucToken = ...` 之前，插入 casdoor_token 处理：

找到这段代码（约 128-129 行）：
```javascript
  if (!store.loggedIn) {
    const ucToken = window.location.search.split("token=")[1];
```

替换为：
```javascript
  if (!store.loggedIn) {
    // 1. 处理 Casdoor token（来自 opencode 跳转）
    const urlParams = new URLSearchParams(window.location.search);
    const casdoorToken = urlParams.get("casdoor_token");
    if (casdoorToken) {
      try {
        store.activateLoginLoading();
        const resp = await API.casdoorLogin(casdoorToken);
        if (resp.code && resp.code !== 200) {
          message.error("登录失败，请稍后重试");
          return;
        }

        store.setUserId(`${resp.data.id}`);
        store.setToken(resp.data.token);

        // 初始化用户信息和产品数据
        await initializeUserData();

        // 清除 URL 中的 casdoor_token 参数
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete("casdoor_token");
        window.history.replaceState({}, "", cleanUrl.toString());

        window.location.href = `http://${location.host}/#/agent-scan-issues`;
      } catch {
        message.error("Casdoor 登录失败");
      } finally {
        store.deactivateLoginLoading();
      }
      return;
    }

    // 2. 处理 UC token（现有逻辑）
    const ucToken = window.location.search.split("token=")[1];
```

- [ ] **Step 2: 提交**

```bash
cd /e/Projects/security-frontend
git add src/App.vue
git commit -m "feat: handle casdoor_token query param for cross-app login"
```

---

## Task 5: security-frontend — 环境变量

**Files:**
- Modify: `e:\Projects\security-frontend\.env.development`

- [ ] **Step 1: 新增 Casdoor 配置**

在 `.env.development` 文件末尾新增：

```env

# Casdoor 配置
VITE_CASDOOR_ENDPOINT=http://localhost:18000
VITE_CASDOOR_CLIENT_ID=
VITE_CASDOOR_APP_NAME=security-sast
VITE_CASDOOR_ORG_NAME=built-in
```

- [ ] **Step 2: 提交**

```bash
cd /e/Projects/security-frontend
git add .env.development
git commit -m "feat: add Casdoor env vars to development config"
```

---

## Task 6: opencode — env.ts 新增 SECURITY_FRONTEND_URL

**Files:**
- Modify: `e:\Projects\opencode\packages\app-ai-native\src\lib\env.ts`

- [ ] **Step 1: 在 env 对象中新增 SECURITY_FRONTEND_URL**

在 `env` 对象的 `DEMO_MODE` getter 之前（约 115 行），新增：

```ts
  // Security frontend URL for cross-app navigation (same domain, e.g. "/llm_sast")
  get SECURITY_FRONTEND_URL() {
    return getEnv("VITE_SECURITY_FRONTEND_URL", "/llm_sast")
  },

  // Demo mode: use mock data instead of real API calls
```

- [ ] **Step 2: 提交**

```bash
cd /e/Projects/opencode
git add packages/app-ai-native/src/lib/env.ts
git commit -m "feat: add SECURITY_FRONTEND_URL env variable"
```

---

## Task 7: opencode — 创建 security-jump 工具模块

**Files:**
- Create: `e:\Projects\opencode\packages\app-ai-native\src\lib\security-jump.ts`

- [ ] **Step 1: 创建 security-jump.ts**

```ts
import { env } from "@/lib/env"

const PREFIX = env.API_PREFIX

/**
 * Get Casdoor access token from cloud API for cross-app authentication.
 * The cloud API must expose GET /api/auth/casdoor-token.
 */
export async function getCasdoorToken(): Promise<string> {
  const res = await fetch(`${PREFIX}/api/auth/casdoor-token`, {
    credentials: "include",
  })
  if (!res.ok) {
    throw new Error(`Failed to get Casdoor token: ${res.status}`)
  }
  const data = await res.json()
  if (!data.access_token) {
    throw new Error("No access_token in response")
  }
  return data.access_token
}

/**
 * Build the security platform URL with Casdoor token for auto-login.
 * @param token - Casdoor access token
 * @returns Full URL to redirect to security-frontend
 */
export function buildSecurityUrl(token: string): string {
  const base = env.SECURITY_FRONTEND_URL
  return `${base}/?casdoor_token=${encodeURIComponent(token)}`
}
```

- [ ] **Step 2: 提交**

```bash
cd /e/Projects/opencode
git add packages/app-ai-native/src/lib/security-jump.ts
git commit -m "feat: add security-jump utility module"
```

---

## Task 8: opencode — i18n 新增 CodeReview 相关键

**Files:**
- Modify: `e:\Projects\opencode\packages\app-ai-native\src\i18n\en.ts`
- Modify: `e:\Projects\opencode\packages\app-ai-native\src\i18n\zh.ts`

- [ ] **Step 1: 在 en.ts 新增侧边栏键**

找到 `"sidebar.kanban"` 键所在行，在其之后新增：

```typescript
"sidebar.kanban": "Kanban",
"sidebar.codeReview": "CodeReview",
"sidebar.codeReview.jumpFailed": "Failed to jump to CodeReview",
```

- [ ] **Step 2: 在 zh.ts 新增侧边栏键**

找到 `"sidebar.kanban"` 键所在行，在其之后新增：

```typescript
"sidebar.kanban": "指标看板",
"sidebar.codeReview": "代码审查",
"sidebar.codeReview.jumpFailed": "跳转代码审查平台失败",
```

- [ ] **Step 3: 提交**

```bash
cd /e/Projects/opencode
git add packages/app-ai-native/src/i18n/en.ts packages/app-ai-native/src/i18n/zh.ts
git commit -m "feat: add CodeReview i18n keys for sidebar"
```

---

## Task 9: opencode — root-layout.tsx 新增 CodeReview 导航按钮

**Files:**
- Modify: `e:\Projects\opencode\packages\app-ai-native\src\pages\root-layout.tsx`

- [ ] **Step 1: 添加 imports**

在文件顶部 imports 中：

将：
```typescript
import { type JSX, type ParentProps, Show, createEffect, createMemo } from "solid-js"
```
改为：
```typescript
import { type JSX, type ParentProps, Show, createEffect, createMemo, createSignal } from "solid-js"
```

将：
```typescript
import { Gauge, Sun, Moon } from "lucide-solid"
```
改为：
```typescript
import { Gauge, Shield, Sun, Moon } from "lucide-solid"
```

在 `import { appPath } from "@/lib/router"` 行之后新增：
```typescript
import { getCasdoorToken, buildSecurityUrl } from "@/lib/security-jump"
```

- [ ] **Step 2: 在 RootLayout 组件中添加跳转逻辑**

在 `const isMultica = () => {` 函数之前（约 241 行），新增：

```typescript
  const [securityJumping, setSecurityJumping] = createSignal(false)

  async function handleSecurityJump() {
    if (securityJumping()) return
    setSecurityJumping(true)
    try {
      const token = await getCasdoorToken()
      window.location.href = buildSecurityUrl(token)
    } catch {
      showToast({
        title: language.t("sidebar.codeReview.jumpFailed"),
        variant: "error",
      })
      setSecurityJumping(false)
    }
  }
```

- [ ] **Step 3: 在导航栏 nav 中添加 CodeReview 按钮**

找到 Workspace NavButton 之后、Multica NavButton 之前的代码（约 266-274 行）：

```tsx
            <NavButton
              icon="folder"
              label={language.t("sidebar.workspace")}
              active={isWorkspace()}
              onClick={() => navigate(lastWorkspace)}
            />
            <Show when={true}>
              <NavButton
                icon="task"
                label="Multica"
                active={isMultica()}
                onClick={() => navigate("/multica")}
              />
            </Show>
```

替换为：

```tsx
            <NavButton
              icon="folder"
              label={language.t("sidebar.workspace")}
              active={isWorkspace()}
              onClick={() => navigate(lastWorkspace)}
            />
            <NavButton
              label={language.t("sidebar.codeReview")}
              active={false}
              onClick={handleSecurityJump}
              node={<Shield size={18} strokeWidth={1.75} aria-hidden="true" />}
            />
            <Show when={true}>
              <NavButton
                icon="task"
                label="Multica"
                active={isMultica()}
                onClick={() => navigate("/multica")}
              />
            </Show>
```

- [ ] **Step 4: 提交**

```bash
cd /e/Projects/opencode
git add packages/app-ai-native/src/pages/root-layout.tsx
git commit -m "feat: add CodeReview nav button with Casdoor token jump"
```

---

## Task 10: opencode — Docker 部署配置

**Files:**
- Modify: `e:\Projects\opencode\packages\app-ai-native\Dockerfile`
- Modify: `e:\Projects\opencode\packages\app-ai-native\docker-entrypoint.sh`
- Modify: `e:\Projects\opencode\packages\app-ai-native\index.html`

- [ ] **Step 1: Dockerfile 新增环境变量**

在 `ENV VITE_OPENCODE_SERVER_PORT=8080` 行之后新增：

```dockerfile
ENV VITE_SECURITY_FRONTEND_URL=/llm_sast
```

- [ ] **Step 2: docker-entrypoint.sh 新增变量注入**

在 `ENV_VARS` 字符串中 `${VITE_OPENCODE_SERVER_PORT}` 之后新增：

```bash
${VITE_SECURITY_FRONTEND_URL}
```

即：
```bash
ENV_VARS='${VITE_CLOUD_SERVER_HOST} \
...
${VITE_OPENCODE_SERVER_HOST} \
${VITE_OPENCODE_SERVER_PORT} \
${VITE_SECURITY_FRONTEND_URL}'
```

- [ ] **Step 3: index.html 新增 window.__ENV__ 条目**

在 `window.__ENV__` 对象中 `VITE_DEMO_MODE` 行之后新增：

```javascript
        VITE_SECURITY_FRONTEND_URL: "${VITE_SECURITY_FRONTEND_URL}",
```

- [ ] **Step 4: 提交**

```bash
cd /e/Projects/opencode
git add packages/app-ai-native/Dockerfile packages/app-ai-native/docker-entrypoint.sh packages/app-ai-native/index.html
git commit -m "feat: add VITE_SECURITY_FRONTEND_URL to Docker and index.html"
```

---

## 自检结果

### Spec Coverage

| 设计文档要求 | 对应 Task |
|-------------|-----------|
| security-backend `/v1/casdoor-login/` 接口 | Task 1, 2 |
| security-frontend `casdoor_token` 处理 | Task 3, 4 |
| security-frontend 环境变量 | Task 5 |
| opencode 环境变量 SECURITY_FRONTEND_URL | Task 6 |
| opencode 跳转工具模块 | Task 7 |
| opencode i18n | Task 8 |
| opencode 导航栏按钮 | Task 9 |
| opencode Docker 部署 | Task 10 |

### Placeholder Scan

无 TBD、TODO、占位符。所有步骤包含完整代码。

### Type Consistency

- `getCasdoorToken()` 返回 `Promise<string>` → `buildSecurityUrl(token: string)` 接收 `string` ✓
- `API.casdoorLogin(casdoorToken)` 参数名与 App.vue 中的变量 `casdoorToken` 一致 ✓
- `casdoor_login_view` 请求体 `casdoor_token` 与前端 `request.post` 中的 `{ casdoor_token: casdoorToken }` 一致 ✓
- 后端响应字段 `id, token, username, sn, is_superuser, role` 与前端 `store.setUserId`, `store.setToken` 使用一致 ✓
