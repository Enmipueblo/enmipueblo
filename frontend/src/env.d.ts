/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_BACKEND_URL?: string;

  readonly PUBLIC_ADSENSE_CLIENT?: string;      // ca-pub-9333467879153410
  readonly PUBLIC_ADSENSE_SLOT_BANNER?: string; // slot numérico

  readonly PUBLIC_GOOGLE_TAG_ID?: string;       // opcional (G-XXXX)
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
