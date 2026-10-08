import { useEffect } from "react";

// Keeps the chat screen glued to the part of the screen that is really visible.
// On iPhone the keyboard does not resize the page: Safari scrolls it instead, and the header ends up out of sight.
// Here the screen follows the *visual* viewport (the area above the keyboard), so the header stays where it is.
export default function useAppViewport() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("chat-lock");
    const vv = window.visualViewport;
    const update = () => {
      root.style.setProperty("--app-height", `${vv ? vv.height : window.innerHeight}px`);
      root.style.setProperty("--app-top", `${vv ? vv.offsetTop : 0}px`);
      if (window.scrollY) window.scrollTo(0, 0); // the page itself never scrolls
    };
    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("orientationchange", update);
    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("orientationchange", update);
      root.classList.remove("chat-lock");
      root.style.removeProperty("--app-height");
      root.style.removeProperty("--app-top");
    };
  }, []);
}
