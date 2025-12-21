// src/components/GoogleAdIsland.tsx
import React, { useEffect, useRef, useState } from "react";

type Props = {
  slot?: string;
  className?: string;
  minHeight?: number; // ✅ reserva espacio aunque Google no sirva anuncio
};

function ensureAdsenseScript(client: string) {
  try {
    if (!client) return false;

    // Si ya existe el script, listo
    const already = document.querySelector(
      'script[src*="pagead/js/adsbygoogle.js"]'
    );
    if (already) return true;

    // Inyectar como fallback (sin atributos de Astro)
    const s = document.createElement("script");
    s.async = true;
    s.src =
      "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" +
      encodeURIComponent(client);
    s.crossOrigin = "anonymous";
    document.head.appendChild(s);
    return true;
  } catch {
    return false;
  }
}

const GoogleAdIsland = ({ slot, className = "", minHeight = 250 }: Props) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const insRef = useRef<HTMLModElement | null>(null);

  const [ready, setReady] = useState(false);
  const [scriptOk, setScriptOk] = useState(false);

  const client =
    (typeof window !== "undefined" && (window as any).ADSENSE_CLIENT) ||
    import.meta.env.PUBLIC_ADSENSE_CLIENT ||
    "";

  const adSlot = slot || import.meta.env.PUBLIC_ADSENSE_SLOT_HOME || "";

  // 1) Esperar a que el <ins> tenga width > 0 (evita availableWidth=0)
  useEffect(() => {
    let raf = 0;
    let ro: ResizeObserver | null = null;

    const check = () => {
      const el = insRef.current || wrapRef.current;
      if (!el) return;

      const w = (el as any).offsetWidth || 0;
      if (w > 0) setReady(true);
    };

    check();

    const target = wrapRef.current;
    if (!target) return;

    ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(check);
    });

    ro.observe(target);

    return () => {
      cancelAnimationFrame(raf);
      if (ro && target) ro.unobserve(target);
    };
  }, []);

  // 2) Asegurar script (si ya lo inyecta Layout, esto no hace nada)
  useEffect(() => {
    if (!client) return;

    try {
      const ok = ensureAdsenseScript(client);
      setScriptOk(ok);

      // también consideramos "ok" si adsbygoogle ya existe
      if ((window as any).adsbygoogle) setScriptOk(true);
    } catch {
      setScriptOk(false);
    }
  }, [client]);

  // 3) Push SOLO una vez por <ins> (evita duplicados con ViewTransitions)
  useEffect(() => {
    if (!ready) return;
    if (!client || !adSlot) return;
    if (!scriptOk) return;

    const ins = insRef.current as any;
    if (!ins) return;

    // Si ya hicimos push para este <ins>, no repetir
    if (ins.dataset && ins.dataset.adLoaded === "1") return;

    // Marcar como intentado (aunque Google no sirva nada hasta aprobar)
    if (ins.dataset) ins.dataset.adLoaded = "1";

    try {
      (window as any).adsbygoogle = (window as any).adsbygoogle || [];
      (window as any).adsbygoogle.push({});
    } catch (e) {
      // No rompemos la página
      console.warn("Ads push failed", e);
    }
  }, [ready, client, adSlot, scriptOk]);

  // Si no hay datos, no renderiza nada
  if (!client || !adSlot) return null;

  return (
    <div
      ref={wrapRef}
      className={className}
      style={{ minHeight: `${minHeight}px` }}
    >
      <ins
        ref={insRef as any}
        className="adsbygoogle"
        style={{ display: "block", width: "100%", minHeight: `${minHeight}px` }}
        data-ad-client={client}
        data-ad-slot={adSlot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
};

export default GoogleAdIsland;
