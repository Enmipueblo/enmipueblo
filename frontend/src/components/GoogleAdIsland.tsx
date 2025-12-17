import React, { useEffect, useRef } from "react";

type Props = {
  slot?: string;
  className?: string;
};

const ADS_CLIENT = import.meta.env.PUBLIC_ADSENSE_CLIENT || "";
const DEFAULT_SLOT = import.meta.env.PUBLIC_ADSENSE_SLOT_BANNER || "";

const GoogleAdIsland: React.FC<Props> = ({ slot, className = "" }) => {
  const insRef = useRef<HTMLModElement | null>(null);

  const finalSlot = slot || DEFAULT_SLOT;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!ADS_CLIENT || !finalSlot) return;

    const el = insRef.current;
    if (!el) return;

    // Evitar hacer push múltiples veces sobre el mismo <ins>
    if (el.getAttribute("data-ads-init") === "true") return;
    el.setAttribute("data-ads-init", "true");

    try {
      // @ts-ignore
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      // No lo “rompemos”: AdBlock / revisión pendiente / CMP, etc.
      console.warn("AdSense push falló (normal si aún no hay fill):", e);
    }
  }, [finalSlot]);

  // Si no está configurado aún, no renderizamos nada
  if (!ADS_CLIENT || !finalSlot) return null;

  return (
    <div className={`my-4 flex justify-center ${className}`}>
      <ins
        ref={insRef}
        className="adsbygoogle"
        style={{ display: "block", width: "100%" }}
        data-ad-client={ADS_CLIENT}
        data-ad-slot={finalSlot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
};

export default GoogleAdIsland;
