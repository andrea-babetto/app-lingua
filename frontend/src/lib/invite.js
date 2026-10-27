// Invite links: /?invite=<code> is a friend's link (opens a chat with them) or a group's link (asks to join).
// The code is kept until the person is signed in, so it survives the sign-up and the language choice.
import { toast } from "sonner";
import { api } from "@/lib/api";

const KEY = "glott_invite";

export function captureInvite() {
  try {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("invite");
    if (!code) return;
    localStorage.setItem(KEY, code.trim().slice(0, 64));
    url.searchParams.delete("invite");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  } catch { /* storage blocked */ }
}

export const pendingInvite = () => { try { return localStorage.getItem(KEY) || ""; } catch { return ""; } };
export const clearInvite = () => { try { localStorage.removeItem(KEY); } catch { /* storage blocked */ } };
export const inviteUrl = (code) => `${window.location.origin}/?invite=${code}`;

// Share (or copy) a link with a line of text; t is the app's translate function
export async function shareLink(url, text, t) {
  try {
    if (navigator.share) { await navigator.share({ title: "Glotter", text, url }); return; }
  } catch (e) { if (e?.name === "AbortError") return; }
  try { await navigator.clipboard.writeText(`${text} ${url}`); toast.success(t("Invite link copied")); }
  catch { toast(url); }
}

export async function shareMyInvite(t) {
  try {
    const { data } = await api.get("/me/invite");
    await shareLink(inviteUrl(data.code), t("Chat with me on Glotter: each of us writes and reads in our own language."), t);
  } catch { toast.error(t("Failed")); }
}
