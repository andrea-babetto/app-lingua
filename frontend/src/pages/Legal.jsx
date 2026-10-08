import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Logo from "@/components/Logo";
import { useI18n } from "@/i18n";

// DRAFT texts, to be checked by a lawyer before the app is opened to the public.
// The operator's name and contact come from the build settings (VITE_LEGAL_NAME, VITE_LEGAL_EMAIL).
const NAME = import.meta.env.VITE_LEGAL_NAME || "[operator name]";
const EMAIL = import.meta.env.VITE_LEGAL_EMAIL || "[contact email]";
const UPDATED = { en: "Last updated: 8 October 2026", it: "Ultimo aggiornamento: 8 ottobre 2026" };

const PRIVACY = {
  en: {
    title: "Privacy Policy",
    sections: [
      ["Who we are", [`glott is a chat where everyone writes and reads in their own language. The data controller is ${NAME}. You can contact us at ${EMAIL}.`]],
      ["What we collect", [
        "Account: name, email, username, password (stored only as a one-way hash), language, profile photo, and optionally a phone number.",
        "Content: the messages, photos and files you send, reactions, your personal glossary, your settings and the people you chat with.",
        "Technical: your IP address (used for security and to limit abuse), and, if you turn notifications on, the address of your device's push service.",
      ]],
      ["Why we use it", [
        "To run the service you asked for: create your account, deliver and translate messages, show them to the other people in the chat (contract).",
        "To keep the service safe and prevent abuse, and to handle reports (legitimate interest).",
        "To send notifications, only if you switch them on (consent, which you can withdraw in Profile at any time).",
      ]],
      ["Automatic translation", [
        "To translate a message, we send its text to Anthropic (USA), our translation provider, which processes it on our behalf. We send only the text to translate and the languages involved, not your email or profile.",
        "Messages are not end-to-end encrypted. The service operator can technically access stored messages, and does so only to handle abuse reports, keep the service secure, or comply with the law.",
        "Translations are automatic and can contain mistakes.",
      ]],
      ["Who else handles your data", [
        "Hosting and storage providers: Render (server, Frankfurt), MongoDB Atlas (database, Frankfurt) and Cloudflare (network protection and file storage). They act as our processors.",
        "Some providers, such as Anthropic, are located outside the European Union. Transfers are covered by the safeguards required by data protection law.",
        "We do not sell your data and we do not show advertising.",
      ]],
      ["How long we keep it", [
        "While your account exists. When you delete a message for everyone, it is removed. When you delete your account, your profile, the messages you wrote, your files, your notification subscriptions and your contacts are erased immediately, and your one-to-one chats are removed for both people.",
        "Reports about abuse may be kept for as long as needed to protect other users. Cached translations are not linked to you and expire after 30 days.",
      ]],
      ["Your rights", [
        `You can access and correct your data in Profile, and delete your account there (Profile → Delete account). You can also ask us at ${EMAIL} for a copy of your data, to restrict or object to its use, or to move it elsewhere.`,
        "You can complain to your data protection authority (in Italy: Garante per la protezione dei dati personali, www.garanteprivacy.it).",
      ]],
      ["Cookies and storage", ["We do not use advertising or tracking cookies. The app stores on your device only what it needs to work: your sign-in, your language and theme, and unsent drafts."]],
      ["Children", ["glott is not intended for people under 16. If you think a child has created an account, write to us and we will delete it."]],
      ["Changes", ["We may update this policy. The date above shows the latest version; for important changes we will tell you in the app."]],
    ],
  },
  it: {
    title: "Informativa sulla privacy",
    sections: [
      ["Chi siamo", [`glott è una chat in cui ognuno scrive e legge nella propria lingua. Il titolare del trattamento è ${NAME}. Puoi contattarci a ${EMAIL}.`]],
      ["Quali dati raccogliamo", [
        "Account: nome, email, nome utente, password (conservata solo come impronta non reversibile), lingua, foto del profilo ed eventualmente un numero di telefono.",
        "Contenuti: i messaggi, le foto e i file che invii, le reazioni, il tuo glossario personale, le impostazioni e le persone con cui chatti.",
        "Tecnici: il tuo indirizzo IP (per la sicurezza e per limitare gli abusi) e, se attivi le notifiche, l'indirizzo del servizio di notifiche del tuo dispositivo.",
      ]],
      ["Perché li usiamo", [
        "Per offrirti il servizio richiesto: creare l'account, consegnare e tradurre i messaggi, mostrarli alle altre persone della chat (contratto).",
        "Per mantenere il servizio sicuro, prevenire abusi e gestire le segnalazioni (legittimo interesse).",
        "Per inviare notifiche, solo se le attivi (consenso, che puoi revocare in ogni momento dal Profilo).",
      ]],
      ["Traduzione automatica", [
        "Per tradurre un messaggio inviamo il testo ad Anthropic (USA), il nostro fornitore di traduzione, che lo tratta per nostro conto. Inviamo solo il testo da tradurre e le lingue coinvolte, non la tua email né il tuo profilo.",
        "I messaggi non sono cifrati end-to-end. Chi gestisce il servizio può tecnicamente accedere ai messaggi conservati, e lo fa solo per gestire segnalazioni di abuso, mantenere il servizio sicuro o rispettare la legge.",
        "Le traduzioni sono automatiche e possono contenere errori.",
      ]],
      ["Chi altro tratta i tuoi dati", [
        "Fornitori di hosting e archiviazione: Render (server, Francoforte), MongoDB Atlas (database, Francoforte) e Cloudflare (protezione della rete e archiviazione dei file). Agiscono come nostri responsabili del trattamento.",
        "Alcuni fornitori, come Anthropic, si trovano fuori dall'Unione Europea. I trasferimenti sono coperti dalle garanzie previste dalla normativa sulla protezione dei dati.",
        "Non vendiamo i tuoi dati e non mostriamo pubblicità.",
      ]],
      ["Per quanto tempo li conserviamo", [
        "Finché esiste il tuo account. Se elimini un messaggio per tutti, viene rimosso. Quando elimini l'account, il profilo, i messaggi che hai scritto, i tuoi file, le iscrizioni alle notifiche e i contatti vengono cancellati subito, e le chat uno-a-uno vengono rimosse per entrambe le persone.",
        "Le segnalazioni di abuso possono essere conservate per il tempo necessario a proteggere gli altri utenti. Le traduzioni in memoria temporanea non sono collegate a te e scadono dopo 30 giorni.",
      ]],
      ["I tuoi diritti", [
        `Puoi vedere e correggere i tuoi dati nel Profilo e cancellare l'account da lì (Profilo → Elimina account). Puoi anche chiederci a ${EMAIL} una copia dei dati, la limitazione o l'opposizione al trattamento, o il trasferimento ad altro servizio.`,
        "Puoi presentare reclamo all'autorità per la protezione dei dati (in Italia: Garante per la protezione dei dati personali, www.garanteprivacy.it).",
      ]],
      ["Cookie e archiviazione", ["Non usiamo cookie pubblicitari né di tracciamento. L'app salva sul tuo dispositivo solo ciò che serve per funzionare: l'accesso, la lingua e il tema, e le bozze non inviate."]],
      ["Minori", ["glott non è destinato a persone sotto i 16 anni. Se pensi che un minore abbia creato un account, scrivici e lo cancelleremo."]],
      ["Modifiche", ["Possiamo aggiornare questa informativa. La data qui sopra indica l'ultima versione; per le modifiche importanti ti avviseremo nell'app."]],
    ],
  },
};

const TERMS = {
  en: {
    title: "Terms of Service",
    sections: [
      ["The service", [`glott is a chat service that translates messages automatically between languages. It is provided by ${NAME} ("we"). It is currently in a closed beta and may change or be interrupted.`]],
      ["Your account", [
        "You must be at least 16 years old. Give correct information and keep your password secret. You are responsible for what happens under your account.",
        "Registration may require an invite code. You can delete your account at any time from Profile.",
      ]],
      ["How to use it", [
        "Do not use glott for anything illegal, to harass, threaten or defraud anyone, to send spam or malware, to share content that exploits minors, or to impersonate others.",
        "You can block and report other users. We may remove content or suspend accounts that break these rules.",
      ]],
      ["Your content", [
        "You keep the rights to what you write and send. You give us the permission needed to store it, translate it and show it to the people you chat with, only to run the service.",
        "You are responsible for your messages and files and for having the right to share them.",
      ]],
      ["Automatic translation", ["Translations are produced by software and may be wrong or incomplete. Do not rely on them for medical, legal, financial or other important decisions without checking."]],
      ["No guarantee, limited liability", ["The service is provided \"as is\", without guarantees of availability or accuracy. To the extent allowed by law, we are not liable for indirect damages or loss of data. Nothing here limits rights you have by law as a consumer."]],
      ["Ending", ["You can stop using glott and delete your account at any time. We may suspend or close accounts that break these terms or put others at risk."]],
      ["Changes and law", [`We may update these terms; the date above shows the latest version. These terms are governed by Italian law, without removing the protection that mandatory rules of your country give you as a consumer. Questions: ${EMAIL}.`]],
    ],
  },
  it: {
    title: "Termini di servizio",
    sections: [
      ["Il servizio", [`glott è un servizio di chat che traduce automaticamente i messaggi tra lingue diverse. È offerto da ${NAME} ("noi"). Al momento è in beta chiusa e può cambiare o interrompersi.`]],
      ["Il tuo account", [
        "Devi avere almeno 16 anni. Fornisci informazioni corrette e tieni segreta la password. Sei responsabile di ciò che avviene con il tuo account.",
        "La registrazione può richiedere un codice d'invito. Puoi eliminare l'account in qualsiasi momento dal Profilo.",
      ]],
      ["Come usarlo", [
        "Non usare glott per attività illegali, per molestare, minacciare o truffare qualcuno, per inviare spam o malware, per condividere contenuti che sfruttano minori o per impersonare altri.",
        "Puoi bloccare e segnalare altri utenti. Possiamo rimuovere contenuti o sospendere account che violano queste regole.",
      ]],
      ["I tuoi contenuti", [
        "Conservi i diritti su ciò che scrivi e invii. Ci dai il permesso necessario per conservarlo, tradurlo e mostrarlo alle persone con cui chatti, solo per far funzionare il servizio.",
        "Sei responsabile dei tuoi messaggi e file e di avere il diritto di condividerli.",
      ]],
      ["Traduzione automatica", ["Le traduzioni sono prodotte da un software e possono essere sbagliate o incomplete. Non farci affidamento per decisioni mediche, legali, finanziarie o importanti senza verificare."]],
      ["Nessuna garanzia, responsabilità limitata", ["Il servizio è fornito \"così com'è\", senza garanzie di disponibilità o accuratezza. Nei limiti consentiti dalla legge, non rispondiamo di danni indiretti o perdita di dati. Nulla qui limita i diritti che hai per legge come consumatore."]],
      ["Chiusura", ["Puoi smettere di usare glott ed eliminare l'account in qualsiasi momento. Possiamo sospendere o chiudere gli account che violano questi termini o mettono a rischio altre persone."]],
      ["Modifiche e legge applicabile", [`Possiamo aggiornare questi termini; la data qui sopra indica l'ultima versione. Si applica la legge italiana, senza togliere la tutela che le norme inderogabili del tuo Paese ti danno come consumatore. Domande: ${EMAIL}.`]],
    ],
  },
};

export default function Legal({ kind }) {
  const { lang, t } = useI18n();
  const l = lang === "it" ? "it" : "en";
  const doc = (kind === "terms" ? TERMS : PRIVACY)[l];
  return (
    <div className="min-h-dvh bg-background">
      <header className="h-14 px-4 flex items-center gap-3 bg-primary text-primary-foreground">
        <Link to="/" aria-label={t("Back")} className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/15"><ArrowLeft className="w-6 h-6 rtl:rotate-180" /></Link>
        <Logo className="text-[26px]" />
      </header>
      <main className="max-w-2xl mx-auto px-5 py-8" data-testid={`legal-${kind}`}>
        <h1 className="text-3xl font-extrabold tracking-tight">{doc.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{UPDATED[l]}</p>
        {l === "en" && lang !== "en" && <p className="text-sm mt-3 rounded-lg bg-accent text-accent-foreground px-3 py-2">This page is available in English and Italian.</p>}
        <div className="mt-6 space-y-6">
          {doc.sections.map(([h, ps]) => (
            <section key={h}>
              <h2 className="text-lg font-bold">{h}</h2>
              <div className="mt-2 space-y-2 text-[15px] leading-relaxed text-foreground/90">{ps.map((p) => <p key={p}>{p}</p>)}</div>
            </section>
          ))}
        </div>
        <p className="mt-10 text-sm text-muted-foreground">
          <Link className="text-primary font-semibold" to={kind === "terms" ? "/privacy" : "/terms"}>{kind === "terms" ? (l === "it" ? "Informativa sulla privacy" : "Privacy Policy") : (l === "it" ? "Termini di servizio" : "Terms of Service")}</Link>
        </p>
      </main>
    </div>
  );
}
