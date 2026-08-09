/// <reference types="vite/client" />

/** The inspector runs under Vite in development but does not depend on Vite at runtime. */
interface ImportMetaEnv {
  readonly DEV: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
