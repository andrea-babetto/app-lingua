import { useEffect, useRef } from "react";

const GSI_SRC = "https://accounts.google.com/gsi/client";
let gsiPromise = null;

function loadGsi() {
  if (!gsiPromise) {
    gsiPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = GSI_SRC;
      s.async = true;
      s.onload = resolve;
      s.onerror = () => { gsiPromise = null; reject(new Error("Google script failed to load")); };
      document.head.appendChild(s);
    });
  }
  return gsiPromise;
}

/** Google's own "Continue with Google" button (Google Identity Services). Calls onCredential(idToken). */
export default function GoogleSignIn({ clientId, onCredential }) {
  const box = useRef(null);
  const cb = useRef(onCredential);
  cb.current = onCredential;

  useEffect(() => {
    let cancelled = false;
    loadGsi()
      .then(() => {
        if (cancelled || !box.current || !window.google?.accounts?.id) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (resp) => resp?.credential && cb.current(resp.credential),
        });
        window.google.accounts.id.renderButton(box.current, {
          theme: "outline", size: "large", text: "continue_with", shape: "rectangular", width: 320,
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [clientId]);

  return <div ref={box} data-testid="google-signin-button" className="flex justify-center min-h-10" />;
}
