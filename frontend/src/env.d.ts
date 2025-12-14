/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_BACKEND_URL?: string;

  // Google
  readonly PUBLIC_ADSENSE_CLIENT?: string; // ca-pub-XXXX
  readonly PUBLIC_ADSENSE_SLOT_BANNER?: string; // slot id numérico
  readonly PUBLIC_GOOGLE_TAG_ID?: string; // GA4 (G-XXXX) o Google Tag (AW-XXXX)
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
