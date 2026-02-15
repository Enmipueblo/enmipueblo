import React, { useEffect, useRef, useState } from "react";

type Props = {
  slot?: string;
  className?: string;
  minHeight?: number;
  title?: string;
};

const LS_KEY = "cmp.consent.v1";

declare global {
  interface Window {
    ADSENSE_CLIENT?: string;
    __enmiAdsenseTryFill?: () => void;
  }
}

const GoogleAdIsland = ({
  slot,
  className = "",
  minHeight = 250,
  title = "Publicidad",
}: Props) => {
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

    const run = () => {
      try {
        window.__enmiAdsenseTryFill?.();
      } catch {}
    };

    run();
    const t = setTimeout(run, 1600);
    return () => clearTimeout(t);
  }, [ready, client, adSlot, adsAllowed]);

  const containerCls =
    "rounded-3xl border shadow-[0_18px_50px_-42px_rgba(0,0,0,0.35)] overflow-hidden";

  return (
    <div ref={wrapRef} className={className}>
      <div className={`${containerCls} bg-white/70 backdrop-blur`} style={{ borderColor: "var(--sb-border)" }}>
        <div className="px-5 pt-4 pb-2">
          <div className="text-[11px] tracking-wide font-semibold text-stone-500 select-none">{title}</div>
        </div>

        {!client || !adSlot ? (
          <div
            className="mx-5 mb-5 rounded-2xl border bg-white/60 flex items-center justify-center text-xs text-stone-500"
            style={{ minHeight: `${minHeight}px`, borderColor: "var(--sb-border)" }}
          >
            Espacio publicitario
          </div>
        ) : !adsAllowed ? (
          <div
            className="mx-5 mb-5 rounded-2xl border bg-white/60 flex items-center justify-center text-xs text-stone-500"
            style={{ minHeight: `${minHeight}px`, borderColor: "var(--sb-border)" }}
          >
            Anuncios desactivados (cookies)
          </div>
        ) : (
          <div className="mx-5 mb-5">
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
        )}
      </div>
    </div>
  );
};

export default GoogleAdIsland;
