// frontend/src/components/GoogleAdIsland.tsx
import React, { useEffect, useRef, useState } from "react";

type Props = {
  slot?: string;
  className?: string;
  minHeight?: number; // reserva espacio visible
};

function ensureAdsenseScript(client: string) {
  try {
    if (!client) return false;

    const already = document.querySelector(
      'script[src*="pagead/js/adsbygoogle.js"]'
    );
    if (already) return true;

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
  const insRef = useRef<any>(null);

  const [ready, setReady] = useState(false);
  const [scriptOk, setScriptOk] = useState(false);

  const client =
    (typeof window !== "undefined" && (window as any).ADSENSE_CLIENT) ||
    import.meta.env.PUBLIC_ADSENSE_CLIENT ||
    "";

  const adSlot = slot || import.meta.env.PUBLIC_ADSENSE_SLOT_HOME || "";

  useEffect(() => {
    let raf = 0;
    let ro: ResizeObserver | null = null;

    const check = () => {
      const el = insRef.current || wrapRef.current;
      if (!el) return;
      const w = el.offsetWidth || 0;
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

  useEffect(() => {
    if (!client) return;
    try {
      const ok = ensureAdsenseScript(client);
      setScriptOk(ok);
      if ((window as any).adsbygoogle) setScriptOk(true);
    } catch {
      setScriptOk(false);
    }
  }, [client]);

  useEffect(() => {
    if (!ready) return;
    if (!client || !adSlot) return;
    if (!scriptOk) return;

    const ins = insRef.current as any;
    if (!ins) return;

    if (ins.dataset && ins.dataset.adLoaded === "1") return;
    if (ins.dataset) ins.dataset.adLoaded = "1";

    try {
      (window as any).adsbygoogle = (window as any).adsbygoogle || [];
      (window as any).adsbygoogle.push({});
    } catch {}
  }, [ready, client, adSlot, scriptOk]);

  if (!client || !adSlot) return null;

  return (
    <div
      ref={wrapRef}
      className={className}
      style={{ minHeight: `${minHeight}px` }}
    >
      <div className="text-[11px] text-gray-500 mb-1 select-none">Publicidad</div>
      <ins
        ref={insRef}
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
