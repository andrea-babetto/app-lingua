// The brand: the lowercase wordmark "repong" followed by two swap arrows (the message that goes,
// the reply that comes back). Colours follow docs/brand/design_handoff_repong.

// The two arrows. tone: "brand" (terracotta + sand; terracotta-light on dark), "onBrand" (white + light sand,
// for a terracotta background) or "mono" (both in the text colour). animate: the arrows swap places.
export function LogoArrows({ className = "w-5 h-5", tone = "brand", animate = false, strokeWidth = 4.6 }) {
  const top = tone === "onBrand" ? "#ffffff" : tone === "mono" ? "currentColor" : "var(--rp-arrow-top, #c2410c)";
  const bottom = tone === "onBrand" ? "#fde3a7" : tone === "mono" ? "currentColor" : "#f2b544";
  return (
    <svg viewBox="3.5 4.5 33 32" className={`rp-arrows ${animate ? "rp-swap" : ""} ${className}`} aria-hidden="true">
      <path className="rp-top" d="M6 14 H33 M26 7 L33 14 L26 21" fill="none" stroke={top}
        strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <path className="rp-bottom" d="M34 27 H7 M14 20 L7 27 L14 34" fill="none" stroke={bottom}
        strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// The app icon: a terracotta rounded square with the arrows (used where only a small symbol fits).
export function LogoMark({ className = "w-9 h-9" }) {
  return (
    <svg viewBox="0 0 1024 1024" className={className} aria-hidden="true">
      <rect width="1024" height="1024" rx="228" fill="#c2410c" />
      <g transform="translate(512 512) scale(15.5) translate(-20 -20.5)" fill="none" strokeWidth="4.6"
        strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 14 H33 M26 7 L33 14 L26 21" stroke="#ffffff" />
        <path d="M34 27 H7 M14 20 L7 27 L14 34" stroke="#fde3a7" />
      </g>
    </svg>
  );
}

export default function Logo({ className = "text-2xl", tone = "brand" }) {
  return (
    <span dir="ltr" className={`inline-flex items-center font-bold leading-none select-none ${className}`}
      style={{ letterSpacing: "-0.03em" }} aria-label="Repong">
      <span data-testid="logo-wordmark">repong</span>
      <LogoArrows tone={tone} className="h-[0.5em] w-[0.52em] ms-[0.07em] shrink-0" strokeWidth={4.6} />
    </span>
  );
}
