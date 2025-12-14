import React, { useEffect } from 'react';

const ADSENSE_CLIENT = import.meta.env.PUBLIC_ADSENSE_CLIENT as string | undefined;
const ADSENSE_SLOT_BANNER = import.meta.env.PUBLIC_ADSENSE_SLOT_BANNER as string | undefined;

type Props = {
  slot?: string;
  height?: number;
  maxWidth?: number;
};

export default function GoogleAdIsland({
  slot,
  height = 90,
  maxWidth = 728,
}: Props) {
  const adSlot = slot || ADSENSE_SLOT_BANNER;

  useEffect(() => {
    try {
      if (!ADSENSE_CLIENT || !adSlot) return;
      // @ts-ignore
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      console.error('Error cargando anuncios', e);
    }
  }, [adSlot]);

  // Si no hay client o slot, no mostramos nada (evita huecos/errores)
  if (!ADSENSE_CLIENT || !adSlot) return null;

  return (
    <div className="my-4 flex justify-center">
      <ins
        className="adsbygoogle"
        style={{ display: 'block', width: '100%', maxWidth, height }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={adSlot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
