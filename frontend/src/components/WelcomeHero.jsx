// The photos at the top of the sign-in pages: someone in Italy writes, someone in India reads, and the message crosses
// the line between them already translated. The two sentences are samples, not interface text (they are not translated).
// Photos: diana.grytsku on Freepik (free licence, credit required: the small line on the photo).
import { useState } from "react";
import { MapPin, Repeat2 } from "lucide-react";
import Logo from "@/components/Logo";
import { useI18n } from "@/i18n";
import { avatarClass } from "@/lib/avatar";

const PHOTOS = [
  { src: "/welcome/italia.jpg", place: "Milano · 10:30", tint: "from-[#8a7a63] to-[#5c4f40]" },
  { src: "/welcome/india.jpg", place: "Mumbai · 15:00", tint: "from-[#6f5a43] to-[#3e3226]" },
];
const CREDIT = "Foto: diana.grytsku / Freepik";

function Photo({ photo, className = "" }) {
  const [ok, setOk] = useState(true);
  return (
    <div className={`relative overflow-hidden bg-gradient-to-br ${photo.tint} ${className}`}>
      {ok && <img src={photo.src} alt="" className="absolute inset-0 w-full h-full object-cover" onError={() => setOk(false)} />}
    </div>
  );
}

function Place({ text, className = "" }) {
  return (
    <span className={`absolute inline-flex items-center gap-1.5 rounded-full bg-[#231f1a]/60 px-2.5 py-1 text-[13px] text-[#f8f4e9] backdrop-blur-sm ${className}`}>
      <MapPin className="w-3.5 h-3.5" aria-hidden="true" /> {text}
    </span>
  );
}

// Full screen: the first thing people see. `children` is the sheet at the bottom (title, buttons).
export function WelcomeHero({ languageMenu, children }) {
  const { t } = useI18n();
  return (
    <div className="min-h-dvh bg-[#231f1a] flex justify-center">
      <div className="relative w-full max-w-md min-h-dvh flex flex-col" data-testid="welcome-page">
        <div className="relative flex-1 min-h-[24rem] flex flex-col">
          <div className="relative flex-1">
            <Photo photo={PHOTOS[0]} className="absolute inset-0" />
            <Place text={PHOTOS[0].place} className="start-5 bottom-3" />
          </div>
          <div className="relative flex-1 border-t-2 border-[#faf7f0]">
            <Photo photo={PHOTOS[1]} className="absolute inset-0" />
            <Place text={PHOTOS[1].place} className="end-5 bottom-10" />
          </div>
          <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/45 to-transparent pointer-events-none" />
          <div className="absolute inset-x-5 top-5 flex items-center justify-between">
            <Logo height={34} onDark />
            {languageMenu}
          </div>
          <div className="absolute inset-x-5 bottom-1/2 mb-14 flex justify-end pointer-events-none">
            <p lang="it" className="max-w-[16rem] rounded-[18px] rounded-ee-md bg-[#3b3832] text-[#f8f4e9] px-3.5 py-2.5 text-[15px] leading-snug shadow-lg">Ciao Hamad! Com'è il tempo a Mumbai oggi?</p>
          </div>
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center pointer-events-none">
            <span data-testid="welcome-distance" className="inline-flex items-center gap-1.5 rounded-full bg-[#faf7f0] text-[#2a3d22] px-3 py-1 text-xs font-semibold shadow-md">
              <Repeat2 className="w-3.5 h-3.5 text-[#5f8a51]" aria-hidden="true" /> {t("6,300 km · translated in an instant")}
            </span>
          </div>
          <div className="absolute inset-x-5 top-1/2 mt-7 flex pointer-events-none">
            <p lang="hi" dir="ltr" className="max-w-[17rem] rounded-[18px] rounded-es-md bg-[#faf7f0] text-[#2b2823] px-3.5 py-2.5 text-[15px] leading-relaxed shadow-lg">नमस्ते हमद! आज मुंबई में मौसम कैसा है?</p>
          </div>
          <span className="absolute end-3 bottom-9 text-[10px] text-[#f8f4e9]/70">{CREDIT}</span>
        </div>
        <div className="relative -mt-7 rounded-t-[28px] bg-background text-foreground px-6 pt-7 pb-8">{children}</div>
      </div>
    </div>
  );
}

// Short version on top of the forms (sign in, sign up, forgot password). With an invite it shows who invited you.
export function FormHero({ top, title, invite }) {
  const { t, langName } = useI18n();
  const person = invite?.kind === "person";
  return (
    <div className={`relative ${invite ? "h-[17rem]" : "h-56"} shrink-0 flex text-[#f8f4e9]`}>
      <Photo photo={PHOTOS[0]} className="flex-1" />
      <Photo photo={PHOTOS[1]} className="flex-1 border-s-2 border-[#faf7f0]" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/25 to-black/60" />
      <div className="absolute inset-x-5 top-5 flex items-center justify-between">{top}</div>
      {invite ? (
        <div data-testid="invite-banner" className="absolute inset-x-5 bottom-11 flex flex-col items-center text-center gap-2">
          <span className={`w-16 h-16 rounded-full overflow-hidden border-[3px] border-[#faf7f0] flex items-center justify-center text-xl font-bold shadow-lg ${person ? avatarClass(invite.name) : "bg-card text-foreground"}`}>
            {person && invite.avatar ? <img src={invite.avatar} alt="" className="w-full h-full object-cover" /> : person ? (invite.name || "?").slice(0, 2).toUpperCase() : (invite.emoji || "👥")}
          </span>
          <span className="text-[21px] font-bold leading-tight">{person ? t("{name} invited you to Glotter", { name: invite.name }) : t("You are invited to the group {name}", { name: invite.name })}</span>
          <span className="text-[13px] leading-snug opacity-90">
            {person
              ? (invite.language ? t("{name} writes in {language}, you read in yours.", { name: invite.name, language: langName(invite.language) }) : t("Create your account and you will find {name} in your chats.", { name: invite.name }))
              : t("After you sign up, an admin of the group will let you in.")}
          </span>
        </div>
      ) : (
        <h1 data-testid="auth-title" className="absolute inset-x-5 bottom-11 text-[28px] font-bold leading-tight tracking-tight">{title}</h1>
      )}
      <span className="absolute end-3 bottom-8 text-[10px] text-[#f8f4e9]/70">{CREDIT}</span>
    </div>
  );
}
