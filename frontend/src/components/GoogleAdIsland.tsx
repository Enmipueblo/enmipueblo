import React, { useEffect } from 'react';

// Config centralizada por variables de entorno (frontend/.env)
const ADSENSE_CLIENT = import.meta.env.PUBLIC_ADSENSE_CLIENT as string | undefined;
const ADSENSE_SLOT_BANNER = import.meta.env.PUBLIC_ADSENSE_SLOT_BANNER as
  | string
  | undefined;

type Props = {
  /** Slot específico (si no lo pasas usa PUBLIC_ADSENSE_SLOT_BANNER) */
  slot?: string;
  /** Altura del bloque (por defecto 90) */
  height?: number;
  /** Ancho máximo (por defecto 728) */
  maxWidth?: number;
};

const GoogleAdIsland: React.FC<Props> = ({
  slot,
  height = 90,
  maxWidth = 728,
}) => {
  const client = ADSENSE_CLIENT;
  const adSlot = slot || ADSENSE_SLOT_BANNER;

  useEffect(() => {
    try {
      // Si no hay config, no intentamos cargar.
      if (!client || !adSlot) return;

      // Intenta (re)cargar los anuncios de Google.
      // Si el consentimiento aún no está dado, Layout tiene pauseAdRequests=1
      // y no se servirán anuncios hasta que el banner lo levante.
      // @ts-ignore
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      console.error('Error cargando anuncios', e);
    }
  }, [client, adSlot]);

  // Evitar “huecos” si aún no configuraste el pub-id/slot
  if (!client || !adSlot) return null;

  return (
    <div className="my-4 flex justify-center">
      <ins
        className="adsbygoogle"
        style={{ display: 'block', width: '100%', maxWidth, height }}
        data-ad-client={client}
        data-ad-slot={adSlot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      ></ins>
    </div>
  );
};

export default GoogleAdIsland;
