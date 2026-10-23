// Where to come back to after a full-page screen (Terms, Privacy) opened from inside the app, e.g. "profile:privacy".
const KEY = "glott_return";
export const returnTarget = () => { try { return sessionStorage.getItem(KEY) || ""; } catch { return ""; } };
export const rememberReturn = (target) => { try { sessionStorage.setItem(KEY, target); } catch { /* storage blocked */ } };
export const clearReturn = () => { try { sessionStorage.removeItem(KEY); } catch { /* storage blocked */ } };
