import "solid-js"

interface ImportMetaEnv {
  readonly VITE_COSTRICT_SERVER_HOST: string
  readonly VITE_COSTRICT_SERVER_PORT: string
  readonly VITE_STORE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module "solid-js" {
  namespace JSX {
    interface Directives {
      sortable: true
    }
  }
}
