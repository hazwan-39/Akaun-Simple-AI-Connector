/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** Base URL for the API. Defaults to same-origin "/api". */
  readonly VITE_API_BASE_URL?: string;
  /** "true" enables reading real Akaun Simple data (pilot only, after mapping verification). */
  readonly VITE_ENABLE_PRODUCTION_ADAPTER?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
