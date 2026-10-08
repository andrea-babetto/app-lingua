// The brand: a lowercase wordmark, and a square mark with the "g" (used where only a small symbol fits).

export function LogoMark({ className = "w-9 h-9" }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden="true">
      <rect width="512" height="512" rx="112" fill="currentColor" />
      <g fill="none" stroke="#fff" strokeWidth="60" strokeLinecap="round" strokeLinejoin="round"
        transform="translate(256 256) scale(1.12) translate(-232 -273)">
        <circle cx="232" cy="226" r="92" />
        <path d="M324 226 V320 A92 92 0 0 1 152.3 366.3" />
      </g>
    </svg>
  );
}

export default function Logo({ className = "text-2xl", withMark = false, markClass = "w-8 h-8" }) {
  return (
    <span className={`inline-flex items-center gap-2 font-extrabold tracking-tight leading-none select-none ${className}`}>
      {withMark && <LogoMark className={markClass} />}
      <span data-testid="logo-wordmark">glott</span>
    </span>
  );
}
