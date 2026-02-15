import React from "react";

type Props = {
  className?: string;
  minHeight?: number;
  title?: string;
};

export default function GoogleAdIsland({ className = "", minHeight = 140, title = "Publicidad" }: Props) {
  return (
    <div className={className}>
      <div
        className="rounded-3xl border shadow-[0_18px_50px_-42px_rgba(0,0,0,0.35)] overflow-hidden bg-white/70 backdrop-blur"
        style={{ borderColor: "var(--sb-border)" }}
      >
        <div className="px-5 pt-4 pb-2">
          <div className="text-[11px] tracking-wide font-semibold text-stone-500 select-none">{title}</div>
        </div>
        <div
          className="mx-5 mb-5 rounded-2xl border bg-white/60 flex items-center justify-center text-xs text-stone-500"
          style={{ minHeight, borderColor: "var(--sb-border)" }}
        >
          Espacio publicitario
        </div>
      </div>
    </div>
  );
}
