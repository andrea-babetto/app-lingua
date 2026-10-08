import axios from "axios";

// Empty REACT_APP_BACKEND_URL = the API lives on the same origin as the page.
const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || window.location.origin).replace(/\/$/, "");
export const API = `${BACKEND_URL}/api`;
export const WS_URL = BACKEND_URL.replace(/^http/, "ws") + "/api/ws";

export const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("lingua_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// A token that no longer works (for example after the password was changed elsewhere): back to the sign-in page.
api.interceptors.response.use((r) => r, (error) => {
  const url = error.config?.url || "";
  if (error.response?.status === 401 && localStorage.getItem("lingua_token") && !url.includes("/auth/login") && !url.includes("/auth/register") && !url.includes("/auth/google")) {
    localStorage.removeItem("lingua_token");
    window.location.assign("/");
  }
  return Promise.reject(error);
});

export function errText(detail) {
  if (detail == null) return "Something went wrong.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((e) => e?.msg || JSON.stringify(e)).join(" ");
  if (detail?.msg) return detail.msg;
  return String(detail);
}
