/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_BACKEND_URL?: string;

  readonly PUBLIC_ADSENSE_CLIENT?: string;      // ca-pub-9333467879153410

  // Slots por ubicación (control total)
  readonly PUBLIC_ADSENSE_SLOT_HOME?: string;   // 1459226717
  readonly PUBLIC_ADSENSE_SLOT_SEARCH?: string; // slot banner_buscar
  readonly PUBLIC_ADSENSE_SLOT_DETAIL?: string; // slot banner_detalle
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
