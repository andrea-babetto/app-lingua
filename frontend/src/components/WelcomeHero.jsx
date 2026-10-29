// The pictures of the welcome pages: a phone with a chat seen as you would see it (the other person's messages already
// in your language), and, when someone invited you, who it is. Names are samples; the messages follow the interface language.
import { avatarClass, initials } from "@/lib/avatar";
import { useI18n } from "@/i18n";

// The phone at the bottom of the presentation: a chat with James, his messages already in your language, and he is typing.
export function WelcomePreview() {
  const { t, lang, langName } = useI18n();
  const other = lang === "en" ? { name: "María", full: "María López", lang: "es" } : { name: "James", full: "James Miller", lang: "en" };
  const tr = <span className="text-[10px] text-subtle ps-1 -mt-1">{t("Translated from {language}", { language: langName(other.lang) })}</span>;
  const inB = "self-start max-w-[78%] bg-bubble-in border border-border rounded-[16px] rounded-es-[5px] px-3 py-1.5 text-[13px] leading-snug";
  const outB = "self-end max-w-[78%] bg-bubble-out text-bubble-out-foreground rounded-[16px] rounded-ee-[5px] px-3 py-1.5 text-[13px] leading-snug";
  return (
    <div data-testid="welcome-preview" aria-hidden="true" className="relative mx-auto w-[270px] h-[400px] overflow-hidden shrink-0">
      <div className="absolute inset-x-0 top-0 h-[560px] rounded-[46px] bg-[#1a1a1a] p-[9px] shadow-[0_30px_60px_rgba(0,0,0,0.14)]">
        <div className="w-full h-full rounded-[38px] bg-card overflow-hidden flex flex-col">
          <div className="flex justify-center pt-2.5"><span className="w-[80px] h-[22px] rounded-full bg-black" /></div>
          <div className="flex items-center justify-center gap-2 pt-2.5 pb-2 border-b border-[var(--gl-line)]">
            <span className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold ${avatarClass(other.name)}`}>{initials(other.full)}</span>
            <span className="text-[12.5px] font-medium">{other.name}</span>
          </div>
          <div className="flex-1 chat-wallpaper flex flex-col gap-1.5 px-3 py-2.5">
            <span className={inB}>{t("Hi! I just arrived in Milan.")}</span>{tr}
            <span className={outB}>{t("Welcome! See you tonight?")}</span>
            <span className={inB}>{t("Sure! What time?")}</span>{tr}
            <span className={outB}>{t("At eight in front of the Duomo.")}</span>
            <span className="self-start h-8 px-3 flex items-center gap-1 bg-bubble-in border border-border rounded-[16px] rounded-es-[5px]">
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-sand" /><span className="typing-dot w-1.5 h-1.5 rounded-full bg-sand" /><span className="typing-dot w-1.5 h-1.5 rounded-full bg-sand" />
            </span>
            <span className="text-[10px] text-subtle ps-1 -mt-1">{t("typing in {language}", { language: langName(other.lang) })}…</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// "Giulia invited you": the person (or the group) in the circle, with a first message in my bubble colour.
export function InvitePreview({ invite }) {
  const { t, langName } = useI18n();
  const person = invite.kind === "person";
  return (
    <div data-testid="invite-banner" className="relative mx-auto w-full max-w-[22rem] h-[21rem] flex flex-col items-center justify-center text-center">
      <div aria-hidden="true" className="absolute left-1/2 top-0 w-[21rem] h-[21rem] -translate-x-1/2 rounded-full bg-background shadow-[0_0_0_1px_var(--gl-line),0_20px_60px_rgba(0,0,0,0.05)]" />
      <span className={`relative w-[6.5rem] h-[6.5rem] rounded-full overflow-hidden flex items-center justify-center text-3xl font-semibold ${person ? avatarClass(invite.name) : "bg-surface"}`}>
        {person && invite.avatar ? <img src={invite.avatar} alt="" className="w-full h-full object-cover" /> : person ? initials(invite.name) : (invite.emoji || "👥")}
      </span>
      <span className="relative mt-3.5 text-lg font-medium">{invite.name}</span>
      {person && invite.language && <span className="relative mt-1 text-[13px] text-subtle">{langName(invite.language)}</span>}
      {person && <span className="relative mt-4 rounded-[16px] rounded-ee-[4px] bg-bubble-out text-bubble-out-foreground px-3.5 py-2 text-[13px]">{t("Hi! I'm waiting for you on Glotter")}</span>}
    </div>
  );
}
