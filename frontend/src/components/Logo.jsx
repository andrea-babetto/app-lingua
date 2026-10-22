// The brand: the Glotter logo (the file from the design handoff, used as it is), the app icon and the small mark.
// The light and dark logos are both in the page; Tailwind's dark variant shows the right one.
import logoLight from "@/assets/brand/glotter-logo.svg";
import logoDark from "@/assets/brand/glotter-logo-su-scuro.svg";
import appIcon from "@/assets/brand/icon-app.svg";

// The app icon, for the big empty-state picture.
export function LogoMark({ className = "w-9 h-9" }) {
  return <img src={appIcon} alt="" aria-hidden="true" className={className} />;
}

// The mark: a ring with a tail and a dot (it means "a message that has been translated").
// It takes the text colour for the ring and the tail; the dot pulses while a message is being translated.
export function LogoArrows({ className = "w-4 h-4", animate = false }) {
  return (
    <svg viewBox="0 0 24 24" className={`text-primary dark:text-primary shrink-0 ${className}`} aria-hidden="true">
      <circle cx="12" cy="11.2" r="9" fill="none" stroke="currentColor" strokeWidth="3.8" />
      <path d="M4.4 15.8 L2.4 22.4 L9.4 19.6 Z" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
      <circle className={`fill-[#ffcc1e] dark:fill-white ${animate ? "gl-pulse" : ""}`} cx="12" cy="11.2" r="2.6" />
    </svg>
  );
}

// height: the logo's height in pixels (the design's sizes: 29 in the header, 44 on the sign-in page).
export default function Logo({ height = 29, className = "" }) {
  return (
    <span className={`inline-flex items-center select-none ${className}`}>
      <img src={logoLight} alt="Glotter" data-testid="logo-wordmark" style={{ height }} className="w-auto block dark:hidden" />
      <img src={logoDark} alt="Glotter" style={{ height }} className="w-auto hidden dark:block" />
    </span>
  );
}
