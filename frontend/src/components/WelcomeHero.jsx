// The pictures at the top of the welcome pages: a few chats seen as you would see them (the other person's message
// already in your language), and, when someone invited you, who it is. Names are samples; the messages follow the
// interface language.
import { avatarClass, initials } from "@/lib/avatar";
import { useI18n } from "@/i18n";

function Row({ name, text, time, unread, faded }) {
  return (
    <div className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 ${faded ? "opacity-60" : "bg-background border border-border"}`}>
      <span className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold ${avatarClass(name)}`}>
        {initials(name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex justify-between gap-2"><span className="text-[13px] font-medium truncate">{name}</span><span className="text-[10px] text-subtle shrink-0">{time}</span></span>
        <span className="mt-0.5 flex items-center justify-between gap-2">
          <span className={`text-[11px] truncate ${unread ? "text-foreground" : "text-subtle"}`}>{text}</span>
          {unread > 0 && <span className="min-w-4 h-4 px-1 rounded-full bg-sand text-[10px] font-semibold text-[#1a1a1a] flex items-center justify-center shrink-0">{unread}</span>}
        </span>
      </span>
    </div>
  );
}

// A circle with chats inside, fading at the bottom.
export function WelcomePreview() {
  const { t, langName } = useI18n();
  return (
    <div data-testid="welcome-preview" aria-hidden="true" className="relative mx-auto w-full max-w-[22rem] h-[23rem]">
      <div className="absolute left-1/2 top-6 w-[21rem] h-[21rem] -translate-x-1/2 rounded-full bg-background shadow-[0_0_0_1px_var(--gl-line),0_20px_60px_rgba(0,0,0,0.05)]" />
      <div className="absolute inset-x-4 top-[4.5rem] space-y-2">
        <Row name="James Miller" time="10:24" unread={2} text={`${t("Sure! What time?")} · ${t("Translated from {language}", { language: langName("en") })}`} />
        <Row name="María López" time="09:58" text={`${t("🎤 Voice message")} · 0:12`} />
        <Row name={t("Trip to Lisbon")} time="09:12" unread={5} text={`Ana: ${t("I booked the restaurant!")}`} />
        <Row name="Kenji Tanaka" time="—" faded text={t("Thanks a lot, see you tomorrow!")} />
      </div>
      <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-b from-transparent to-background to-85%" />
    </div>
  );
}

// "Giulia invited you": the person (or the group) in the circle, with a first message in yellow.
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
