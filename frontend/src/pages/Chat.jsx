import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api, WS_URL } from "@/lib/api";
import { syncPush } from "@/lib/push";
import { useAuth } from "@/context/AuthContext";
import Logo, { LogoMark } from "@/components/Logo";
import Sidebar from "@/components/chat/Sidebar";
import ChatWindow from "@/components/chat/ChatWindow";
import NewChatDialog from "@/components/chat/NewChatDialog";
import InfoPanel from "@/components/chat/InfoPanel";

// iOS Safari (outside an installed web app) has no Notification object at all.
const canNotify = () => typeof Notification !== "undefined";
const PING_MS = 20000;

export default function Chat() {
  const { user, token } = useAuth();
  const nav = useNavigate();
  const [chats, setChats] = useState([]);
  const [chatsLoaded, setChatsLoaded] = useState(false);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [requests, setRequests] = useState([]);
  const [typing, setTyping] = useState(null);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatTab, setNewChatTab] = useState("person");
  const [infoOpen, setInfoOpen] = useState(false);
  const [mobileView, setMobileView] = useState("list"); // list | chat
  const wsRef = useRef(null);
  const bottomRef = useRef(null);
  const activeRef = useRef(null);
  const typingTimer = useRef(null);
  const openReq = useRef(0);
  const handlers = useRef({});

  activeRef.current = active;

  const loadChats = useCallback(async () => {
    const { data } = await api.get("/chats");
    setChats(data);
    setChatsLoaded(true);
    return data;
  }, []);

  const loadRequests = useCallback(async () => {
    const { data } = await api.get("/contacts/requests");
    setRequests(data);
  }, []);

  // refetch what is on screen (after the phone slept or the connection dropped)
  const refreshActive = useCallback(async () => {
    const cur = activeRef.current;
    if (!cur) return;
    try {
      const { data } = await api.get(`/messages/${cur.id}`);
      if (activeRef.current?.id === cur.id) { setMessages(data); api.post(`/messages/${cur.id}/read`).catch(() => {}); }
    } catch { /* offline: the next attempt will do */ }
  }, []);

  useEffect(() => { loadChats().catch(() => setChatsLoaded(true)); loadRequests().catch(() => {}); syncPush(); }, [loadChats, loadRequests]);

  // ---- real-time connection: reconnects by itself, and catches up when the app comes back to the foreground
  handlers.current.onEvent = async (d) => {
    const cur = activeRef.current;
    if (d.type === "new_message" || d.type === "message_update") {
      if (cur && d.chat_id === cur.id) {
        setMessages((prev) => {
          const i = prev.findIndex((m) => m.id === d.message.id);
          if (i >= 0) { const c = [...prev]; c[i] = { ...c[i], ...d.message }; return c; }
          return [...prev, d.message];
        });
        if (d.type === "new_message" && d.message.sender_id !== user.id) api.post(`/messages/${cur.id}/read`).catch(() => {});
      }
      loadChats();
      if (d.type === "new_message" && d.message.sender_id !== user.id && (!cur || cur.id !== d.chat_id)) {
        if (canNotify() && Notification.permission === "granted") try { new Notification(d.message.sender_name, { body: d.message.display_text }); } catch { /* some mobile browsers refuse the constructor */ }
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
    } else if (d.type === "contact_accepted" || d.type === "new_chat" || d.type === "presence") {
      loadChats();
    } else if (d.type === "chat_updated") {
      const fresh = await loadChats();
      const c = activeRef.current;
      if (c) {
        const f = fresh.find((x) => x.id === c.id);
        if (f) setActive((a) => ({ ...a, members: f.members, members_info: f.members_info, admins: f.admins }));
      }
    }
  };

  useEffect(() => {
    if (!token) return undefined;
    let closed = false, attempt = 0, retryTimer = null, pingTimer = null;

    const connect = () => {
      if (closed) return;
      const ws = new WebSocket(`${WS_URL}?token=${token}`);
      wsRef.current = ws;
      ws.onopen = () => {
        const wasDown = attempt > 0;
        attempt = 0;
        clearInterval(pingTimer);
        pingTimer = setInterval(() => { if (ws.readyState === 1) ws.send(JSON.stringify({ type: "ping" })); }, PING_MS);
        if (wasDown) { loadChats().catch(() => {}); refreshActive(); }
      };
      ws.onmessage = (ev) => { try { handlers.current.onEvent(JSON.parse(ev.data)); } catch { /* ignore a bad frame */ } };
      ws.onclose = () => {
        clearInterval(pingTimer);
        if (closed || wsRef.current !== ws) return;
        const wait = Math.min(15000, 1000 * 2 ** attempt++);
        retryTimer = setTimeout(connect, wait);
      };
      ws.onerror = () => { try { ws.close(); } catch { /* already closed */ } };
    };

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const ws = wsRef.current;
      if (!ws || ws.readyState > 1) { clearTimeout(retryTimer); attempt = 0; connect(); }
      loadChats().catch(() => {});
      refreshActive();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    connect();
    return () => {
      closed = true;
      clearTimeout(retryTimer); clearInterval(pingTimer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
      const ws = wsRef.current; wsRef.current = null;
      try { ws?.close(); } catch { /* ignore */ }
    };
  }, [token, loadChats, refreshActive]);

  const openChat = useCallback(async (chat) => {
    const req = ++openReq.current;
    setActive(chat);
    setMobileView("chat");
    setTyping(null);
    setMessages([]);
    setMessagesLoading(true);
    try {
      const { data } = await api.get(`/messages/${chat.id}`);
      if (req !== openReq.current) return;
      setMessages(data);
      api.post(`/messages/${chat.id}/read`).catch(() => {});
      loadChats();
    } catch {
      if (req === openReq.current) toast.error("Could not load the messages");
    } finally {
      if (req === openReq.current) setMessagesLoading(false);
    }
  }, [loadChats]);

  // opened from a notification (app was closed: ?chat=ID, or already open: a message from the service worker)
  const openById = useCallback(async (id) => {
    if (!id) return;
    let list = chats;
    if (!list.find((c) => c.id === id)) list = await loadChats();
    const c = list.find((x) => x.id === id);
    if (c) openChat(c);
  }, [chats, loadChats, openChat]);

  useEffect(() => {
    if (!chatsLoaded) return;
    const id = new URLSearchParams(window.location.search).get("chat");
    if (id) { window.history.replaceState({}, "", window.location.pathname); openById(id); }
  }, [chatsLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return undefined;
    const onMsg = (e) => { if (e.data?.type === "open_chat") openById(e.data.chat_id); };
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
  }, [openById]);

  const send = async ({ text, reply_to, attachment }) => {
    const reply = reply_to ? messages.find((m) => m.id === reply_to) : null;
    try {
      const { data } = await api.post("/messages", { chat_id: active.id, text, reply_to, attachment });
      if (reply) data.reply_to_preview = reply.display_text;
      setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data]));
      loadChats();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Message not sent");
    }
  };

  const edit = async (id, text) => {
    const { data } = await api.put(`/messages/${id}`, { text });
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...data } : m)));
    loadChats();
  };

  const react = async (msg, emoji) => {
    try {
      const { data } = await api.post(`/messages/${msg.id}/react`, { emoji });
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, reactions: data.reactions } : m)));
    } catch { toast.error("Could not react"); }
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

  const closeActive = () => { openReq.current++; setActive(null); setInfoOpen(false); setMobileView("list"); };

  const deleteChat = async (chat) => {
    try {
      await api.post(`/chats/${chat.id}/delete`);
      if (activeRef.current?.id === chat.id) closeActive();
      await loadChats();
      toast.success("Chat deleted");
    } catch { toast.error("Could not delete the chat"); }
  };

  return (
    <div className="h-dvh w-screen flex overflow-hidden bg-background">
      <div className={`${mobileView === "chat" ? "hidden" : "flex"} md:flex w-full md:w-80 lg:w-96 shrink-0 border-r border-border flex-col`}>
        <Sidebar chats={chats} loading={!chatsLoaded} activeId={active?.id} onSelect={openChat} onNewChat={(kind) => { setNewChatTab(kind); setNewChatOpen(true); }}
          onOpenAdmin={() => nav("/admin")} onDeleteChat={deleteChat}
          requests={requests} onAccept={accept} onDecline={decline} />
      </div>

      <div className={`${mobileView === "chat" ? "flex animate-slide-in" : "hidden"} md:flex flex-1 min-w-0`} onKeyDown={handleTyping}>
        {active ? (
          <ChatWindow key={active.id} chat={active} messages={messages} loading={messagesLoading} onSend={send} onEdit={edit} onReact={react}
            onBack={closeActive} typingUser={typing} onToggleInfo={() => setInfoOpen((v) => !v)} bottomRef={bottomRef} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 chat-wallpaper">
            <LogoMark className="w-20 h-20 text-primary mb-5 drop-shadow-lg" />
            <Logo className="text-3xl" />
            <p className="text-sm text-muted-foreground max-w-xs mt-3">Select a chat or start a new one. Everyone writes in their own language — we translate the rest.</p>
          </div>
        )}
      </div>

      {infoOpen && active && (
        <InfoPanel chat={active} onClose={() => setInfoOpen(false)} onChanged={async () => {
          const fresh = await loadChats();
          const f = fresh.find((x) => x.id === active.id);
          if (f) setActive((a) => ({ ...a, members: f.members, members_info: f.members_info, admins: f.admins }));
        }} onLeft={() => { closeActive(); loadChats(); }}
        onBlocked={() => { closeActive(); loadChats(); }}
        onDelete={() => deleteChat(active)} />
      )}

      <NewChatDialog open={newChatOpen} onOpenChange={setNewChatOpen} initialTab={newChatTab} onStartChat={(c) => { loadChats(); openChat(c); }} />
    </div>
  );
}
