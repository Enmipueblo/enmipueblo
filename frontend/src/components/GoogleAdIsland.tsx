import React, { useEffect, useRef, useState } from "react";

type Props = {
  slot?: string;
  className?: string;
  minHeight?: number;
};

const LS_KEY = "cmp.consent.v1";

declare global {
  interface Window {
    ADSENSE_CLIENT?: string;
    __enmiAdsenseTryFill?: () => void;
  }
}

const GoogleAdIsland = ({ slot, className = "", minHeight = 250 }: Props) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const insRef = useRef<any>(null);

  const client =
    (typeof window !== "undefined" && (window as any).ADSENSE_CLIENT) ||
    import.meta.env.PUBLIC_ADSENSE_CLIENT ||
    "";

  const adSlot = slot || import.meta.env.PUBLIC_ADSENSE_SLOT_HOME || "";

  const [ready, setReady] = useState(false);
  const [adsAllowed, setAdsAllowed] = useState(false);

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
    const read = () => {
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return false;
        const st = JSON.parse(raw);
        return !!st?.ads;
      } catch {
        return false;
      }
    };

    setAdsAllowed(read());

    const onCmp = (ev: any) => {
      const st = ev?.detail?.consent;
      if (st && typeof st.ads === "boolean") setAdsAllowed(st.ads);
      else setAdsAllowed(read());
    };

    window.addEventListener("enmi:cmp", onCmp as any);
    return () => window.removeEventListener("enmi:cmp", onCmp as any);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!client || !adSlot) return;
    if (!adsAllowed) return;

    // en vez de push directo (que te daba TagError), pedimos al “rellenador inteligente”
    const run = () => {
      try {
        window.__enmiAdsenseTryFill?.();
      } catch {}
    };

    run();
    const t = setTimeout(run, 1600);

    return () => clearTimeout(t);
  }, [ready, client, adSlot, adsAllowed]);

  if (!client || !adSlot) return null;

  return (
    <div ref={wrapRef} className={className} style={{ minHeight: `${minHeight}px` }}>
      <div className="text-[11px] text-gray-500 mb-1 select-none">Publicidad</div>

      {!adsAllowed ? (
        <div
          className="w-full rounded-xl border border-gray-200 bg-white/60 flex items-center justify-center text-xs text-gray-500"
          style={{ minHeight: `${minHeight}px` }}
        >
          Anuncios desactivados (cookies)
        </div>
      ) : (
        <ins
          ref={insRef}
          className="adsbygoogle"
          style={{ display: "block", width: "100%", minHeight: `${minHeight}px` }}
          data-ad-client={client}
          data-ad-slot={adSlot}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      )}
    </div>
  );
};

export default GoogleAdIsland;
