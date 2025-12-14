import React, { useEffect } from "react";

const ADSENSE_CLIENT = import.meta.env.PUBLIC_ADSENSE_CLIENT as string | undefined;

// Slots por defecto (compatibles)
const SLOT_HOME = import.meta.env.PUBLIC_ADSENSE_SLOT_HOME as string | undefined;
// (compatibilidad por si alguien seguía usando el nombre viejo)
const SLOT_LEGACY_BANNER = (import.meta.env as any).PUBLIC_ADSENSE_SLOT_BANNER as
  | string
  | undefined;

type Props = {
  /** Slot específico si querés forzarlo desde el componente */
  slot?: string;
  /** Altura sugerida (por defecto 90) */
  height?: number;
  /** Ancho máx sugerido (por defecto 728) */
  maxWidth?: number;
};

const GoogleAdIsland: React.FC<Props> = ({
  slot,
  height = 90,
  maxWidth = 728,
}) => {
  const adSlot = slot || SLOT_HOME || SLOT_LEGACY_BANNER;

  useEffect(() => {
    try {
      if (!ADSENSE_CLIENT || !adSlot) return;
      // @ts-ignore
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      console.error("Error cargando anuncios", e);
    }
  }, [adSlot]);

  if (!ADSENSE_CLIENT || !adSlot) return null;

  return (
    <div className="my-6 flex justify-center">
      <ins
        className="adsbygoogle"
        style={{ display: "block", width: "100%", maxWidth, height }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={adSlot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
};

export default GoogleAdIsland;
