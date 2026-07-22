/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_GUILD_ID: string;
  readonly VITE_RESOURCE_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}