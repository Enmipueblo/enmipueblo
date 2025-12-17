import React, { useEffect, useRef, useState } from "react";

type Props = {
  slot?: string;
  format?: string;
  fullWidthResponsive?: boolean;
  className?: string;
  style?: React.CSSProperties;
};

const CLIENT = import.meta.env.PUBLIC_ADSENSE_CLIENT as string | undefined;

const GoogleAdIsland: React.FC<Props> = ({
  slot,
  format = "auto",
  fullWidthResponsive = true,
  className = "",
  style,
}) => {
  const insRef = useRef<HTMLDivElement | null>(null);
  const [pushed, setPushed] = useState(false);

  useEffect(() => {
    if (!CLIENT) return;
    if (pushed) return;

    const el = insRef.current;
    if (!el) return;

    let ro: ResizeObserver | null = null;
    let cancelled = false;

    const tryPush = () => {
      if (cancelled) return;
      if (!insRef.current) return;

      const w = insRef.current.getBoundingClientRect().width;
      if (!w || w < 50) return; // todavía no hay ancho real

      try {
        // @ts-ignore
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        setPushed(true);
      } catch (err) {
        // Si falla por timing, reintentamos con el observer
        // console.warn("AdSense push error:", err);
      }
    };

    // Primer intento (después del layout)
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => tryPush());
      // cleanup raf2 in return
      (window as any).__enmiRaf2 = raf2;
    });

    // Observer: cuando el contenedor tenga ancho, intentamos
    ro = new ResizeObserver(() => {
      if (!pushed) tryPush();
    });
    ro.observe(el);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      const raf2 = (window as any).__enmiRaf2;
      if (raf2) cancelAnimationFrame(raf2);
      if (ro) ro.disconnect();
    };
  }, [pushed]);

  if (!CLIENT) return null;

  return (
    <div
      ref={insRef}
      className={className}
      style={{ width: "100%", minHeight: 90, ...style }}
    >
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={CLIENT}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive={fullWidthResponsive ? "true" : "false"}
      />
    </div>
  );
};

export default GoogleAdIsland;
