import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { I18nProvider } from "@/i18n";
import Login from "@/pages/Login";
import Onboarding from "@/pages/Onboarding";
import Chat from "@/pages/Chat";
import Admin from "@/pages/Admin";
import Legal from "@/pages/Legal";
import "@/App.css";

function Gate() {
  const { user } = useAuth();
  // public pages: readable without an account, even while the sign-in check is running
  const { pathname: path } = useLocation();
  if (path === "/privacy" || path === "/terms") {
    return (
      <Routes>
        <Route path="/privacy" element={<Legal kind="privacy" />} />
        <Route path="/terms" element={<Legal kind="terms" />} />
      </Routes>
    );
  }
  if (user === null) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
      <Route path="/onboarding" element={!user ? <Navigate to="/login" /> : <Onboarding />} />
      <Route path="/admin" element={!user ? <Navigate to="/login" /> : <Admin />} />
      <Route
        path="/"
        element={!user ? <Navigate to="/login" /> : !user.language ? <Navigate to="/onboarding" /> : <Chat />}
      />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <I18nProvider>
          <BrowserRouter>
            <Gate />
            <Toaster position="top-center" richColors />
          </BrowserRouter>
        </I18nProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
