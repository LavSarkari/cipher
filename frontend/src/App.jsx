import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Bell,
  ChevronLeft,
  Fingerprint,
  Globe,
  Info,
  Key,
  Loader2,
  LogOut,
  MessageSquare,
  Plus,
  Search,
  Send,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  User as UserIcon,
  UserMinus,
  UserPlus,
  Users as GroupsIcon,
  X
} from "lucide-react";
import { api } from "./lib/api";
import { decryptMessage, encryptMessage } from "./crypto/e2ee";

const AI_USER = { id: "ai-999", username: "Gemini AI", isAI: true };
const NOTIFICATION_PREFS_KEY = "vault_notification_prefs";
const DEFAULT_NOTIFICATION_PREFS = {
  messages: true,
  friendRequests: true,
  groupRequests: true,
  sounds: true
};

const chatIdFor = (a, b) => [a, b].sort().join(":");
const groupChatIdFor = (groupId) => `group:${groupId}`;
const garbageFromCipher = (ciphertext = "") =>
  (ciphertext || "X9aQ2kLmP0rT7wY1nV8b").slice(0, 24).match(/.{1,4}/g)?.join("-") || "X9aQ-2kLm";

const KeyModal = ({ title, onClose, onSubmit }) => {
  const [value, setValue] = useState("");
  return (
    <div className="absolute inset-0 z-50 bg-black/95 backdrop-blur-3xl flex items-center justify-center p-6 animate-in fade-in duration-500">
      <div className="bg-white/[0.03] border border-white/10 p-10 rounded-[3rem] w-full max-w-[320px] text-center space-y-8 shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 blur-3xl pointer-events-none" />
        <div className="w-20 h-20 bg-amber-500/10 rounded-[2rem] flex items-center justify-center mx-auto border border-amber-500/20 shadow-inner group-hover:scale-110 transition-transform duration-500">
          <Key className="text-amber-500/80" size={32} strokeWidth={1.5} />
        </div>
        <div className="space-y-2">
          <h3 className="text-[10px] font-black uppercase tracking-[0.5em] text-white/40">{title}</h3>
          <p className="text-[8px] text-amber-500/50 uppercase font-bold tracking-widest">Verification Required</p>
        </div>
        <input
          className="w-full bg-white/[0.03] border border-white/5 p-5 rounded-2xl outline-none text-center text-sm font-medium tracking-[0.2em] focus:border-amber-500/30 focus:bg-white/[0.05] transition-all duration-300 placeholder:text-white/5"
          type="password"
          autoFocus
          placeholder="••••••••"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSubmit(value);
            if (e.key === "Escape") onClose();
          }}
        />
        <div className="flex flex-col gap-3">
          <button
            onClick={() => onSubmit(value)}
            className="w-full bg-amber-600 rounded-2xl text-[10px] uppercase tracking-widest font-black py-4 hover:bg-amber-500 transition-all duration-300 shadow-lg shadow-amber-600/10 active:scale-95"
          >
            Unlock Protocol
          </button>
          <button
            onClick={onClose}
            className="w-full text-[9px] uppercase tracking-widest font-black text-white/20 hover:text-white/40 transition-colors py-2"
          >
            Abort
          </button>
        </div>
      </div>
    </div>
  );
};

const ChatContainer = ({ activeChat, me, onBack, onRemoveFriend }) => {
  const [rawMessages, setRawMessages] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [chatKey, setChatKey] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const scrollRef = useRef(null);

  const chatId = useMemo(() => chatIdFor(me.id, activeChat.id), [me.id, activeChat.id]);

  useEffect(() => {
    if (activeChat.isAI) {
      const stored = localStorage.getItem(`vault_ai_${me.id}`) || "[]";
      try {
        setRawMessages(JSON.parse(stored));
      } catch {
        setRawMessages([]);
      }
      return;
    }

    let stopped = false;
    const load = async () => {
      try {
        const res = await api.messages(activeChat.id);
        if (!stopped) {
          setRawMessages(prev => {
            const existingIds = new Set(prev.map(m => m.id));
            const newMessages = (res.messages || []).filter(m => !existingIds.has(m.id));
            return newMessages.length > 0 ? [...prev, ...newMessages] : prev;
          });
        }
      } catch {
        // Silent fail to maintain history
      }
    };

    load();
    const id = setInterval(load, 2000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [activeChat.id, activeChat.isAI, me.id]);

  useEffect(() => {
    const decryptAll = async () => {
      if (!isUnlocked || !chatKey) {
        setMessages(rawMessages.map((m) => ({ ...m, plaintext: null })));
        return;
      }
      const resolved = await Promise.all(
        rawMessages.map(async (m) => {
          try {
            const plaintext = await decryptMessage({
              ciphertext: m.ciphertext,
              iv: m.iv,
              passphrase: chatKey,
              chatId
            });
            return { ...m, plaintext };
          } catch {
            return { ...m, plaintext: garbageFromCipher(m.ciphertext) };
          }
        })
      );
      setMessages(resolved);
    };
    decryptAll();
  }, [rawMessages, isUnlocked, chatKey, chatId]);

  useEffect(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
    
    if (isAtBottom) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth"
      });
    }
  }, [messages]);

    const [isSending, setIsSending] = useState(false);
    const inputRef = useRef(null);

    const send = async (e) => {
      e.preventDefault();
      if (!input.trim() || !isUnlocked || !chatKey || isSending) return;

      setIsSending(true);
      const payload = await encryptMessage({
        plaintext: input.trim(),
        passphrase: chatKey,
        chatId
      });

      if (activeChat.isAI) {
        const now = Date.now();
        const self = {
          id: `local_${now}`,
          senderId: me.id,
          receiverId: AI_USER.id,
          ...payload,
          timestamp: now
        };

        setRawMessages(prev => [...prev, self]);
        setInput("");
        setIsSending(false);
        inputRef.current?.focus();

        // Simulate AI Thinking
        setTimeout(async () => {
          const aiPayload = await encryptMessage({
            plaintext: "AI relay active. Secure channel received. Analyzing tactical data stream...",
            passphrase: chatKey,
            chatId
          });

          const aiReply = {
            id: `local_${Date.now()}`,
            senderId: AI_USER.id,
            receiverId: me.id,
            ...aiPayload,
            timestamp: Date.now()
          };

          setRawMessages(prev => {
            const next = [...prev, aiReply];
            localStorage.setItem(`vault_ai_${me.id}`, JSON.stringify(next));
            return next;
          });
        }, 1000 + Math.random() * 1000);
        return;
      }

      try {
        const res = await api.sendMessage(activeChat.id, payload);
        setRawMessages((prev) => [...prev, res.message]);
        setInput("");
        inputRef.current?.focus();
      } catch (err) {
        alert("Failed to transmit: " + (err.message || "Unknown error"));
      } finally {
        setIsSending(false);
      }
    };

  return (
    <div className="h-full flex flex-col bg-black animate-in slide-in-from-right-8 duration-700 relative z-20">
      <div className="p-5 border-b border-white/[0.03] flex items-center justify-between bg-black/80 backdrop-blur-3xl shadow-2xl relative z-10">
        <button onClick={onBack} className="p-2 text-white/30 hover:text-white transition-all duration-300 hover:bg-white/[0.05] rounded-xl group">
          <ChevronLeft className="group-hover:-translate-x-1 transition-transform" />
        </button>
        <div className="text-center">
          <span className="text-[10px] font-black uppercase tracking-[0.4em] block text-white/90">
            @{activeChat.username}
          </span>
          <div className="flex items-center justify-center gap-2 mt-1">
            <div className={`w-1 h-1 rounded-full ${isUnlocked ? "bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]" : "bg-amber-500 shadow-[0_0_5px_rgba(245,158,11,0.5)]"}`} />
            <span className={`text-[7px] font-black uppercase tracking-[0.25em] ${isUnlocked ? "text-green-500/80" : "text-amber-500/80"}`}>
              {isUnlocked ? "Decrypted Link" : "Secure Payload Locked"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {!activeChat.isAI && (
            <button
              onClick={() => onRemoveFriend?.(activeChat.id)}
              className="p-2 text-white/20 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all duration-300"
              title="Terminate Link"
            >
              <UserMinus size={18} strokeWidth={1.5} />
            </button>
          )}
          <button
            onClick={() => setShowKey(true)}
            className={`p-2 rounded-xl transition-all duration-500 ${isUnlocked ? "text-green-500 bg-green-500/5 hover:bg-green-500/10" : "text-amber-500 bg-amber-500/5 hover:bg-amber-500/10 animate-pulse"}`}
            title="Protocol Passkey"
          >
            <Key size={18} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar relative">
        <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-black to-transparent pointer-events-none z-0 opacity-10" />
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.senderId === me.id ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2 duration-500`}>
            <div
              className={`p-4 px-5 rounded-[1.75rem] max-w-[85%] text-sm font-medium leading-[1.6] shadow-2xl relative group ${
                m.senderId === me.id
                  ? "bg-indigo-600 text-white rounded-tr-none"
                  : "bg-white/[0.03] border border-white/5 text-white/80 rounded-tl-none backdrop-blur-sm"
              }`}
            >
              {isUnlocked ? (
                m.plaintext
              ) : (
                <div className="flex flex-col gap-1.5 opacity-40">
                  <div className="h-2 w-32 bg-white/20 rounded-full animate-pulse" />
                  <div className="h-2 w-24 bg-white/20 rounded-full animate-pulse delay-75" />
                  <span className="text-[7px] text-white/40 uppercase tracking-[0.2em] font-black mt-1">Payload Encrypted</span>
                </div>
              )}
              <div className={`absolute bottom-[-18px] text-[6px] font-black uppercase tracking-widest text-white/10 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap ${m.senderId === me.id ? "right-1" : "left-1"}`}>
                {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • Secure Channel
              </div>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={send} className="p-6 pb-10 bg-black/80 backdrop-blur-3xl flex gap-3 border-t border-white/[0.03] relative z-20">
        <div className="flex-1 relative group">
          <input
            ref={inputRef}
            disabled={!isUnlocked || isSending}
            className="w-full bg-white/[0.03] border border-white/5 p-4 pr-12 rounded-[1.25rem] outline-none text-sm font-medium focus:border-indigo-500/30 focus:bg-white/[0.05] transition-all duration-300 disabled:opacity-30 placeholder:text-white/10"
            placeholder={isUnlocked ? (isSending ? "Transmitting..." : "Transmit message...") : "Link locked. Enter passkey."}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          {isUnlocked && (
            <button
              type="submit"
              disabled={isSending}
              className={`absolute right-2 top-1/2 -translate-y-1/2 p-2.5 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 ${isSending ? "animate-pulse" : ""}`}
            >
              {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} strokeWidth={2.5} />}
            </button>
          )}
        </div>
      </form>

      {showKey && (
        <KeyModal
          title="Shard Passkey"
          onClose={() => setShowKey(false)}
          onSubmit={(k) => {
            setChatKey(k);
            setIsUnlocked(true);
            setShowKey(false);
          }}
        />
      )}
    </div>
  );
};

const GroupChatContainer = ({ activeGroup, me, onBack, onExitGroup }) => {
  const [rawMessages, setRawMessages] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [addableFriends, setAddableFriends] = useState([]);
  const [loadingFriendOptions, setLoadingFriendOptions] = useState(false);
  const [addingFriendId, setAddingFriendId] = useState("");
  const [chatKey, setChatKey] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const scrollRef = useRef(null);

  const chatId = useMemo(() => groupChatIdFor(activeGroup.id), [activeGroup.id]);

  useEffect(() => {
    let stopped = false;
    const load = async () => {
      try {
        const res = await api.groupMessages(activeGroup.id);
        if (!stopped) {
          setRawMessages(prev => {
            const existingIds = new Set(prev.map(m => m.id));
            const newMessages = (res.messages || []).filter(m => !existingIds.has(m.id));
            return newMessages.length > 0 ? [...prev, ...newMessages] : prev;
          });
        }
      } catch {
        if (!stopped) setRawMessages([]);
      }
    };
    load();
    const id = setInterval(load, 2000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [activeGroup.id]);

  useEffect(() => {
    const decryptAll = async () => {
      if (!isUnlocked || !chatKey) {
        setMessages(rawMessages.map((m) => ({ ...m, plaintext: null })));
        return;
      }
      const resolved = await Promise.all(
        rawMessages.map(async (m) => {
          try {
            const plaintext = await decryptMessage({
              ciphertext: m.ciphertext,
              iv: m.iv,
              passphrase: chatKey,
              chatId
            });
            return { ...m, plaintext };
          } catch {
            return { ...m, plaintext: garbageFromCipher(m.ciphertext) };
          }
        })
      );
      setMessages(resolved);
    };
    decryptAll();
  }, [rawMessages, isUnlocked, chatKey, chatId]);

  useEffect(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
    
    if (isAtBottom) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth"
      });
    }
  }, [messages]);

  const [isSending, setIsSending] = useState(false);
  const inputRef = useRef(null);

  const send = async (e) => {
    e.preventDefault();
    if (!input.trim() || !isUnlocked || !chatKey || isSending) return;

    setIsSending(true);
    const payload = await encryptMessage({
      plaintext: input.trim(),
      passphrase: chatKey,
      chatId
    });

    try {
      const res = await api.sendGroupMessage(activeGroup.id, payload);
      setRawMessages((prev) => [
        ...prev,
        { ...res.message, senderUsername: me.username }
      ]);
      setInput("");
      inputRef.current?.focus();
    } catch {
    } finally {
      setIsSending(false);
    }
  };

  const openAddFriendModal = async () => {
    setShowAddFriend(true);
    setLoadingFriendOptions(true);
    try {
      const res = await api.groupFriendOptions(activeGroup.id);
      setAddableFriends(res.friends || []);
    } catch {
      setAddableFriends([]);
    } finally {
      setLoadingFriendOptions(false);
    }
  };

  const addFriendToGroup = async (friendId) => {
    setAddingFriendId(friendId);
    try {
      await api.addFriendToGroup(activeGroup.id, friendId);
      setAddableFriends((prev) => prev.filter((f) => f.id !== friendId));
    } catch {
    } finally {
      setAddingFriendId("");
    }
  };

  return (
    <div className="h-full flex flex-col bg-black animate-in slide-in-from-right-8 duration-700 relative z-20">
      <div className="p-5 border-b border-white/[0.03] flex items-center justify-between bg-black/80 backdrop-blur-3xl shadow-2xl relative z-10">
        <button onClick={onBack} className="p-2 text-white/30 hover:text-white transition-all duration-300 hover:bg-white/[0.05] rounded-xl group">
          <ChevronLeft className="group-hover:-translate-x-1 transition-transform" />
        </button>
        <div className="text-center">
          <span className="text-[10px] font-black uppercase tracking-[0.4em] block text-white/90">
            #{activeGroup.name}
          </span>
          <div className="flex items-center justify-center gap-2 mt-1">
            <div className={`w-1 h-1 rounded-full ${isUnlocked ? "bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]" : "bg-amber-500 shadow-[0_0_5px_rgba(245,158,11,0.5)]"}`} />
            <span className={`text-[7px] font-black uppercase tracking-[0.25em] ${isUnlocked ? "text-green-500/80" : "text-amber-500/80"}`}>
              {isUnlocked ? "Protocol Decrypted" : "Group Payload Locked"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={openAddFriendModal}
            className="p-2 text-white/20 hover:text-green-400 hover:bg-green-500/10 rounded-xl transition-all duration-300"
            title="Invite Node"
          >
            <UserPlus size={18} strokeWidth={1.5} />
          </button>
          <button
            onClick={() => onExitGroup(activeGroup.id)}
            className="p-2 text-white/20 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all duration-300"
            title="Terminate Protocol"
          >
            <LogOut size={18} strokeWidth={1.5} />
          </button>
          <button
            onClick={() => setShowKey(true)}
            className={`p-2 rounded-xl transition-all duration-500 ${isUnlocked ? "text-green-500 bg-green-500/5 hover:bg-green-500/10" : "text-amber-500 bg-amber-500/5 hover:bg-amber-500/10 animate-pulse"}`}
            title="Protocol Passkey"
          >
            <Key size={18} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar relative">
        <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-black to-transparent pointer-events-none z-0 opacity-10" />
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.senderId === me.id ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2 duration-500`}>
            <div className={`flex items-end gap-3 max-w-[85%] ${m.senderId === me.id ? "flex-row-reverse" : "flex-row"}`}>
              {m.senderId !== me.id && (
                <div className="w-6 h-6 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-[10px] font-black text-white/20 flex-shrink-0">
                  {m.username?.[0].toUpperCase() || "?"}
                </div>
              )}
              <div
                className={`p-4 px-5 rounded-[1.75rem] text-sm font-medium leading-[1.6] shadow-2xl relative group ${
                  m.senderId === me.id
                    ? "bg-indigo-600 text-white rounded-tr-none"
                    : "bg-white/[0.03] border border-white/5 text-white/80 rounded-tl-none backdrop-blur-sm"
                }`}
              >
                {m.senderId !== me.id && (
                  <p className="text-[7px] font-black uppercase tracking-widest text-indigo-400 mb-2 opacity-50">
                    @{m.senderUsername || "node"}
                  </p>
                )}
                {isUnlocked ? (
                  m.plaintext
                ) : (
                  <div className="flex flex-col gap-1.5 opacity-40">
                    <div className="h-2 w-32 bg-white/20 rounded-full animate-pulse" />
                    <div className="h-2 w-24 bg-white/20 rounded-full animate-pulse delay-75" />
                  </div>
                )}
                <div className={`absolute bottom-[-18px] text-[6px] font-black uppercase tracking-widest text-white/10 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap ${m.senderId === me.id ? "right-1" : "left-1"}`}>
                  {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • Secure Channel
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={send} className="p-6 pb-10 bg-black/80 backdrop-blur-3xl flex gap-3 border-t border-white/[0.03] relative z-20">
        <div className="flex-1 relative group">
          <input
            ref={inputRef}
            disabled={!isUnlocked || isSending}
            className="w-full bg-white/[0.03] border border-white/5 p-4 pr-12 rounded-[1.25rem] outline-none text-sm font-medium focus:border-indigo-500/30 focus:bg-white/[0.05] transition-all duration-300 disabled:opacity-30 placeholder:text-white/10"
            placeholder={isUnlocked ? (isSending ? "Broadcasting..." : "Broadcast message...") : "Protocol locked. Enter passkey."}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          {isUnlocked && (
            <button
              type="submit"
              disabled={isSending}
              className={`absolute right-2 top-1/2 -translate-y-1/2 p-2.5 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 ${isSending ? "animate-pulse" : ""}`}
            >
              {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} strokeWidth={2.5} />}
            </button>
          )}
        </div>
      </form>

      {showKey && (
        <KeyModal
          title="Group Passkey"
          onClose={() => setShowKey(false)}
          onSubmit={(k) => {
            setChatKey(k);
            setIsUnlocked(true);
            setShowKey(false);
          }}
        />
      )}

      {showAddFriend && (
        <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-xl flex items-center justify-center p-6">
          <div className="bg-white/[0.03] border border-white/10 p-8 rounded-[3rem] w-full max-sm space-y-8 shadow-2xl animate-in zoom-in duration-500 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-3xl pointer-events-none" />
            <div className="flex items-center justify-between relative z-10">
              <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">Node Invitation</h3>
              <button
                onClick={() => setShowAddFriend(false)}
                className="p-2 text-white/20 hover:text-white transition-all duration-300 hover:bg-white/[0.05] rounded-xl"
              >
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>
            {loadingFriendOptions ? (
              <div className="text-white/20 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-3 py-10">
                <Loader2 size={16} className="animate-spin" /> Verifying Links...
              </div>
            ) : addableFriends.length ? (
              <div className="space-y-3 max-h-[320px] overflow-y-auto custom-scrollbar pr-1 relative z-10">
                {addableFriends.map((f) => (
                  <div
                    key={f.id}
                    className="bg-white/[0.02] border border-white/5 rounded-2xl px-5 py-4 flex items-center justify-between group/item hover:bg-white/[0.04] transition-all duration-300"
                  >
                    <span className="font-bold text-sm text-white/80 transition-colors group-hover/item:text-white">@{f.username}</span>
                    <button
                      onClick={() => addFriendToGroup(f.id)}
                      disabled={addingFriendId === f.id}
                      className="px-4 py-2 bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all duration-300 disabled:opacity-50"
                    >
                      {addingFriendId === f.id ? "Syncing..." : "Invite"}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-white/20 text-[10px] font-black uppercase tracking-widest text-center py-10 border border-dashed border-white/5 rounded-2xl">
                No Available Nodes
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const App = () => {
  const [view, setView] = useState("auth");
  const [authMode, setAuthMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const [me, setMe] = useState(null);
  const [users, setUsers] = useState([]);
  const [friends, setFriends] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [outgoingRequests, setOutgoingRequests] = useState([]);
  const [myGroups, setMyGroups] = useState([]);

  const [activeTab, setActiveTab] = useState("chats");
  const [searchQuery, setSearchQuery] = useState("");
  const [groupNameInput, setGroupNameInput] = useState("");
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);

  const [activeChat, setActiveChat] = useState(null);
  const [activeGroup, setActiveGroup] = useState(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [notificationPrefs, setNotificationPrefs] = useState(() => {
    try {
      const raw = localStorage.getItem(NOTIFICATION_PREFS_KEY);
      if (!raw) return DEFAULT_NOTIFICATION_PREFS;
      return { ...DEFAULT_NOTIFICATION_PREFS, ...JSON.parse(raw) };
    } catch {
      return DEFAULT_NOTIFICATION_PREFS;
    }
  });
  const [notificationPermission, setNotificationPermission] = useState(() => {
    if (typeof Notification === "undefined") return "unsupported";
    return Notification.permission;
  });

  const loadNetwork = async (search = "") => {
    const [usersRes, friendsRes, requestsRes, myGroupsRes] =
      await Promise.all([
        api.users(search),
        api.friends(),
        api.friendRequests(),
        api.myGroups()
      ]);

    setUsers(usersRes.users || []);
    setFriends([AI_USER, ...(friendsRes.friends || [])]);
    setIncomingRequests(requestsRes.incoming || []);
    setOutgoingRequests(requestsRes.outgoing || []);
    setMyGroups(myGroupsRes.groups || []);
  };

  useEffect(() => {
    const bootstrap = async () => {
      try {
        await api.getCsrf();
        const meRes = await api.me();
        setMe(meRes.user);
        setView("main");
        await loadNetwork("");
      } catch {
        setView("auth");
      }
    };
    bootstrap();
  }, []);

  useEffect(() => {
    if (!me) return;
    loadNetwork(searchQuery).catch(() => {});
  }, [me, searchQuery]);

  useEffect(() => {
    if (!me) return;
    const id = setInterval(() => {
      loadNetwork(searchQuery).catch(() => {});
    }, 5000);
    return () => clearInterval(id);
  }, [me, searchQuery]);

  useEffect(() => {
    try {
      localStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(notificationPrefs));
    } catch {}
  }, [notificationPrefs]);

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError("");
    setIsProcessing(true);
    try {
      await api.getCsrf();
      const fn = authMode === "login" ? api.login : api.register;
      const res = await fn({ username, password });
      setMe(res.user);
      setView("main");
      await loadNetwork("");
    } catch (err) {
      setAuthError(err.message || "Authentication failed");
    } finally {
      setIsProcessing(false);
    }
  };

  const onLogout = async () => {
    try {
      await api.logout();
    } catch {}
    setView("auth");
    setMe(null);
    setActiveChat(null);
    setActiveGroup(null);
    setUsers([]);
    setFriends([]);
    setIncomingRequests([]);
    setOutgoingRequests([]);
    setMyGroups([]);
    setPassword("");
  };

  const sendFriendReq = async (targetId) => {
    try {
      await api.sendFriendRequest(targetId);
      await loadNetwork(searchQuery);
    } catch (err) {
      alert("Failed to send request: " + (err.message || "Check permissions"));
    }
  };

  const acceptFriendReq = async (fromUserId) => {
    try {
      await api.acceptFriendRequest(fromUserId);
      setIncomingRequests((prev) => prev.filter((r) => r.fromUserId !== fromUserId));
      setOutgoingRequests((prev) => prev.filter((r) => r.toUserId !== fromUserId));
      await loadNetwork(searchQuery);
    } catch (err) {
      alert("Failed to accept: " + (err.message || "Database error"));
    }
  };

  const rejectFriendReq = async (fromUserId) => {
    try {
      await api.rejectFriendRequest(fromUserId);
      setIncomingRequests((prev) => prev.filter((r) => r.fromUserId !== fromUserId));
      await loadNetwork(searchQuery);
    } catch {}
  };

  const unsendFriendReq = async (toUserId) => {
    try {
      await api.unsendFriendRequest(toUserId);
      setOutgoingRequests((prev) => prev.filter((r) => r.toUserId !== toUserId));
      await loadNetwork(searchQuery);
    } catch {}
  };

  const removeFriend = async (targetId) => {
    if (!targetId || targetId === AI_USER.id) return;
    try {
      await api.removeFriend(targetId);
      if (activeChat?.id === targetId) setActiveChat(null);
      await loadNetwork(searchQuery);
    } catch {}
  };

  const createGroup = async () => {
    const clean = groupNameInput.trim();
    if (clean.length < 2) return;
    setIsCreatingGroup(true);
    try {
      await api.createGroup({ name: clean });
      setGroupNameInput("");
      await loadNetwork(searchQuery);
    } catch {
    } finally {
      setIsCreatingGroup(false);
    }
  };


  const leaveGroup = async (groupId) => {
    try {
      await api.leaveGroup(groupId);
      if (activeGroup?.id === groupId) setActiveGroup(null);
      await loadNetwork(searchQuery);
    } catch {}
  };

  const toggleNotificationPref = (key) => {
    setNotificationPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const requestBrowserNotificationPermission = async () => {
    if (typeof Notification === "undefined") return;
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  };

  const notificationSettingRows = [
    {
      key: "messages",
      label: "Message Alerts",
      description: "Direct and group message alerts"
    },
    {
      key: "friendRequests",
      label: "Friend Requests",
      description: "Incoming friend request alerts"
    },
    {
      key: "groupRequests",
      label: "Group Requests",
      description: "Incoming group join request alerts"
    },
    {
      key: "sounds",
      label: "Notification Sound",
      description: "Play sound on alert events"
    }
  ];

  const incomingRequestIds = useMemo(
    () => new Set(incomingRequests.map((r) => r.fromUserId)),
    [incomingRequests]
  );
  const outgoingRequestIds = useMemo(
    () => new Set(outgoingRequests.map((r) => r.toUserId)),
    [outgoingRequests]
  );

  const discoveredUsers = useMemo(
    () =>
      users.filter(
        (u) =>
          u.id !== me?.id &&
          u.username.includes(searchQuery.toLowerCase()) &&
          !friends.some((f) => f.id === u.id) &&
          !incomingRequestIds.has(u.id) &&
          !outgoingRequestIds.has(u.id)
      ),
    [users, me?.id, searchQuery, friends, incomingRequestIds, outgoingRequestIds]
  );

  if (view === "auth") {
    return (
      <div className="h-screen bg-black flex items-center justify-center p-6 text-white font-sans selection:bg-indigo-500/30 overflow-hidden relative">
        {/* Subtle Background Accent */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-600/5 rounded-full blur-[120px] pointer-events-none" />
        
        <div className="w-full max-w-[340px] space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-1000 relative z-10">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 bg-white/[0.03] border border-white/10 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-2xl backdrop-blur-xl group transition-all duration-500 hover:border-indigo-500/40">
              <ShieldCheck className="text-white/80 group-hover:text-indigo-400 transition-colors duration-500" size={32} strokeWidth={1.5} />
            </div>
            <h1 className="text-2xl font-black tracking-[-0.05em] text-white/90">
              VAULT<span className="text-indigo-500 opacity-80">ID</span>
            </h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-[0.5em] font-light">
              Unique Node Protocol
            </p>
          </div>

          <form onSubmit={handleAuth} className="space-y-6">
            <div className="space-y-4">
              <div className="group relative">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                  <UserIcon size={16} className="text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                </div>
                <input
                  className="w-full bg-white/[0.03] border border-white/5 p-4 pl-12 rounded-[1.25rem] outline-none text-sm font-medium focus:border-indigo-500/30 focus:bg-white/[0.05] transition-all duration-300 placeholder:text-slate-600"
                  placeholder="Unique Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                />
              </div>
              <div className="group relative">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                  <Fingerprint size={16} className="text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                </div>
                <input
                  className="w-full bg-white/[0.03] border border-white/5 p-4 pl-12 rounded-[1.25rem] outline-none text-sm font-medium focus:border-indigo-500/30 focus:bg-white/[0.05] transition-all duration-300 placeholder:text-slate-600"
                  type="password"
                  placeholder={authMode === "signup" ? "Passcode (min 10 chars)" : "Passcode"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
            </div>

            {authError && (
              <div className="bg-red-500/5 border border-red-500/10 p-4 rounded-2xl flex items-center gap-3 text-red-500/90 text-[10px] font-bold uppercase tracking-wider animate-in shake duration-500">
                <AlertCircle size={14} strokeWidth={2.5} /> {authError}
              </div>
            )}

            <button
              disabled={isProcessing}
              className="group relative w-full overflow-hidden rounded-[1.25rem] bg-indigo-600 p-[1px] transition-all duration-300 hover:shadow-[0_0_30px_-5px_rgba(79,70,229,0.5)] active:scale-[0.98] disabled:opacity-50"
            >
              <div className="relative flex h-14 items-center justify-center rounded-[1.25rem] bg-indigo-600 transition-all duration-300 group-hover:bg-indigo-500">
                {isProcessing ? (
                  <Loader2 className="animate-spin text-white/50" size={20} />
                ) : (
                  <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white">
                    {authMode === "login" ? "Sync Identity" : "Register Node"}
                  </span>
                )}
              </div>
            </button>
          </form>

          <button
            onClick={() => {
              setAuthMode(authMode === "login" ? "signup" : "login");
              setAuthError("");
            }}
            className="w-full text-[10px] text-slate-500 font-bold uppercase tracking-[0.35em] hover:text-white transition-all duration-300 py-2"
          >
            {authMode === "login" ? "New Architecture?" : "Existing Node?"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-black text-white flex flex-col font-sans overflow-hidden selection:bg-indigo-500/30">
      <header className="sm:px-8 px-4 py-5 border-b border-white/[0.03] bg-black/50 backdrop-blur-xl relative z-30">
        <div className="max-w-7xl mx-auto w-full flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/[0.03] border border-white/10 flex items-center justify-center shadow-2xl">
              <ShieldCheck size={18} className="text-white/40" strokeWidth={1.5} />
            </div>
            <p className="text-[10px] font-black tracking-[0.4em] text-white/40 uppercase hidden sm:block">
              Vault<span className="text-indigo-500/50">Protocol</span>
            </p>
          </div>
          
          <div className="flex items-center gap-4 sm:gap-6">
            <div className="flex flex-col items-end mr-1 sm:mr-2">
              <p className="text-[10px] font-bold tracking-tight text-white/90">@{me?.username}</p>
              <p className="text-[7px] text-green-500/70 uppercase font-black tracking-[0.2em] flex items-center gap-1.5 mt-0.5">
                <span className="w-1 h-1 bg-green-500 rounded-full shadow-[0_0_5px_rgba(34,197,94,0.5)]" /> Node Active
              </p>
            </div>
            <div className="h-6 w-[1px] bg-white/5" />
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowSettingsModal(true)}
                className="p-2 text-white/30 hover:text-indigo-400 transition-all duration-300 hover:bg-white/[0.02] rounded-lg"
                title="Settings"
              >
                <SettingsIcon size={18} strokeWidth={1.5} />
              </button>
              <button
                onClick={onLogout}
                className="p-2 text-white/30 hover:text-red-500 transition-all duration-300 hover:bg-white/[0.02] rounded-lg"
                title="Logout"
              >
                <LogOut size={18} strokeWidth={1.5} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className={`flex-1 overflow-y-auto custom-scrollbar ${activeChat || activeGroup ? 'sm:p-8 p-0' : 'sm:p-8 p-4 pt-10 pb-32'}`}>
        <div className={`mx-auto w-full ${activeChat || activeGroup ? 'max-w-6xl' : 'max-w-5xl'}`}>
        {activeChat ? (
          <ChatContainer
            activeChat={activeChat}
            me={me}
            onBack={() => setActiveChat(null)}
            onRemoveFriend={removeFriend}
          />
        ) : activeGroup ? (
          <GroupChatContainer
            activeGroup={activeGroup}
            me={me}
            onBack={() => setActiveGroup(null)}
            onExitGroup={leaveGroup}
          />
        ) : (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {activeTab === "chats" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between px-2">
                  <h3 className="text-[10px] font-black text-white/30 tracking-[0.4em] uppercase">
                    Established Links
                  </h3>
                  <div className="h-px flex-1 bg-white/5 ml-4" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {friends.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setActiveChat(f)}
                      className="w-full bg-white/[0.015] p-5 rounded-[2rem] border border-white/[0.03] flex items-center gap-5 hover:bg-white/[0.04] hover:border-white/10 transition-all duration-300 group active:scale-[0.98] ring-1 ring-transparent hover:ring-white/5"
                    >
                      <div
                        className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-black transition-all duration-500 shadow-2xl ${
                          f.isAI 
                            ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 group-hover:scale-110" 
                            : "bg-white/[0.03] text-white/40 border border-white/5 group-hover:scale-110 group-hover:border-white/20"
                        }`}
                      >
                        {f.isAI ? <Sparkles size={20} strokeWidth={2} /> : f.username[0].toUpperCase()}
                      </div>
                      <div className="text-left flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="font-bold text-white/90 group-hover:text-white transition-colors tracking-tight truncate">
                            @{f.username}
                          </p>
                          <span className="text-[8px] text-white/20 font-black uppercase tracking-widest bg-white/5 px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity">
                            Open Shard
                          </span>
                        </div>
                        <p className="text-[7px] text-slate-600 uppercase font-black tracking-[0.2em] mt-1.5 flex items-center gap-1.5">
                          {f.isAI ? (
                            <>
                              <span className="w-1 h-1 bg-indigo-500/50 rounded-full animate-pulse" />
                              Synthetic Intelligence
                            </>
                          ) : (
                            <>
                              <span className="w-1 h-1 bg-white/10 rounded-full" />
                              Encrypted Shard Protocol
                            </>
                          )}
                        </p>
                      </div>
                    </button>
                  ))}
                  {!friends.length && (
                    <div className="bg-white/[0.02] border border-dashed border-white/5 rounded-3xl p-10 text-center space-y-3">
                      <div className="w-12 h-12 bg-white/[0.03] rounded-2xl flex items-center justify-center mx-auto text-white/20">
                        <MessageSquare size={24} strokeWidth={1} />
                      </div>
                      <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">No Active Shards Found</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "search" && (
              <div className="space-y-8">
                <div className="bg-white/[0.03] border border-white/10 rounded-[1.5rem] flex items-center px-4 focus-within:border-indigo-500/30 focus-within:bg-white/[0.05] transition-all duration-300 ring-1 ring-transparent focus-within:ring-indigo-500/10 shadow-2xl">
                  <Search size={18} className="text-white/20" />
                  <input
                    className="bg-transparent flex-1 p-5 outline-none text-sm font-medium placeholder:text-slate-600"
                    placeholder="Search Matrix Nodes..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                <div className="space-y-4">
                  {(incomingRequests.length > 0 || outgoingRequests.length > 0) && (
                    <>
                      <div className="flex items-center justify-between px-2">
                        <h3 className="text-[10px] font-black text-white/30 tracking-[0.4em] uppercase">
                          Pending Transfers
                        </h3>
                        <div className="h-px flex-1 bg-white/5 ml-4" />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {incomingRequests.map((r) => (
                          <div
                            key={`fri_in_${r.fromUserId}`}
                            className="bg-amber-500/[0.03] p-5 rounded-3xl border border-amber-500/10 flex justify-between items-center gap-4 transition-all hover:border-amber-500/20"
                          >
                            <div>
                              <p className="font-bold text-sm tracking-tight text-white/90">@{r.username}</p>
                              <p className="text-[7px] uppercase tracking-[0.2em] text-amber-500/60 font-black mt-1">
                                Incoming Node Invite
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => acceptFriendReq(r.fromUserId)}
                                className="px-4 py-2 bg-green-500/10 border border-green-500/20 text-green-400 rounded-xl text-[9px] font-black uppercase hover:bg-green-500 hover:text-white transition-all shadow-lg shadow-green-500/5"
                              >
                                Accept
                              </button>
                              <button
                                onClick={() => rejectFriendReq(r.fromUserId)}
                                className="px-4 py-2 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-[9px] font-black uppercase hover:bg-red-500 hover:text-white transition-all shadow-lg shadow-red-500/5"
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                        ))}

                        {outgoingRequests.map((r) => (
                          <div
                            key={`fri_out_${r.toUserId}`}
                            className="bg-white/[0.02] p-5 rounded-3xl border border-white/5 flex justify-between items-center gap-4"
                          >
                            <div>
                              <p className="font-bold text-sm tracking-tight text-white/80">@{r.username}</p>
                              <p className="text-[7px] uppercase tracking-[0.2em] text-indigo-400/60 font-black mt-1">
                                Pending Node Response
                              </p>
                            </div>
                            <button
                              onClick={() => unsendFriendReq(r.toUserId)}
                              className="px-4 py-2 bg-red-500/10 border border-red-500/20 text-red-300 rounded-xl text-[9px] font-black uppercase hover:bg-red-500 hover:text-white transition-all"
                            >
                              Revoke
                            </button>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between px-2">
                    <h3 className="text-[10px] font-black text-white/30 tracking-[0.4em] uppercase">
                      Discover Nodes
                    </h3>
                    <div className="h-px flex-1 bg-white/5 ml-4" />
                  </div>
                  <div className="grid gap-3">
                    {discoveredUsers.map((u) => (
                      <div
                        key={u.id}
                        className="bg-white/[0.015] p-5 rounded-[2rem] border border-white/[0.03] flex justify-between items-center group transition-all duration-300 hover:bg-white/[0.04] hover:border-white/10 ring-1 ring-transparent hover:ring-white/5 shadow-xl"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-11 h-11 bg-white/[0.03] border border-white/10 rounded-2xl flex items-center justify-center font-black text-white/40 group-hover:scale-110 group-hover:border-white/20 transition-all duration-500">
                            {u.username[0].toUpperCase()}
                          </div>
                          <span className="font-bold tracking-tight text-white/90">@{u.username}</span>
                        </div>
                        <button
                          onClick={() => sendFriendReq(u.id)}
                          className="p-3 bg-white/[0.03] border border-white/10 rounded-xl text-green-500/70 hover:bg-green-500 hover:text-white hover:scale-110 transition-all duration-300 shadow-lg shadow-green-500/5 group-hover:animate-pulse"
                        >
                          <UserPlus size={18} strokeWidth={2.5} />
                        </button>
                      </div>
                    ))}
                    {!discoveredUsers.length && (
                      <div className="bg-white/[0.01] border border-dashed border-white/5 rounded-3xl p-10 text-center">
                        <p className="text-[10px] text-slate-600 uppercase font-black tracking-widest">No New Entities Found</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "groups" && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="bg-white/[0.02] border border-white/10 rounded-[2rem] p-6 space-y-4 shadow-2xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-3xl pointer-events-none" />
                  <h3 className="text-[10px] font-black text-white/30 tracking-[0.4em] uppercase px-1">
                    Initiate Group
                  </h3>
                  <div className="flex gap-3">
                    <input
                      className="flex-1 bg-white/[0.03] border border-white/5 p-4 rounded-2xl outline-none text-sm font-medium focus:border-indigo-500/30 focus:bg-white/[0.05] transition-all duration-300 placeholder:text-slate-600"
                      placeholder="Protocol Name..."
                      value={groupNameInput}
                      onChange={(e) => setGroupNameInput(e.target.value)}
                    />
                    <button
                      onClick={createGroup}
                      disabled={isCreatingGroup}
                      className="px-6 bg-indigo-600 rounded-2xl text-[10px] uppercase tracking-widest font-black hover:bg-indigo-500 transition-all duration-300 disabled:opacity-50 shadow-lg shadow-indigo-600/10 flex items-center justify-center gap-2"
                    >
                      {isCreatingGroup ? <Loader2 size={16} className="animate-spin text-white/50" /> : <Plus size={16} />}
                      Create
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between px-2">
                    <h3 className="text-[10px] font-black text-white/30 tracking-[0.4em] uppercase">
                      My Protocol Groups
                    </h3>
                    <div className="h-px flex-1 bg-white/5 ml-4" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {myGroups.map((g) => (
                      <div
                        key={g.id}
                        onClick={() => setActiveGroup(g)}
                        className="w-full bg-white/[0.015] p-5 rounded-[2rem] border border-white/[0.03] flex justify-between items-center text-left hover:bg-white/[0.04] hover:border-white/10 transition-all duration-300 group active:scale-[0.98] ring-1 ring-transparent hover:ring-white/5 shadow-xl cursor-pointer"
                      >
                        <div className="flex items-center gap-5">
                          <div className="w-12 h-12 bg-white/[0.03] border border-white/10 rounded-2xl flex items-center justify-center text-lg font-black text-white/40 group-hover:scale-110 group-hover:border-white/20 transition-all duration-500">
                            #
                          </div>
                          <div>
                            <p className="font-bold text-white/90 group-hover:text-white transition-colors tracking-tight">#{g.name}</p>
                            <p className="text-[7px] uppercase tracking-[0.2em] text-slate-600 font-black mt-1.5 flex items-center gap-1.5">
                              <span className="w-1 h-1 bg-white/10 rounded-full" />
                              P2P Group Encrypted
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            leaveGroup(g.id);
                          }}
                          className="px-4 py-2 bg-red-500/10 border border-red-500/20 text-red-400/70 rounded-xl text-[9px] font-black uppercase hover:bg-red-500 hover:text-white transition-all shadow-lg shadow-red-500/5 group-hover:animate-in zoom-in duration-300"
                        >
                          Exit
                        </button>
                      </div>
                    ))}
                    {!myGroups.length && (
                      <div className="bg-white/[0.01] border border-dashed border-white/5 rounded-3xl p-10 text-center">
                        <p className="text-[10px] text-slate-600 uppercase font-black tracking-widest">No Active Groups Detected</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>

      {!activeChat && !activeGroup && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-40">
          <div className="bg-[#0a0c10]/40 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-2 flex items-center gap-1 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.9)] ring-1 ring-white/5 relative">
            {/* Sliding Indicator Background */}
            <div 
              className="absolute h-[calc(100%-16px)] bg-indigo-500/10 border border-indigo-500/20 rounded-2xl transition-all duration-500 cubic-bezier(0.4, 0, 0.2, 1) z-0 shadow-[0_0_15px_rgba(99,102,241,0.1)]"
              style={{
                width: '64px',
                left: activeTab === 'chats' ? '8px' : activeTab === 'search' ? '76px' : '144px'
              }}
            />
            
            <button
              onClick={() => setActiveTab("chats")}
              className={`relative z-10 w-16 h-12 flex items-center justify-center transition-all duration-300 ${
                activeTab === "chats" ? "text-indigo-400" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <MessageSquare size={22} strokeWidth={activeTab === "chats" ? 2 : 1.5} />
            </button>
            <button
              onClick={() => setActiveTab("search")}
              className={`relative z-10 w-16 h-12 flex items-center justify-center transition-all duration-300 ${
                activeTab === "search" ? "text-indigo-400" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <Globe size={22} strokeWidth={activeTab === "search" ? 2 : 1.5} />
            </button>
            <button
              onClick={() => setActiveTab("groups")}
              className={`relative z-10 w-16 h-12 flex items-center justify-center transition-all duration-300 ${
                activeTab === "groups" ? "text-indigo-400" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <GroupsIcon size={22} strokeWidth={activeTab === "groups" ? 2 : 1.5} />
            </button>
          </div>
        </div>
      )}

      {showSettingsModal && (
        <div className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-3xl flex items-center justify-center p-6 animate-in fade-in duration-500">
          <div className="bg-white/[0.03] border border-white/10 p-10 rounded-[3rem] w-full max-w-md md:max-w-2xl space-y-10 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/5 blur-3xl pointer-events-none" />
            
            <div className="flex items-center justify-between relative z-10">
              <div className="space-y-1">
                <h3 className="text-[10px] font-black uppercase tracking-[0.5em] text-white/40">System Core</h3>
                <p className="text-xl font-bold tracking-tight text-white">Preferences</p>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="p-3 text-white/20 hover:text-white transition-all duration-300 hover:bg-white/[0.05] rounded-2xl"
              >
                <X size={20} strokeWidth={1.5} />
              </button>
            </div>

            <div className="space-y-6 relative z-10">
              <div className="space-y-3">
                <h4 className="text-[9px] font-black uppercase tracking-[0.3em] text-indigo-400/60 flex items-center gap-2 px-1">
                  <Bell size={12} /> Communication Alerts
                </h4>
                <div className="grid gap-2">
                  {notificationSettingRows.map((row) => (
                    <button
                      key={row.key}
                      onClick={() => toggleNotificationPref(row.key)}
                      className="w-full bg-white/[0.02] border border-white/5 rounded-2xl px-5 py-4 flex items-center justify-between text-left hover:bg-white/[0.04] hover:border-white/10 transition-all duration-300 group/item"
                    >
                      <div>
                        <p className="text-sm font-bold text-white/80 group-hover/item:text-white transition-colors">{row.label}</p>
                        <p className="text-[8px] uppercase tracking-[0.15em] text-white/20 mt-1 font-black">
                          {row.description}
                        </p>
                      </div>
                      <div className={`w-10 h-6 rounded-full transition-all duration-500 relative p-1 ${notificationPrefs[row.key] ? "bg-indigo-600 shadow-[0_0_15px_rgba(79,70,229,0.3)]" : "bg-white/5"}`}>
                        <div className={`w-4 h-4 bg-white rounded-full transition-all duration-500 shadow-sm ${notificationPrefs[row.key] ? "translate-x-4" : "translate-x-0"}`} />
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-[9px] font-black uppercase tracking-[0.3em] text-indigo-400/60 flex items-center gap-2 px-1">
                  <Info size={12} /> Protocol Identity
                </h4>
                <div className="bg-white/[0.02] border border-white/5 rounded-3xl p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-white/80">VaultID Secure Network</p>
                      <p className="text-[8px] uppercase tracking-[0.2em] text-white/30 font-black mt-1">E2EE Protocol v2.4.0</p>
                    </div>
                    <div className="px-3 py-1 bg-green-500/10 border border-green-500/20 rounded-lg">
                      <span className="text-[8px] font-black uppercase tracking-widest text-green-500">Live</span>
                    </div>
                  </div>
                  <p className="text-xs text-white/40 leading-relaxed font-medium">
                    Privacy-first workspace for encrypted communication. Message payloads are secured via client-side P2P cipher mode.
                  </p>
                  <div className="pt-2 flex items-center justify-between border-t border-white/5">
                    <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/20">Encryption Status</span>
                    <span className="text-[8px] font-black uppercase tracking-[0.2em] text-indigo-400">Tactical Grade</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 text-center relative z-10">
              <p className="text-[8px] font-black uppercase tracking-[0.4em] text-white/10 italic">
                Secure Transmission • Zero-Log Architecture
              </p>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(79, 70, 229, 0.1); border-radius: 10px; }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes zoom-in { from { transform: scale(0.95); } to { transform: scale(1); } }
        .animate-in { animation: fade-in 0.3s ease-out, zoom-in 0.3s ease-out; }
      `}</style>
    </div>
  );
};

export default App;
