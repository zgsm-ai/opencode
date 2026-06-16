#!/bin/sh
set -e

# List of environment variables to substitute
ENV_VARS='\${VITE_CLOUD_SERVER_HOST} \
\${VITE_CLOUD_SERVER_PORT} \
\${VITE_APP_PORT} \
\${VITE_API_PREFIX} \
\${VITE_QUOTA_PREFIX} \
\${VITE_QUOTA_URL} \
\${VITE_DASHBOARD_PREFIX} \
\${VITE_BASE_PATH} \
\${VITE_APP_URL} \
\${VITE_CASDOOR_ENDPOINT} \
\${VITE_CASDOOR_CLIENT_ID} \
\${VITE_CASDOOR_APP_NAME} \
\${VITE_CASDOOR_ORG_NAME} \
\${VITE_STORE_URL} \
\${VITE_OPENCODE_CLOUD_DEVICE_ID} \
\${VITE_OPENCODE_SERVER_HOST} \
\${VITE_OPENCODE_SERVER_PORT} \
\${VITE_SECURITY_FRONTEND_URL}'

# Substitute environment variables in index.html for runtime configuration
if [ -f "/app/packages/app-ai-native/dist/index.html" ]; then
  content=$(envsubst "$ENV_VARS" < /app/packages/app-ai-native/dist/index.html)
  printf '%s\n' "$content" > /app/packages/app-ai-native/dist/index.html
  echo "Runtime environment variables injected into index.html"

  # Rewrite asset paths in index.html to include base path prefix
  # This allows deploying under a sub-path without rebuilding the image
  BASE_PATH=$(echo "$VITE_BASE_PATH" | sed 's:/*$::')
  if [ -n "$BASE_PATH" ]; then
    # 1) Rewrite absolute paths: src="/..." and href="/..."
    sed -i "s|src=\"/|src=\"${BASE_PATH}/|g" /app/packages/app-ai-native/dist/index.html
    sed -i "s|href=\"/|href=\"${BASE_PATH}/|g" /app/packages/app-ai-native/dist/index.html
    # 2) Inject <base> tag for relative URL resolution (e.g. "assets/index.js")
    sed -i "s|<head>|<head>\n    <base href=\"${BASE_PATH}/\">|" /app/packages/app-ai-native/dist/index.html
    echo "Asset paths rewritten with base path: ${BASE_PATH}"
  fi
fi

# Execute the CMD
exec "$@"
