// src/components/GoogleAdIsland.tsx
import React, { useEffect, useRef, useState } from "react";

type Props = {
  slot?: string;
  className?: string;
  delayMs?: number; // delay suave antes de cargar script/push
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

const GoogleAdIsland = ({ slot, className = "", delayMs = 1500 }: Props) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const insRef = useRef<HTMLModElement | null>(null);

  const [ready, setReady] = useState(false);
  const [inView, setInView] = useState(false);
  const [scriptOk, setScriptOk] = useState(false);

  const client =
    (typeof window !== "undefined" && (window as any).ADSENSE_CLIENT) ||
    import.meta.env.PUBLIC_ADSENSE_CLIENT ||
    "";

  const adSlot = slot || import.meta.env.PUBLIC_ADSENSE_SLOT_HOME || "";

  // 1) Esperar width > 0
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

  // 2) Solo activar cuando esté cerca de viewport (reduce impacto en LCP)
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (e && e.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin: "250px 0px" }
    );

    io.observe(el);
    return () => io.disconnect();
  }, []);

  // 3) Cargar script con delay suave y en idle
  useEffect(() => {
    if (!client) return;
    if (!inView) return;

    if ((window as any).adsbygoogle) {
      setScriptOk(true);
      return;
    }

    const run = () => {
      try {
        const ok = ensureAdsenseScript(client);
        setScriptOk(ok);
        if ((window as any).adsbygoogle) setScriptOk(true);
      } catch {
        setScriptOk(false);
      }
    };

    let t: any;

    const start = () => {
      t = setTimeout(run, Math.max(0, delayMs));
    };

    if ("requestIdleCallback" in window) {
      (window as any).requestIdleCallback(start, { timeout: 2000 });
    } else {
      start();
    }

    return () => clearTimeout(t);
  }, [client, inView, delayMs]);

  // 4) Push solo una vez por <ins>
  useEffect(() => {
    if (!ready) return;
    if (!inView) return;
    if (!client || !adSlot) return;
    if (!scriptOk) return;

    const ins = insRef.current as any;
    if (!ins) return;

    if (ins.dataset && ins.dataset.adLoaded === "1") return;
    if (ins.dataset) ins.dataset.adLoaded = "1";

    try {
      (window as any).adsbygoogle = (window as any).adsbygoogle || [];
      (window as any).adsbygoogle.push({});
    } catch (e) {
      console.warn("Ads push failed", e);
    }
  }, [ready, inView, client, adSlot, scriptOk]);

  if (!client || !adSlot) return null;

  return (
    <div ref={wrapRef} className={className}>
      <ins
        ref={insRef as any}
        className="adsbygoogle"
        style={{ display: "block", width: "100%" }}
        data-ad-client={client}
        data-ad-slot={adSlot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
};

export default GoogleAdIsland;
