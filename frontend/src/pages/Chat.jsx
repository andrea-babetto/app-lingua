import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Languages } from "lucide-react";
import { api, WS_URL } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Sidebar from "@/components/chat/Sidebar";
import ChatWindow from "@/components/chat/ChatWindow";
import NewChatDialog from "@/components/chat/NewChatDialog";
import SettingsDialog from "@/components/chat/SettingsDialog";
import InfoPanel from "@/components/chat/InfoPanel";

export default function Chat() {
  const { user, token } = useAuth();
  const nav = useNavigate();
  const [chats, setChats] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [requests, setRequests] = useState([]);
  const [typing, setTyping] = useState(null);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [mobileView, setMobileView] = useState("list"); // list | chat
  const wsRef = useRef(null);
  const bottomRef = useRef(null);
  const activeRef = useRef(null);
  const typingTimer = useRef(null);

  activeRef.current = active;

  const loadChats = useCallback(async () => {
    const { data } = await api.get("/chats");
    setChats(data);
    return data;
  }, []);

  const loadRequests = useCallback(async () => {
    const { data } = await api.get("/contacts/requests");
    setRequests(data);
  }, []);

  useEffect(() => { loadChats(); loadRequests(); }, [loadChats, loadRequests]);

  // WebSocket
  useEffect(() => {
    if (!token) return;
    const ws = new WebSocket(`${WS_URL}?token=${token}`);
    wsRef.current = ws;
    ws.onmessage = async (ev) => {
      const d = JSON.parse(ev.data);
      const cur = activeRef.current;
      if (d.type === "new_message" || d.type === "message_update") {
        if (cur && d.chat_id === cur.id) {
          setMessages((prev) => {
            const i = prev.findIndex((m) => m.id === d.message.id);
            if (i >= 0) { const c = [...prev]; c[i] = { ...c[i], ...d.message }; return c; }
            return [...prev, d.message];
          });
          if (d.message.sender_id !== user.id) api.post(`/messages/${cur.id}/read`);
        }
        loadChats();
        if (d.type === "new_message" && d.message.sender_id !== user.id && (!cur || cur.id !== d.chat_id)) {
          if (Notification?.permission === "granted") new Notification(d.message.sender_name, { body: d.message.display_text });
        }
      } else if (d.type === "typing") {
        if (cur && d.chat_id === cur.id) {
          setTyping(d.user);
          clearTimeout(typingTimer.current);
          typingTimer.current = setTimeout(() => setTyping(null), 2500);
        }
      } else if (d.type === "read_receipt") {
        if (cur && d.chat_id === cur.id && d.reader !== user.id) {
          setMessages((prev) => prev.map((m) => (m.sender_id === user.id ? { ...m, read: true } : m)));
        }
      } else if (d.type === "message_deleted") {
        if (cur && d.chat_id === cur.id) setMessages((prev) => prev.map((m) => (m.id === d.message_id ? { ...m, deleted_for_all: true } : m)));
      } else if (d.type === "contact_request") {
        toast(`${d.from.name} wants to connect`);
        loadRequests();
      } else if (d.type === "contact_accepted" || d.type === "new_chat") {
        loadChats();
      } else if (d.type === "presence") {
        loadChats();
      } else if (d.type === "chat_updated") {
        const fresh = await loadChats();
        const c = activeRef.current;
        if (c) {
          const f = fresh.find((x) => x.id === c.id);
          if (f) setActive((a) => ({ ...a, tone: f.tone, members: f.members, members_info: f.members_info, admins: f.admins }));
        }
      }
    };
    return () => ws.close();
  }, [token, user.id, loadChats, loadRequests]);

  useEffect(() => { if (Notification?.permission === "default") Notification.requestPermission(); }, []);

  const openChat = async (chat) => {
    setActive(chat);
    setMobileView("chat");
    setTyping(null);
    const { data } = await api.get(`/messages/${chat.id}`);
    setMessages(data);
    api.post(`/messages/${chat.id}/read`);
    loadChats();
  };

  const send = async ({ text, reply_to, attachment }) => {
    const reply = reply_to ? messages.find((m) => m.id === reply_to) : null;
    const { data } = await api.post("/messages", { chat_id: active.id, text, reply_to, attachment });
    if (reply) data.reply_to_preview = reply.display_text;
    setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data]));
    loadChats();
  };

  // typing emit
  const handleTyping = () => {
    if (wsRef.current?.readyState === 1 && active) {
      wsRef.current.send(JSON.stringify({ type: "typing", chat_id: active.id }));
    }
  };

  const accept = async (id) => {
    const { data } = await api.post(`/contacts/accept/${id}`);
    toast.success("Request accepted");
    loadRequests();
    await loadChats();
    if (data.chat) openChat(data.chat);
  };
  const decline = async (id) => { await api.post(`/contacts/decline/${id}`); loadRequests(); };

  const changeTone = async (tone) => {
    await api.put(`/chats/${active.id}/tone?tone=${tone}`);
    setActive((a) => ({ ...a, tone }));
    setChats((cs) => cs.map((c) => (c.id === active.id ? { ...c, tone } : c)));
    toast.success(`Translation tone: ${tone}`);
  };

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-background">
      <div className={`${mobileView === "chat" ? "hidden" : "flex"} md:flex w-full md:w-80 lg:w-96 shrink-0 border-r border-border flex-col`}>
        <Sidebar chats={chats} activeId={active?.id} onSelect={openChat} onNewChat={() => setNewChatOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)} onOpenAdmin={() => nav("/admin")}
          requests={requests} onAccept={accept} onDecline={decline} />
      </div>

      <div className={`${mobileView === "chat" ? "flex" : "hidden"} md:flex flex-1 min-w-0`} onKeyDown={handleTyping}>
        {active ? (
          <ChatWindow chat={active} messages={messages} onSend={send} onBack={() => { setMobileView("list"); setActive(null); setInfoOpen(false); }}
            typingUser={typing} onToggleInfo={() => setInfoOpen((v) => !v)} onToneChange={changeTone} bottomRef={bottomRef} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-muted/20">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Languages className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-xl font-bold">Welcome to Lingua</h2>
            <p className="text-sm text-muted-foreground max-w-xs mt-2">Select a chat or start a new one. Everyone writes in their own language — we translate the rest.</p>
          </div>
        )}
      </div>

      {infoOpen && active && (
        <InfoPanel chat={active} onClose={() => setInfoOpen(false)} onChanged={async () => {
          const fresh = await loadChats();
          const f = fresh.find((x) => x.id === active.id);
          if (f) setActive((a) => ({ ...a, members: f.members, members_info: f.members_info, admins: f.admins }));
        }} onLeft={() => { setActive(null); setInfoOpen(false); setMobileView("list"); loadChats(); }} />
      )}

      <NewChatDialog open={newChatOpen} onOpenChange={setNewChatOpen} onStartChat={(c) => { loadChats(); openChat(c); }} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
