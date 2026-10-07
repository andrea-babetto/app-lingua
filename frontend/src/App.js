import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import Login from "@/pages/Login";
import Onboarding from "@/pages/Onboarding";
import Chat from "@/pages/Chat";
import Admin from "@/pages/Admin";
import "@/App.css";

function Gate() {
  const { user } = useAuth();
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
        <BrowserRouter>
          <Gate />
          <Toaster position="top-center" richColors />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
