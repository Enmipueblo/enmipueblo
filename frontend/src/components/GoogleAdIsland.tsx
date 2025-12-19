// src/components/GoogleAdIsland.tsx
import React, { useEffect, useRef, useState } from "react";

type Props = {
  slot?: string;
  className?: string;
};

const GoogleAdIsland = ({ slot, className = "" }: Props) => {
  const insRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);

  const client =
    (typeof window !== "undefined" && (window as any).ADSENSE_CLIENT) ||
    import.meta.env.PUBLIC_ADSENSE_CLIENT ||
    "";

  const adSlot =
    slot || import.meta.env.PUBLIC_ADSENSE_SLOT_HOME || "";

  // Espera a tener width > 0 antes de push
  useEffect(() => {
    if (!insRef.current) return;

    let raf = 0;
    let ro: ResizeObserver | null = null;

    const check = () => {
      if (!insRef.current) return;
      const w = insRef.current.offsetWidth || 0;
      if (w > 0) setReady(true);
    };

    check();

    ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(check);
    });

    ro.observe(insRef.current);

    return () => {
      cancelAnimationFrame(raf);
      if (ro && insRef.current) ro.unobserve(insRef.current);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!client || !adSlot) return;

    try {
      (window as any).adsbygoogle = (window as any).adsbygoogle || [];
      (window as any).adsbygoogle.push({});
    } catch (e) {
      // no rompemos la página
      console.warn("Ads push failed", e);
    }
  }, [ready, client, adSlot]);

  if (!client || !adSlot) return null;

  return (
    <div ref={insRef} className={className}>
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={client}
        data-ad-slot={adSlot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
};

export default GoogleAdIsland;
