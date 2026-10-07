import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null=checking, false=anon, obj=auth
  const [token, setToken] = useState(localStorage.getItem("lingua_token"));

  const loadMe = useCallback(async () => {
    const hash = window.location.hash || "";
    if (hash.includes("session_id=")) {
      const sid = new URLSearchParams(hash.replace(/^#/, "")).get("session_id");
      try {
        const { data } = await api.post("/auth/google/session", { session_id: sid });
        localStorage.setItem("lingua_token", data.token);
        setToken(data.token);
        setUser(data.user);
      } catch {
        setUser(false);
      } finally {
        window.history.replaceState(null, "", window.location.pathname);
      }
      return;
    }
    if (!localStorage.getItem("lingua_token")) {
      setUser(false);
      return;
    }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch {
      localStorage.removeItem("lingua_token");
      setUser(false);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const auth = (data) => {
    localStorage.setItem("lingua_token", data.token);
    setToken(data.token);
    setUser(data.user);
  };

  const logout = () => {
    localStorage.removeItem("lingua_token");
    setToken(null);
    setUser(false);
  };

  const updateUser = (u) => setUser(u);

  return (
    <AuthContext.Provider value={{ user, token, auth, logout, updateUser, reload: loadMe }}>
      {children}
    </AuthContext.Provider>
  );
}
