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

// My own link, fetched ahead (when the chat list opens): the phone opens its share sheet only if share() is called
// straight from the tap, and waiting for the server first made Safari fall back to "link copied".
let myCode = "";
export function prefetchMyInvite() {
  if (myCode) return;
  api.get("/me/invite").then(({ data }) => { myCode = data.code || ""; }).catch(() => {});
}
export const forgetMyInvite = () => { myCode = ""; };

export async function shareMyInvite(t) {
  const text = t("Chat with me on Glotter: each of us writes and reads in our own language.");
  if (myCode) return shareLink(inviteUrl(myCode), text, t);
  try {
    const { data } = await api.get("/me/invite");
    myCode = data.code || "";
    await shareLink(inviteUrl(myCode), text, t);
  } catch { toast.error(t("Failed")); }
}
