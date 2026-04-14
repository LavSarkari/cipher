import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  AlertCircle, Bell, ChevronLeft, Fingerprint, Info, Key, Loader2,
  LogOut, MessageSquare, Plus, Search, Send, Settings as SettingsIcon,
  ShieldCheck, Sparkles, User as UserIcon, UserMinus, UserPlus,
  Users as GroupsIcon, X, AtSign, Hash, Lock, Menu,
  CornerUpLeft, Edit2, Smile, MoreHorizontal
} from "lucide-react";
import { api } from "./lib/api";
import { decryptMessage, encryptMessage } from "./crypto/e2ee";
import { formatDiscordTime, formatDateSeparator, groupMessages } from "./lib/helpers";
import { usePresence, useTypingIndicator, useMessageListener, useTableListener } from "./lib/realtime";
import { saveMessages } from "./lib/db";

const AI_USER = { id: "ai-999", username: "Gemini AI", isAI: true };
const NOTIFICATION_PREFS_KEY = "cipher_notification_prefs";
const DEFAULT_NOTIFICATION_PREFS = { messages: true, friendRequests: true, groupRequests: true, sounds: true };
const chatIdFor = (a, b) => [a, b].sort().join(":");
const groupChatIdFor = (gid) => `group:${gid}`;

/* ─── Key Modal ─── */
const KeyModal = ({ title, onClose, onSubmit }) => {
  const [value, setValue] = useState("");
  return (
    <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-xl flex items-center justify-center p-6 safe-bottom">
      <div className="bg-[#1a1a1e] border border-white/10 p-8 rounded-2xl w-full max-w-[340px] text-center space-y-6 shadow-2xl">
        <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto border border-amber-500/20">
          <Key className="text-amber-500" size={28} />
        </div>
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-white/50">{title}</h3>
          <p className="text-[11px] text-amber-500/60 mt-1">Enter your shared encryption passkey</p>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(value); }} className="space-y-6">
          {/* Junk inputs to bait browser autofill */}
          <input type="text" name="username" style={{ display: 'none' }} autoComplete="username" tabIndex="-1" />
          <input type="password" name="password" style={{ display: 'none' }} autoComplete="current-password" tabIndex="-1" />
          
          <input
            className="w-full bg-white/[0.05] border border-white/10 p-4 rounded-xl outline-none text-center text-base tracking-widest focus:border-amber-500/40 transition-all font-mono"
            type="password" autoFocus placeholder="••••••••" value={value} 
            autoComplete="new-password" name={`passkey_${Math.random().toString(36).substring(7)}`}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onSubmit(value); if (e.key === "Escape") onClose(); }}
          />
        </form>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3.5 rounded-xl text-xs uppercase tracking-widest font-bold text-white/30 active:bg-white/5 transition-colors">Cancel</button>
          <button onClick={() => onSubmit(value)} className="flex-1 bg-amber-600 rounded-xl py-3.5 text-xs uppercase tracking-widest font-bold active:bg-amber-700 transition-colors">Unlock</button>
        </div>
      </div>
    </div>
  );
};

/* ─── Shared Components & Hooks ─── */
const useLongPress = (callback, ms = 400) => {
  const timer = useRef(null);
  const start = (e) => { timer.current = setTimeout(() => { callback(e); }, ms); };
  const stop = () => { clearTimeout(timer.current); };
  return { onTouchStart: start, onTouchEnd: stop, onTouchMove: stop };
};

const MessageContextMenu = ({ x, y, msg, isOwn, onClose, onReply, onEdit, onReact }) => {
  const ref = useRef(null);
  useEffect(() => {
    const clk = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", clk);
    return () => document.removeEventListener("mousedown", clk);
  }, [onClose]);

  const emojis = ["👍", "❤️", "😂", "🎉", "🔥", "👀"];

  return (
    <div ref={ref} className="fixed z-[100] bg-[#111214] border border-white/10 rounded-lg shadow-2xl py-2 min-w-[200px]"
      style={{ top: Math.min(y, window.innerHeight - 200), left: Math.min(x, window.innerWidth - 220) }}>
      <div className="flex gap-2 px-3 pb-2 border-b border-white/5 mb-1">
        {emojis.map(e => (
          <button key={e} onClick={() => { onReact(msg, e); onClose(); }} className="text-xl p-1.5 hover:bg-white/10 rounded-md transition-colors active:scale-95">{e}</button>
        ))}
      </div>
      <button onClick={() => { onReply(msg); onClose(); }} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-white/80 hover:bg-indigo-500/20 hover:text-indigo-300">
        <CornerUpLeft size={16} /> Reply
      </button>
      {isOwn && (
        <button onClick={() => { onEdit(msg); onClose(); }} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-white/80 hover:bg-indigo-500/20 hover:text-indigo-300">
          <Edit2 size={16} /> Edit Message
        </button>
      )}
      <button onClick={() => { navigator.clipboard.writeText(msg.plaintext || ""); onClose(); }} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-white/80 hover:bg-white/10">
        <MessageSquare size={16} /> Copy Text
      </button>
    </div>
  );
};

/* ─── Shared Message Item ─── */
const SharedMessageItem = ({ msg, isFirst, groupItem, me, isUnlocked, onContextMenu, onReply, onEdit, onReact }) => {
  const isOwn = msg.senderId === me.id;
  const longPress = useLongPress((e) => {
    // Skip menu if they are long-pressing the actual message text (allow native select)
    if (e.target.closest('.msg-text-area')) return;
    const touch = e.touches?.[0];
    if (touch) onContextMenu(e, msg, { isOwn, touchX: touch.clientX, touchY: touch.clientY });
  });

  let lastTap = 0;
  const handleTap = (e) => {
    if (!isUnlocked) { onReply({ openKeyPrompt: true }); return; }
    const now = Date.now();
    if (now - lastTap < 300) onReply(msg);
    lastTap = now;
  };

  const getGarbage = (text) => {
    if (!text) return "eW91X2FyZV9ub3RfbWVhbnRfdG9fcmVhZDF0aGlzCg==";
    // Return a sliced version of the ciphertext to look like real encrypted data
    return text.substring(0, 60) + "...";
  };

  const replyBanner = msg.replyTo && (
    <div 
      onClick={(e) => { e.stopPropagation(); document.getElementById(`msg-${msg.reply_to_id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}
      className="flex items-center gap-1.5 text-[12px] text-white/30 mb-2.5 ml-[56px] md:ml-[58px] mr-4 relative group/reply cursor-pointer hover:text-white/50 transition-colors"
    >
      <div className="absolute -left-9 md:-left-10 top-[11px] w-7 md:w-9 h-[22px] border-l-2 border-t-2 border-white/[0.08] rounded-tl-[12px] pointer-events-none" />
      <div className="w-4 h-4 rounded-full bg-white/[0.07] flex items-center justify-center text-[8px] font-bold text-white/30 flex-shrink-0">
        {msg.replyTo.senderUsername?.[0]?.toUpperCase() || '?'}
      </div>
      <span className="font-bold text-white/40 hover:text-indigo-400 transition-colors">@{msg.replyTo.senderUsername}</span>
      <span className="truncate italic max-w-[400px] opacity-80">
        {isUnlocked && msg.replyTo.plaintext ? msg.replyTo.plaintext : (msg.replyTo.plaintext === null ? "Decryption failed" : "Replied to an encrypted message")}
      </span>
    </div>
  );

  return (
    <div id={`msg-${msg.id}`} className={`group/msg relative pt-0.5 hover:bg-white/[0.02] ${isFirst ? (msg.replyTo ? 'mt-2' : 'mt-[17px]') : ''}`} 
         onContextMenu={(e) => onContextMenu(e, msg, { isOwn })}
         onTouchStart={longPress.onTouchStart}
         onTouchMove={longPress.onTouchMove}
         onTouchEnd={(e) => { longPress.onTouchEnd(e); handleTap(e); }}
         onClick={handleTap}>
      {replyBanner}
      <div className="flex gap-4 px-4 py-0.5">
        {isFirst ? (
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 mt-0.5 ${isOwn ? 'bg-indigo-600/20 text-indigo-400' : 'bg-white/[0.08] text-white/40'}`}>
            {groupItem.senderUsername?.[0]?.toUpperCase() || '?'}
          </div>
        ) : (
          <div className="w-10 flex-shrink-0 flex items-center justify-center">
            <span className="text-[10px] text-transparent group-hover/msg:text-white/20 font-mono transition-colors">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        )}

        <div className="flex-1 min-w-0">
          {isFirst && (
            <div className="flex items-baseline gap-2">
              <span className={`font-semibold text-sm ${isOwn ? 'text-indigo-400' : 'text-white/90'}`}>{groupItem.senderUsername}</span>
              <span className="text-[11px] text-white/20">{formatDiscordTime(groupItem.firstTime)}</span>
            </div>
          )}
          
          <p className="msg-text-area text-[15px] text-white/[0.75] leading-[1.625] mt-0.5 select-text">
            {isUnlocked && msg.plaintext ? msg.plaintext : (
              <span className="font-mono text-[12.5px] text-white/20 break-all select-none opacity-60 tracking-tighter leading-relaxed italic">
                {getGarbage(msg.ciphertext)}
              </span>
            )}
            {msg.edited_at && <span className="text-[10px] text-white/30 ml-2">(edited)</span>}
          </p>

          {msg.reactions && Object.keys(msg.reactions).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {Object.entries(msg.reactions).map(([emoji, users]) => (
                <button key={emoji} onClick={(e) => { e.stopPropagation(); onReact(msg, emoji); }} className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] border ${users.includes(me.id) ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300' : 'bg-white/5 border-white/10 text-white/60'} hover:bg-white/10 transition-colors`}>
                  <span>{emoji}</span>
                  <span className="font-bold">{users.length}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        
        <div className="absolute right-4 -top-2 hidden group-hover/msg:flex md:flex opacity-0 group-hover/msg:opacity-100 items-center bg-[#1a1a1e] border border-white/10 rounded-md shadow-lg overflow-hidden transition-opacity">
          <button onClick={(e) => { e.stopPropagation(); onReply(msg); }} className="p-2 text-white/50 hover:bg-white/10 hover:text-white transition-colors"><CornerUpLeft size={16} /></button>
          {isOwn && <button onClick={(e) => { e.stopPropagation(); onEdit(msg); }} className="p-2 text-white/50 hover:bg-white/10 hover:text-white transition-colors"><Edit2 size={16} /></button>}
          <button onClick={(e) => { e.stopPropagation(); onContextMenu(e, msg, { isOwn }); }} className="p-2 text-white/50 hover:bg-white/10 hover:text-white transition-colors"><MoreHorizontal size={16} /></button>
        </div>
      </div>
    </div>
  );
};

/* ─── DM Chat Panel ─── */
const ChatPanel = ({ activeChat, me, onRemoveFriend, onBack }) => {
  const [rawMessages, setRawMessages] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [chatKey, setChatKey] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const isInitialScrollDone = useRef(false);
  const chatId = useMemo(() => (me?.id && activeChat?.id) ? chatIdFor(me.id, activeChat.id) : null, [me?.id, activeChat?.id]);

  useEffect(() => {
    setRawMessages([]); setMessages([]); setIsUnlocked(false); setChatKey(""); setInput("");
    decryptCache.current.clear();
    isInitialScrollDone.current = false;
  }, [activeChat.id]);

  useEffect(() => {
    if (activeChat.isAI) {
      try { setRawMessages(JSON.parse(localStorage.getItem(`cipher_ai_${me.id}`) || "[]")); } catch { setRawMessages([]); }
      return;
    }
    let stopped = false;
    const load = async () => {
      try {
        const res = await api.messages(activeChat.id);
        if (!stopped) setRawMessages(res.messages || []);
      } catch {}
    };
    load();
    return () => { stopped = true; };
  }, [activeChat.id, activeChat.isAI, me?.id]);

  const addMessage = useCallback((m) => {
    setRawMessages(prev => {
      if (prev.find(x => x.id === m.id)) {
        console.log("[Chat] Deduplicated message arrival:", m.id);
        return prev;
      }
      
      const formatted = { 
        ...m, 
        timestamp: m.timestamp || m.created_at, 
        senderId: m.senderId || m.sender_id, 
        receiverId: m.receiverId || m.receiver_id,
        reactions: m.reactions || {}
      };

      // Stitch reply context if missing but we have the ID
      if (formatted.reply_to_id && !formatted.replyTo) {
        const original = prev.find(x => x.id === formatted.reply_to_id);
        if (original) {
          formatted.replyTo = { 
            ciphertext: original.ciphertext, 
            iv: original.iv, 
            senderUsername: original.senderId === me.id ? me.username : activeChat.username,
            plaintext: original.plaintext // Might already be decrypted in cache
          };
        }
      }

      console.log("[Chat] State update: adding message", m.id, "Total in state:", prev.length + 1);
      const next = [...prev, formatted];
      saveMessages([formatted]);
      return next;
    });
  }, [me?.id, me?.username, activeChat?.username]);

  useMessageListener(chatId, false, useCallback((payload) => {
    if (payload.eventType === 'INSERT') {
      console.log("[Chat] Realtime INSERT received:", payload.new.id);
      addMessage(payload.new);
    } else if (payload.eventType === 'UPDATE') {
      const m = payload.new;
      setRawMessages(prev => prev.map(x => x.id === m.id ? { ...x, ...m, timestamp: m.created_at } : x));
      saveMessages([{ ...m, timestamp: m.created_at }]);
    } else if (payload.eventType === 'DELETE') {
      setRawMessages(prev => prev.filter(x => x.id !== payload.old.id));
    }
  }, [addMessage]));

  const { typingUsers, sendTypingEvent } = useTypingIndicator(chatId, me);
  const [contextMenu, setContextMenu] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [editingMsg, setEditingMsg] = useState(null);

  useEffect(() => {
    if (!activeChat.isAI) sendTypingEvent(input.length > 0);
  }, [input]);

  const decryptCache = useRef(new Map());

  useEffect(() => {
    decryptCache.current.clear();
  }, [chatKey]);

  useEffect(() => {
    (async () => {
      if (!isUnlocked || !chatKey) { setMessages(rawMessages.map(m => ({ ...m, plaintext: null }))); return; }
      const resolved = await Promise.all(rawMessages.map(async (m) => {
        let pt = decryptCache.current.get(m.id);
        if (pt === undefined) {
          try {
            pt = await decryptMessage({ ciphertext: m.ciphertext, iv: m.iv, passphrase: chatKey, chatId });
            decryptCache.current.set(m.id, pt);
          } catch { pt = null; }
        }
        
        let rpt = null;
        if (m.replyTo) {
          const rKey = `reply-${m.id}`;
          rpt = decryptCache.current.get(rKey);
          if (rpt === undefined) {
            try {
              rpt = await decryptMessage({ ciphertext: m.replyTo.ciphertext, iv: m.replyTo.iv, passphrase: chatKey, chatId });
              decryptCache.current.set(rKey, rpt);
            } catch { rpt = null; }
          }
        }

        return { 
          ...m, 
          plaintext: pt, 
          replyTo: m.replyTo ? { ...m.replyTo, plaintext: rpt } : null 
        };
      }));
      setMessages(resolved);
    })();
  }, [rawMessages, isUnlocked, chatKey, chatId]);

  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current;
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
      if (!isInitialScrollDone.current || isNearBottom) {
        el.scrollTo({ top: el.scrollHeight, behavior: isInitialScrollDone.current ? "smooth" : "auto" });
        if (messages.length > 0) isInitialScrollDone.current = true;
      }
    }
  }, [messages]);

  const send = async (e) => {
    e.preventDefault();
    if (!input.trim() || !isUnlocked || !chatKey || isSending) return;
    setIsSending(true);

    try {
      if (editingMsg) {
        const payload = await encryptMessage({ plaintext: input.trim(), passphrase: chatKey, chatId });
        await api.editMessage(editingMsg.id, payload);
        const newMsg = { ...editingMsg, plaintext: input.trim(), ciphertext: payload.ciphertext, iv: payload.iv, edited_at: new Date().toISOString() };
        setMessages(p => p.map(m => m.id === newMsg.id ? newMsg : m));
        setRawMessages(p => p.map(m => m.id === newMsg.id ? newMsg : m));
        setEditingMsg(null); setInput(""); return;
      }

      const payload = await encryptMessage({ plaintext: input.trim(), passphrase: chatKey, chatId });

      if (activeChat.isAI) {
        const now = Date.now();
        addMessage({ id: `local_${now}`, senderId: me.id, receiverId: AI_USER.id, ...payload, timestamp: now });
        setInput(""); setIsSending(false); inputRef.current?.focus();
        setTimeout(async () => {
          const aiP = await encryptMessage({ plaintext: "AI relay active. Secure channel received.", passphrase: chatKey, chatId });
          addMessage({ id: `local_${Date.now()}`, senderId: AI_USER.id, receiverId: me.id, ...aiP, timestamp: Date.now() });
        }, 1000 + Math.random() * 1000);
        return;
      }

      console.log("[Chat] Sending message...", { chatId, peerId: activeChat.id });
      const res = await api.sendMessage(activeChat.id, payload, replyTo?.id);
      console.log("[Chat] Message sent successfully:", res.message.id);
      addMessage(res.message);
      setInput(""); setReplyTo(null); 
      setTimeout(() => inputRef.current?.focus(), 50);
    } catch (err) { 
      console.error("[Chat] Send failed:", err);
      alert("Failed: " + (err.message || "Unknown error")); 
    }
    finally { setIsSending(false); }
  };

  const handleReact = async (msg, emoji) => {
    try {
      const reacts = msg.reactions || {};
      const usrs = reacts[emoji] || [];
      const isReacted = usrs.includes(me.id);
      const newUsrs = isReacted ? usrs.filter(u => u !== me.id) : [...usrs, me.id];
      const newReacts = { ...reacts, [emoji]: newUsrs };
      if (newUsrs.length === 0) delete newReacts[emoji];
      
      await api.reactToMessage(msg.id, newReacts);
      const newMsg = { ...msg, reactions: newReacts };
      setMessages(p => p.map(m => m.id === msg.id ? newMsg : m));
      setRawMessages(p => p.map(m => m.id === msg.id ? newMsg : m));
    } catch (err) { console.error("Reaction failed"); }
  };

  const handleContextMenu = (e, msg, extra = {}) => {
    e.preventDefault();
    const x = e.clientX || extra.touchX || 0;
    const y = e.clientY || extra.touchY || 0;
    setContextMenu({ x, y, msg, isOwn: extra.isOwn ?? (msg.senderId === me.id) });
  };

  const handleReply = (msg) => { 
    if (msg?.openKeyPrompt) { setShowKey(true); return; }
    setReplyTo(msg); 
    setTimeout(() => inputRef.current?.focus(), 50);
  };
  const handleEdit = (msg) => { 
    if (!isUnlocked) { setShowKey(true); return; }
    setEditingMsg(msg); 
    setInput(msg.plaintext || ""); 
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  useEffect(() => {
    if (isUnlocked && activeChat) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isUnlocked, activeChat?.id]);



  const displayMessages = messages.map(m => ({ ...m, senderUsername: m.senderId === me.id ? me.username : activeChat.username }));
  const msgGroups = groupMessages(displayMessages);

  return (
    <div className="h-full flex flex-col relative mobile-view-transition">
      {/* Header */}
      <div className="h-13 md:h-12 border-b border-white/[0.06] flex items-center px-3 md:px-4 gap-2 md:gap-3 flex-shrink-0 bg-[#0c0c0e] safe-top">
        <button onClick={onBack} className="md:hidden p-2.5 -ml-1 text-white/50 active:text-white active:bg-white/5 rounded-xl transition-colors"><ChevronLeft size={22} /></button>
        <AtSign size={18} className="text-white/30 hidden md:block" />
        <span className="font-semibold text-[15px] text-white/90 truncate">{activeChat.username}</span>
        <div className="flex-1" />
        <div className="hidden sm:flex items-center gap-1.5 text-[10px] mr-2">
          <div className={`w-1.5 h-1.5 rounded-full ${isUnlocked ? 'bg-green-500' : 'bg-amber-500 animate-pulse'}`} />
          <span className={isUnlocked ? 'text-green-500/70' : 'text-amber-500/70'}>{isUnlocked ? 'Decrypted' : 'Encrypted'}</span>
        </div>
        <button onClick={() => setShowKey(true)} className={`p-2.5 rounded-xl transition-colors active:bg-white/5 ${isUnlocked ? 'text-green-500/50' : 'text-amber-500'}`}><Key size={18} /></button>
        {!activeChat.isAI && <button onClick={() => onRemoveFriend?.(activeChat.id)} className="p-2.5 rounded-xl text-white/20 active:text-red-400 active:bg-red-500/10 transition-colors"><UserMinus size={18} /></button>}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto discord-scrollbar">
        <div className="px-4 pt-8 pb-4">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 text-3xl font-bold ${activeChat.isAI ? 'bg-indigo-600/20 text-indigo-400' : 'bg-white/[0.08] text-white/40'}`}>
            {activeChat.isAI ? <Sparkles size={36} /> : activeChat.username[0].toUpperCase()}
          </div>
          <h2 className="text-xl font-bold text-white">{activeChat.username}</h2>
          <p className="text-sm text-white/30 mt-1">This is the beginning of your direct message history with <strong className="text-white/50">@{activeChat.username}</strong>.</p>
          {!isUnlocked && (
            <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-amber-500 font-bold text-xs uppercase tracking-wider">
                <Lock size={14} /> End-to-End Encrypted
              </div>
              <p className="text-xs text-white/40 leading-relaxed">Messages in this chat are securely scrambled. You must enter the shared passkey to reveal the conversation.</p>
              <button onClick={() => setShowKey(true)} className="w-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-500 py-2 rounded-lg text-xs font-bold transition-all border border-amber-500/20">Enter Unlock Passkey</button>
            </div>
          )}
          <div className="h-px bg-white/[0.06] mt-6" />
        </div>
        {msgGroups.map((g, gi) => (
          <React.Fragment key={`group-${g.messages[0].id}`}>
            {g.newDay && <div className="flex items-center gap-4 px-4 my-4"><div className="flex-1 h-px bg-white/[0.06]" /><span className="text-[11px] font-semibold text-white/30">{formatDateSeparator(g.firstTime)}</span><div className="flex-1 h-px bg-white/[0.06]" /></div>}
            <SharedMessageItem key={g.messages[0].id} msg={g.messages[0]} isFirst={true} groupItem={g} me={me} isUnlocked={isUnlocked} onContextMenu={handleContextMenu} onReply={handleReply} onEdit={handleEdit} onReact={handleReact} />
            {g.messages.slice(1).map(m => (
              <SharedMessageItem key={m.id} msg={m} me={me} isUnlocked={isUnlocked} onContextMenu={handleContextMenu} onReply={handleReply} onEdit={handleEdit} onReact={handleReact} />
            ))}
          </React.Fragment>
        ))}
        {typingUsers.length > 0 && (
          <div className="px-4 py-2 flex items-center gap-2">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-xs font-semibold text-white/40">{typingUsers.join(", ")} {typingUsers.length > 1 ? "are" : "is"} typing...</span>
          </div>
        )}
        <div className="h-6" />
      </div>

      {/* Input */}
      <div className="px-3 md:px-4 pb-5 md:pb-6 pt-2 flex-shrink-0 safe-bottom">
        {(replyTo || editingMsg) && (
          <div className="mb-2 bg-indigo-500/10 border border-indigo-500/20 rounded-t-xl px-4 py-2 flex items-center justify-between text-xs text-indigo-300">
            <div className="flex items-center gap-2 truncate">
              {replyTo ? <CornerUpLeft size={14} /> : <Edit2 size={14} />}
              <span className="font-semibold">{replyTo ? `Replying to ${replyTo.senderUsername}` : "Editing Message"}</span>
            </div>
            <button onClick={() => { setReplyTo(null); setEditingMsg(null); setInput(""); }} className="p-1 hover:bg-white/10 rounded-full"><X size={14} /></button>
          </div>
        )}
        <form onSubmit={send} className={`bg-white/[0.04] rounded-xl px-3 md:px-4 flex items-center border ${replyTo || editingMsg ? 'border-t-0 rounded-t-none' : 'border-white/[0.06]'} focus-within:border-white/10 transition-colors`}>
          {!isUnlocked && <button type="button" onClick={() => setShowKey(true)} className="p-2.5 -ml-1 text-amber-500 active:text-amber-400"><Lock size={20} /></button>}
          <input ref={inputRef} disabled={!isUnlocked || isSending} 
            autoComplete="one-time-code" name="message_body"
            spellCheck="false" autoCorrect="off" autoCapitalize="off"
            className="flex-1 bg-transparent py-3.5 text-[16px] md:text-[15px] outline-none text-white/80 placeholder:text-white/20 disabled:opacity-30"
            placeholder={isUnlocked ? `Message @${activeChat.username}` : "Tap 🔑 to unlock"} value={input} onChange={(e) => setInput(e.target.value)} />
          {isUnlocked && <button type="submit" disabled={!input.trim() || isSending} className="p-2.5 text-white/30 active:text-indigo-400 disabled:opacity-20 transition-colors">
            {isSending ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
          </button>}
        </form>
      </div>
      {showKey && <KeyModal title="Encryption Key" onClose={() => setShowKey(false)} onSubmit={(k) => { setChatKey(k); setIsUnlocked(true); setShowKey(false); }} />}
      {contextMenu && (
        <MessageContextMenu 
          {...contextMenu} 
          onClose={() => setContextMenu(null)}
          onReact={handleReact}
          onReply={(msg) => { setReplyTo(msg); inputRef.current?.focus(); }}
          onEdit={(msg) => { setEditingMsg(msg); setInput(msg.plaintext || ""); inputRef.current?.focus(); }}
        />
      )}
    </div>
  );
};

/* ─── Group Chat Panel ─── */
const GroupChatPanel = ({ activeGroup, me, onBack, onExitGroup }) => {
  const [rawMessages, setRawMessages] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [chatKey, setChatKey] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [addableFriends, setAddableFriends] = useState([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [addingId, setAddingId] = useState("");
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const isInitialScrollDone = useRef(false);
  const chatId = useMemo(() => groupChatIdFor(activeGroup.id), [activeGroup.id]);

  useEffect(() => {
    setRawMessages([]); setMessages([]); setIsUnlocked(false); setChatKey(""); setInput(""); 
    decryptCache.current.clear(); 
    isInitialScrollDone.current = false;
  }, [activeGroup.id]);

  useEffect(() => {
    let stopped = false;
    const load = async () => {
      try {
        const res = await api.groupMessages(activeGroup.id);
        if (!stopped) setRawMessages(res.messages || []);
      } catch { if (!stopped) setRawMessages([]); }
    };
    load();
    return () => { stopped = true; };
  }, [activeGroup.id]);

  const addMessage = useCallback((m) => {
    setRawMessages(prev => {
      if (prev.find(x => x.id === m.id)) {
        console.log("[Group] Deduplicated message arrival:", m.id);
        return prev;
      }
      const formatted = { 
        ...m, 
        timestamp: m.timestamp || m.created_at, 
        senderId: m.senderId || m.sender_id, 
        reactions: m.reactions || {},
        senderUsername: m.senderUsername || m.u?.username || 'Member'
      };

      if (formatted.reply_to_id && !formatted.replyTo) {
        const original = prev.find(x => x.id === formatted.reply_to_id);
        if (original) {
          formatted.replyTo = { 
            ciphertext: original.ciphertext, 
            iv: original.iv, 
            senderUsername: original.senderUsername || original.u?.username || 'Member',
            plaintext: original.plaintext
          };
        }
      }

      console.log("[Group] State update: adding message", m.id, "Total in state:", prev.length + 1);
      const next = [...prev, formatted];
      saveMessages([formatted]);
      return next;
    });
  }, []);

  useMessageListener(activeGroup.id, true, useCallback((payload) => {
    if (payload.eventType === 'INSERT') {
      addMessage(payload.new);
    } else if (payload.eventType === 'UPDATE') {
      const m = payload.new;
      setRawMessages(prev => prev.map(x => x.id === m.id ? { ...x, ...m, timestamp: m.created_at } : x));
      saveMessages([{ ...m, timestamp: m.created_at }]);
    } else if (payload.eventType === 'DELETE') {
      setRawMessages(prev => prev.filter(x => x.id !== payload.old.id));
    }
  }, [activeGroup.id, addMessage]));

  const { typingUsers, sendTypingEvent } = useTypingIndicator(chatId, me);
  const [contextMenu, setContextMenu] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [editingMsg, setEditingMsg] = useState(null);

  const handleReply = (msg) => { 
    if (msg?.openKeyPrompt) { setShowKey(true); return; }
    setReplyTo(msg); 
    setTimeout(() => inputRef.current?.focus(), 50);
  };
  const handleEdit = (msg) => { 
    if (!isUnlocked) { setShowKey(true); return; }
    setEditingMsg(msg); 
    setInput(msg.plaintext || ""); 
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  useEffect(() => {
    if (isUnlocked && activeGroup) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isUnlocked, activeGroup?.id]);

  useEffect(() => {
    sendTypingEvent(input.length > 0);
  }, [input]);

  const decryptCache = useRef(new Map());

  useEffect(() => {
    decryptCache.current.clear();
  }, [chatKey]);

  useEffect(() => {
    (async () => {
      if (!isUnlocked || !chatKey) { setMessages(rawMessages.map(m => ({ ...m, plaintext: null }))); return; }
      const resolved = await Promise.all(rawMessages.map(async (m) => {
        let pt = decryptCache.current.get(m.id);
        if (pt === undefined) {
          try {
            pt = await decryptMessage({ ciphertext: m.ciphertext, iv: m.iv, passphrase: chatKey, chatId });
            decryptCache.current.set(m.id, pt);
          } catch { pt = null; }
        }

        let rpt = null;
        if (m.replyTo) {
          const rKey = `reply-${m.id}`;
          rpt = decryptCache.current.get(rKey);
          if (rpt === undefined) {
            try {
              rpt = await decryptMessage({ ciphertext: m.replyTo.ciphertext, iv: m.replyTo.iv, passphrase: chatKey, chatId });
              decryptCache.current.set(rKey, rpt);
            } catch { rpt = null; }
          }
        }

        return { 
          ...m, 
          plaintext: pt, 
          replyTo: m.replyTo ? { ...m.replyTo, plaintext: rpt } : null 
        };
      }));
      setMessages(resolved);
    })();
  }, [rawMessages, isUnlocked, chatKey, chatId]);

  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current;
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
      if (!isInitialScrollDone.current || isNearBottom) {
        el.scrollTo({ top: el.scrollHeight, behavior: isInitialScrollDone.current ? "smooth" : "auto" });
        if (messages.length > 0) isInitialScrollDone.current = true;
      }
    }
  }, [messages]);

  const send = async (e) => {
    e.preventDefault();
    if (!input.trim() || !isUnlocked || !chatKey || isSending) return;
    setIsSending(true);
    
    try {
      if (editingMsg) {
        const payload = await encryptMessage({ plaintext: input.trim(), passphrase: chatKey, chatId });
        await api.editGroupMessage(editingMsg.id, payload);
        const newMsg = { ...editingMsg, plaintext: input.trim(), ciphertext: payload.ciphertext, iv: payload.iv, edited_at: new Date().toISOString() };
        setMessages(p => p.map(m => m.id === newMsg.id ? newMsg : m));
        setRawMessages(p => p.map(m => m.id === newMsg.id ? newMsg : m));
        setEditingMsg(null); setInput(""); return;
      }

      const payload = await encryptMessage({ plaintext: input.trim(), passphrase: chatKey, chatId });
      console.log("[Group] Sending message...", { groupId: activeGroup.id });
      const res = await api.sendGroupMessage(activeGroup.id, payload, replyTo?.id);
      console.log("[Group] Message sent successfully:", res.message.id);
      addMessage({ ...res.message, senderUsername: me.username });
      setInput(""); setReplyTo(null); 
      setTimeout(() => inputRef.current?.focus(), 50);
    } catch (err) {
      console.error("[Group] Send failed:", err);
      alert("Group send failed: " + (err.message || "Check friendship or membership"));
    } finally { setIsSending(false); }
  };

  const handleReact = async (msg, emoji) => {
    try {
      const reacts = msg.reactions || {};
      const usrs = reacts[emoji] || [];
      const isReacted = usrs.includes(me.id);
      const newUsrs = isReacted ? usrs.filter(u => u !== me.id) : [...usrs, me.id];
      const newReacts = { ...reacts, [emoji]: newUsrs };
      if (newUsrs.length === 0) delete newReacts[emoji];
      
      await api.reactToGroupMessage(msg.id, newReacts);
      const newMsg = { ...msg, reactions: newReacts };
      setMessages(p => p.map(m => m.id === msg.id ? newMsg : m));
      setRawMessages(p => p.map(m => m.id === msg.id ? newMsg : m));
    } catch (err) {}
  };

  const handleContextMenu = (e, msg, extra = {}) => {
    e.preventDefault();
    const x = e.clientX || extra.touchX || 0;
    const y = e.clientY || extra.touchY || 0;
    setContextMenu({ x, y, msg, isOwn: extra.isOwn ?? (msg.sender_id === me.id) });
  };

  const openAddFriend = async () => {
    setShowAddFriend(true); setLoadingFriends(true);
    try { const res = await api.groupFriendOptions(activeGroup.id); setAddableFriends(res.friends || []); } catch { setAddableFriends([]); } finally { setLoadingFriends(false); }
  };

  const addFriend = async (fid) => {
    setAddingId(fid);
    try { await api.addFriendToGroup(activeGroup.id, fid); setAddableFriends(prev => prev.filter(f => f.id !== fid)); } catch {} finally { setAddingId(""); }
  };

  const msgGroups = groupMessages(messages);

  return (
    <div className="h-full flex flex-col relative">
      <div className="h-12 border-b border-white/[0.06] flex items-center px-4 gap-3 flex-shrink-0 bg-[#0c0c0e]">
        <button onClick={onBack} className="md:hidden p-1 text-white/40 hover:text-white"><Menu size={20} /></button>
        <Hash size={18} className="text-white/30" />
        <span className="font-semibold text-[15px] text-white/90">{activeGroup.name}</span>
        <div className="flex-1" />
        <div className="flex items-center gap-1.5 text-[10px] mr-2">
          <div className={`w-1.5 h-1.5 rounded-full ${isUnlocked ? 'bg-green-500' : 'bg-amber-500 animate-pulse'}`} />
          <span className={isUnlocked ? 'text-green-500/70' : 'text-amber-500/70'}>{isUnlocked ? 'Decrypted' : 'Encrypted'}</span>
        </div>
        <button onClick={() => setShowKey(true)} className={`p-1.5 rounded transition-colors ${isUnlocked ? 'text-green-500/50 hover:text-green-400' : 'text-amber-500 hover:text-amber-400'}`}><Key size={16} /></button>
        <button onClick={openAddFriend} className="p-1.5 rounded text-white/20 hover:text-green-400 transition-colors"><UserPlus size={16} /></button>
        <button onClick={() => onExitGroup(activeGroup.id)} className="p-1.5 rounded text-white/20 hover:text-red-400 transition-colors"><LogOut size={16} /></button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto discord-scrollbar">
        <div className="px-4 pt-8 pb-4">
          <div className="w-20 h-20 rounded-full bg-white/[0.08] flex items-center justify-center mb-4 text-3xl font-bold text-white/40">#</div>
          <h2 className="text-xl font-bold text-white">Welcome to #{activeGroup.name}</h2>
          <p className="text-sm text-white/30 mt-1">This is the start of the <strong className="text-white/50">#{activeGroup.name}</strong> group.</p>
          {!isUnlocked && (
            <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-amber-500 font-bold text-xs uppercase tracking-wider">
                <Lock size={14} /> End-to-End Encrypted
              </div>
              <p className="text-xs text-white/40 leading-relaxed">Group messages are securely scrambled. You must enter the shared passkey to reveal the conversation.</p>
              <button onClick={() => setShowKey(true)} className="w-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-500 py-2 rounded-lg text-xs font-bold transition-all border border-amber-500/20">Enter Group Passkey</button>
            </div>
          )}
          <div className="h-px bg-white/[0.06] mt-6" />
        </div>
        {msgGroups.map((g, gi) => (
          <React.Fragment key={`group-${g.messages[0].id}`}>
            {g.newDay && <div className="flex items-center gap-4 px-4 my-4"><div className="flex-1 h-px bg-white/[0.06]" /><span className="text-[11px] font-semibold text-white/30">{formatDateSeparator(g.firstTime)}</span><div className="flex-1 h-px bg-white/[0.06]" /></div>}
            <SharedMessageItem key={g.messages[0].id} msg={g.messages[0]} isFirst={true} groupItem={g} me={me} isUnlocked={isUnlocked} onContextMenu={handleContextMenu} onReply={handleReply} onEdit={handleEdit} onReact={handleReact} />
            {g.messages.slice(1).map(m => (
              <SharedMessageItem key={m.id} msg={m} me={me} isUnlocked={isUnlocked} onContextMenu={handleContextMenu} onReply={handleReply} onEdit={handleEdit} onReact={handleReact} />
            ))}
          </React.Fragment>
        ))}
        {typingUsers.length > 0 && (
          <div className="px-4 py-2 flex items-center gap-2">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-xs font-semibold text-white/40">{typingUsers.join(", ")} {typingUsers.length > 1 ? "are" : "is"} typing...</span>
          </div>
        )}
        <div className="h-6" />
      </div>

      <div className="px-3 md:px-4 pb-5 md:pb-6 pt-2 flex-shrink-0 safe-bottom">
        {(replyTo || editingMsg) && (
          <div className="mb-2 bg-indigo-500/10 border border-indigo-500/20 rounded-t-xl px-4 py-2 flex items-center justify-between text-xs text-indigo-300">
            <div className="flex items-center gap-2 truncate">
              {replyTo ? <CornerUpLeft size={14} /> : <Edit2 size={14} />}
              <span className="font-semibold">{replyTo ? `Replying to ${replyTo.senderUsername}` : "Editing Message"}</span>
            </div>
            <button onClick={() => { setReplyTo(null); setEditingMsg(null); setInput(""); }} className="p-1 hover:bg-white/10 rounded-full"><X size={14} /></button>
          </div>
        )}
        <form onSubmit={send} className={`bg-white/[0.04] rounded-xl px-3 md:px-4 flex items-center border ${replyTo || editingMsg ? 'border-t-0 rounded-t-none' : 'border-white/[0.06]'} focus-within:border-white/10 transition-colors`}>
          {!isUnlocked && <button type="button" onClick={() => setShowKey(true)} className="p-2 -ml-1 text-amber-500"><Lock size={18} /></button>}
          <input ref={inputRef} disabled={!isUnlocked || isSending} 
            autoComplete="one-time-code" name="group_message_body"
            spellCheck="false" autoCorrect="off" autoCapitalize="off"
            className="flex-1 bg-transparent py-3 text-[15px] outline-none text-white/80 placeholder:text-white/20 disabled:opacity-30"
            placeholder={isUnlocked ? `Message #${activeGroup.name}` : "Enter passkey to unlock"} value={input} onChange={(e) => setInput(e.target.value)} />
          {isUnlocked && <button type="submit" disabled={!input.trim() || isSending} className="p-2 text-white/30 hover:text-indigo-400 disabled:opacity-20">
            {isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>}
        </form>
      </div>
      {showKey && <KeyModal title="Group Key" onClose={() => setShowKey(false)} onSubmit={(k) => { setChatKey(k); setIsUnlocked(true); setShowKey(false); }} />}
      {contextMenu && (
        <MessageContextMenu 
          {...contextMenu} 
          onClose={() => setContextMenu(null)}
          onReact={handleReact}
          onReply={(msg) => { setReplyTo(msg); inputRef.current?.focus(); }}
          onEdit={(msg) => { setEditingMsg(msg); setInput(msg.plaintext || ""); inputRef.current?.focus(); }}
        />
      )}
      {showAddFriend && (
        <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-xl flex items-center justify-center p-6">
          <div className="bg-[#1a1a1e] border border-white/10 p-6 rounded-2xl w-full max-w-sm space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-widest text-white/50">Invite to Group</h3>
              <button onClick={() => setShowAddFriend(false)} className="p-1 text-white/20 hover:text-white"><X size={16} /></button>
            </div>
            {loadingFriends ? <div className="py-8 text-center text-white/20 text-sm flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading...</div>
            : addableFriends.length ? <div className="space-y-2 max-h-60 overflow-y-auto">{addableFriends.map(f => (
              <div key={f.id} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] hover:bg-white/[0.05]">
                <span className="text-sm text-white/80">@{f.username}</span>
                <button onClick={() => addFriend(f.id)} disabled={addingId === f.id} className="px-3 py-1 bg-indigo-600/20 text-indigo-400 rounded text-xs font-bold hover:bg-indigo-600 hover:text-white transition-colors disabled:opacity-50">{addingId === f.id ? "..." : "Invite"}</button>
              </div>
            ))}</div>
            : <div className="py-8 text-center text-white/20 text-sm">No friends to invite</div>}
          </div>
        </div>
      )}
    </div>
  );
};

/* ─── Main App ─── */
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

  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarFilter, setSidebarFilter] = useState("");
  const [groupNameInput, setGroupNameInput] = useState("");
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);

  const [activeChat, setActiveChat] = useState(null);
  const [activeGroup, setActiveGroup] = useState(null);
  const [friendsTab, setFriendsTab] = useState("all");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(true);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [notificationPrefs, setNotificationPrefs] = useState(() => {
    try { return { ...DEFAULT_NOTIFICATION_PREFS, ...JSON.parse(localStorage.getItem(NOTIFICATION_PREFS_KEY)) }; } catch { return DEFAULT_NOTIFICATION_PREFS; }
  });

  const onlineUsers = usePresence(me);

  const loadNetwork = async (search = "") => {
    const [usersRes, friendsRes, requestsRes, myGroupsRes] = await Promise.allSettled([api.users(search), api.friends(), api.friendRequests(), api.myGroups()]);
    if (usersRes.status === "fulfilled") setUsers(usersRes.value.users || []);
    if (friendsRes.status === "fulfilled") setFriends([AI_USER, ...(friendsRes.value.friends || [])]);
    if (requestsRes.status === "fulfilled") { setIncomingRequests(requestsRes.value.incoming || []); setOutgoingRequests(requestsRes.value.outgoing || []); }
    if (myGroupsRes.status === "fulfilled") setMyGroups(myGroupsRes.value.groups || []);
  };

  useEffect(() => {
    (async () => {
      try {
        await api.getCsrf();
        const r = await api.me();
        setMe(r.user);
        setView("main");
        // Load network in background - don't block the view
        loadNetwork("");
      } catch { setView("auth"); }
    })();
  }, []);
  useEffect(() => { if (me) loadNetwork(searchQuery).catch(() => {}); }, [me, searchQuery]);
  
  // Realtime list refresh (zero polling!)
  const refresh = useCallback(() => loadNetwork(searchQuery).catch(() => {}), [searchQuery]);
  useTableListener('friendships', 'user_id', me?.id, refresh);
  useTableListener('friendships', 'friend_id', me?.id, refresh);
  useTableListener('friend_requests', 'from_user_id', me?.id, refresh);
  useTableListener('friend_requests', 'to_user_id', me?.id, refresh);
  useTableListener('group_members', 'user_id', me?.id, refresh);
  
  useEffect(() => { try { localStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(notificationPrefs)); } catch {} }, [notificationPrefs]);

  const handleAuth = async (e) => {
    e.preventDefault(); setAuthError(""); setIsProcessing(true);
    try { await api.getCsrf(); const res = await (authMode === "login" ? api.login : api.register)({ username, password }); setMe(res.user); setView("main"); await loadNetwork(""); }
    catch (err) { setAuthError(err.message || "Authentication failed"); }
    finally { setIsProcessing(false); }
  };

  const onLogout = async () => { try { await api.logout(); } catch {} setView("auth"); setMe(null); setActiveChat(null); setActiveGroup(null); setUsers([]); setFriends([]); setIncomingRequests([]); setOutgoingRequests([]); setMyGroups([]); setPassword(""); };
  const sendFriendReq = async (id) => {
    // Optimistic: immediately show as outgoing
    const target = users.find(u => u.id === id);
    if (target) setOutgoingRequests(p => [...p, { toUserId: id, username: target.username }]);
    try { await api.sendFriendRequest(id); loadNetwork(searchQuery); }
    catch (err) { setOutgoingRequests(p => p.filter(r => r.toUserId !== id)); alert("Failed: " + (err.message || "Error")); }
  };
  const acceptFriendReq = async (id) => {
    // Optimistic: immediately remove from incoming
    const req = incomingRequests.find(r => r.fromUserId === id);
    setIncomingRequests(p => p.filter(r => r.fromUserId !== id));
    if (req) setFriends(p => [...p, { id, username: req.username }]);
    try { await api.acceptFriendRequest(id); loadNetwork(searchQuery); }
    catch (err) { alert("Failed: " + (err.message || "Error")); loadNetwork(searchQuery); }
  };
  const rejectFriendReq = async (id) => { try { await api.rejectFriendRequest(id); setIncomingRequests(p => p.filter(r => r.fromUserId !== id)); await loadNetwork(searchQuery); } catch {} };
  const unsendFriendReq = async (id) => { try { await api.unsendFriendRequest(id); setOutgoingRequests(p => p.filter(r => r.toUserId !== id)); await loadNetwork(searchQuery); } catch {} };
  const removeFriend = async (id) => { if (!id || id === AI_USER.id) return; try { await api.removeFriend(id); if (activeChat?.id === id) setActiveChat(null); await loadNetwork(searchQuery); } catch {} };
  const createGroup = async () => { const n = groupNameInput.trim(); if (n.length < 2) return; setIsCreatingGroup(true); try { await api.createGroup({ name: n }); setGroupNameInput(""); setShowCreateGroup(false); await loadNetwork(searchQuery); } catch {} finally { setIsCreatingGroup(false); } };
  const leaveGroup = async (gid) => { try { await api.leaveGroup(gid); if (activeGroup?.id === gid) setActiveGroup(null); await loadNetwork(searchQuery); } catch {} };

  const incomingIds = useMemo(() => new Set(incomingRequests.map(r => r.fromUserId)), [incomingRequests]);
  const outgoingIds = useMemo(() => new Set(outgoingRequests.map(r => r.toUserId)), [outgoingRequests]);
  const discoveredUsers = useMemo(() => users.filter(u => u.id !== me?.id && u.username.toLowerCase().includes(searchQuery.toLowerCase()) && !friends.some(f => f.id === u.id) && !incomingIds.has(u.id) && !outgoingIds.has(u.id)), [users, me?.id, searchQuery, friends, incomingIds, outgoingIds]);
  const filteredFriends = useMemo(() => friends.filter(f => f.username.toLowerCase().includes(sidebarFilter.toLowerCase())), [friends, sidebarFilter]);
  const filteredGroups = useMemo(() => myGroups.filter(g => g.name.toLowerCase().includes(sidebarFilter.toLowerCase())), [myGroups, sidebarFilter]);

  const isMainView = !activeChat && !activeGroup;

  /* ─── AUTH ─── */
  if (view === "auth") return (
    <div className="h-screen bg-[#0a0a0c] flex items-center justify-center p-6 text-white font-sans overflow-hidden relative">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="w-full max-w-[400px] relative z-10">
        <div className="bg-[#121215]/60 border border-white/[0.04] backdrop-blur-2xl p-8 md:p-10 rounded-3xl shadow-2xl space-y-8">
          <div className="text-center space-y-3">
            <div className="w-20 h-20 bg-white/[0.04] border border-white/10 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-inner overflow-hidden flex-shrink-0">
              <img src="/logo.png" alt="Cipher Logo" className="w-full h-full object-cover" />
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tighter drop-shadow-sm uppercase">CIPHER</h1>
            <p className="text-[11px] text-white/40 uppercase tracking-[0.4em] font-medium">Encrypted. Minimalist. Private.</p>
          </div>
          <form onSubmit={handleAuth} className="space-y-4">
            <div className="relative group">
              <UserIcon size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-indigo-400 transition-colors" />
              <input className="w-full bg-white/[0.03] border border-white/[0.06] p-4 pl-11 rounded-xl outline-none text-sm focus:border-indigo-500/50 focus:bg-white/[0.05] transition-all placeholder:text-white/20 shadow-inner" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
            </div>
            <div className="relative group">
              <Fingerprint size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-indigo-400 transition-colors" />
              <input className="w-full bg-white/[0.03] border border-white/[0.06] p-4 pl-11 rounded-xl outline-none text-sm focus:border-indigo-500/50 focus:bg-white/[0.05] transition-all placeholder:text-white/20 shadow-inner" type="password" placeholder={authMode === "signup" ? "Passcode (min 10 chars)" : "Passcode"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
            </div>
            {authError && <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-xl flex items-center gap-2 text-red-400 text-xs shadow-sm"><AlertCircle size={14} className="flex-shrink-0" />{authError}</div>}
            <button disabled={isProcessing} className="w-full bg-indigo-600 hover:bg-indigo-500 rounded-xl py-4 pt-[17px] text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-50 disabled:shadow-none hover:-translate-y-0.5 active:translate-y-0">
              {isProcessing ? <Loader2 className="animate-spin mx-auto" size={18} /> : authMode === "login" ? "Sign In" : "Create Account"}
            </button>
          </form>
          <div className="pt-2">
            <button onClick={() => { setAuthMode(authMode === "login" ? "signup" : "login"); setAuthError(""); }} className="w-full text-xs text-white/40 hover:text-white/80 transition-colors py-2 font-medium">
              {authMode === "login" ? "Need an account? Register" : "Already have an account? Sign In"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  /* ─── MAIN LAYOUT ─── */
  return (
    <div onContextMenu={(e) => { if (e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") e.preventDefault(); }} className="h-[100dvh] bg-[#0a0a0c] text-white flex font-['Inter',system-ui,sans-serif] overflow-hidden">
      {/* ─── Sidebar ─── */}
      <aside className={`${mobileSidebarOpen ? 'flex' : 'hidden'} md:flex flex-col w-full md:w-[272px] bg-[#0c0c0e] border-r border-white/[0.06] flex-shrink-0 mobile-view-transition safe-top`}>
        {/* Search */}
        <div className="p-3 pb-2">
          <div className="flex items-center gap-2 bg-white/[0.04] rounded-lg px-3 py-[9px]">
            <Search size={16} className="text-white/20" />
            <input className="bg-transparent text-[14px] outline-none flex-1 text-white/70 placeholder:text-white/15" placeholder="Find a conversation" value={sidebarFilter} onChange={(e) => setSidebarFilter(e.target.value)} autoComplete="off" />
          </div>
        </div>

        {/* Friends button */}
        <button onClick={() => { setActiveChat(null); setActiveGroup(null); setMobileSidebarOpen(false); }}
          className={`mx-2 mb-1 flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors active:scale-[0.98] ${isMainView ? 'bg-white/[0.06] text-white' : 'text-white/40 hover:text-white/70 active:bg-white/[0.04]'}`}>
          <GroupsIcon size={20} /> Friends
          {incomingRequests.length > 0 && <span className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">{incomingRequests.length}</span>}
        </button>

        <div className="h-px bg-white/[0.06] mx-3 my-1.5" />

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto discord-scrollbar px-2 space-y-0.5">
          {/* DMs */}
          <div className="flex items-center justify-between px-2 pt-3 pb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-white/20">Direct Messages</span>
          </div>
          {filteredFriends.map(f => (
            <button key={f.id} onClick={() => { setActiveChat(f); setActiveGroup(null); setMobileSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-2.5 py-2 md:py-1.5 rounded-lg transition-colors active:scale-[0.98] ${activeChat?.id === f.id ? 'bg-white/[0.06] text-white' : 'text-white/40 active:bg-white/[0.04]'}`}>
              <div className="relative">
                <div className={`w-9 md:w-8 h-9 md:h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${f.isAI ? 'bg-indigo-600/25 text-indigo-400' : 'bg-white/[0.06] text-white/40'}`}>
                  {f.isAI ? <Sparkles size={14} /> : f.username[0].toUpperCase()}
                </div>
                {!f.isAI && (
                  <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#121215] transition-colors ${onlineUsers.has(f.id) ? 'bg-green-500' : 'bg-white/20'}`} />
                )}
              </div>
              <span className="text-[14px] md:text-[13px] truncate">{f.username}</span>
            </button>
          ))}

          {/* Groups */}
          <div className="flex items-center justify-between px-2 pt-4 pb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-white/20">Groups</span>
            <button onClick={() => { setShowCreateGroup(!showCreateGroup); setGroupNameInput(""); }} className="p-1 -mr-1 text-white/30 hover:text-white/80 transition-colors active:scale-95"><Plus size={16} /></button>
          </div>
          {showCreateGroup && (
            <div className="flex gap-1.5 px-2 mb-2">
              <input autoFocus className="flex-1 bg-white/[0.04] border border-white/[0.06] rounded-md px-2.5 py-1.5 text-sm outline-none text-white/80 placeholder:text-white/20 focus:border-indigo-500/50 focus:bg-white/[0.06] transition-all" placeholder="Group name..." value={groupNameInput} onChange={(e) => setGroupNameInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createGroup()} autoComplete="off" />
              <button onClick={createGroup} disabled={isCreatingGroup || groupNameInput.trim().length < 2} className="px-2.5 bg-indigo-600 rounded-md text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors flex items-center justify-center min-w-[36px]">
                {isCreatingGroup ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={3} />}
              </button>
            </div>
          )}
          {filteredGroups.map(g => (
            <button key={g.id} onClick={() => { setActiveGroup(g); setActiveChat(null); setMobileSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-2.5 py-2 md:py-1.5 rounded-lg transition-colors active:scale-[0.98] ${activeGroup?.id === g.id ? 'bg-white/[0.06] text-white' : 'text-white/40 active:bg-white/[0.04]'}`}>
              <div className="w-9 md:w-8 h-9 md:h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-xs font-bold text-white/40 flex-shrink-0">#</div>
              <span className="text-[14px] md:text-[13px] truncate">{g.name}</span>
            </button>
          ))}
        </div>

        {/* User panel */}
        <div className="p-2 border-t border-white/[0.06] bg-black/30 safe-bottom">
          <div className="flex items-center justify-between px-2 py-2 md:py-1.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 md:w-8 h-9 md:h-8 rounded-full bg-indigo-600/20 flex items-center justify-center text-sm font-bold text-indigo-400 flex-shrink-0">{me?.username?.[0]?.toUpperCase() || '?'}</div>
              <div className="min-w-0">
                <p className="text-[14px] md:text-[13px] font-medium text-white/80 truncate">{me?.username}</p>
                <p className="text-[11px] text-green-500/60 flex items-center gap-1"><span className="w-1.5 h-1.5 bg-green-500 rounded-full" />Online</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setShowSettingsModal(true)} className="p-2.5 text-white/20 active:text-white/50 rounded-xl active:bg-white/5 transition-colors"><SettingsIcon size={18} /></button>
              <button onClick={onLogout} className="p-2.5 text-white/20 active:text-red-400 rounded-xl active:bg-red-500/10 transition-colors"><LogOut size={18} /></button>
            </div>
          </div>
        </div>
      </aside>

      {/* ─── Main Content ─── */}
      <main className={`${mobileSidebarOpen && (activeChat || activeGroup) ? 'hidden md:flex' : mobileSidebarOpen ? 'hidden md:flex' : 'flex'} md:flex flex-col flex-1 min-w-0`}>
        {activeChat ? (
          <ChatPanel activeChat={activeChat} me={me} onRemoveFriend={removeFriend} onBack={() => setMobileSidebarOpen(true)} />
        ) : activeGroup ? (
          <GroupChatPanel activeGroup={activeGroup} me={me} onBack={() => setMobileSidebarOpen(true)} onExitGroup={leaveGroup} />
        ) : (
          /* ─── Friends View ─── */
          <div className="h-full flex flex-col">
            <div className="h-13 md:h-12 border-b border-white/[0.06] flex items-center px-3 md:px-4 gap-3 flex-shrink-0 bg-[#0c0c0e] safe-top md:bg-transparent">
              <button onClick={() => setMobileSidebarOpen(true)} className="md:hidden p-2 -ml-1 text-white/50 active:bg-white/5 rounded-xl transition-colors"><Menu size={22} /></button>
              <GroupsIcon size={20} className="text-white/30 hidden md:block" />
              <span className="font-semibold text-[15px] text-white/90 mr-2 md:mr-0">Friends</span>
              <div className="h-6 w-px bg-white/[0.06] hidden md:block" />
              <div className="flex-1 overflow-x-auto discord-scrollbar flex gap-1.5 md:gap-3 py-1">
                {["all", "pending", "add"].map(tab => (
                  <button key={tab} onClick={() => setFriendsTab(tab)}
                    className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all whitespace-nowrap active:scale-[0.98] ${friendsTab === tab ? 'bg-white/[0.08] text-white shadow-sm' : 'text-white/40 hover:text-white/80 hover:bg-white/[0.04]'} ${tab === 'add' ? '!bg-green-600/15 !text-green-400 hover:!bg-green-600/25' : ''}`}>
                    {tab === 'all' ? 'All' : tab === 'pending' ? 'Pending' : 'Add Friend'}
                    {tab === 'all' && (
                      <span className={`ml-1.5 ${friendsTab === tab ? 'bg-white/20 text-white' : 'bg-white/10 text-white/50'} text-[10px] font-bold rounded-full px-1.5 py-0.5 inline-flex items-center justify-center transition-colors`}>
                        {friends.filter(f => !f.isAI).length}
                      </span>
                    )}
                    {tab === 'pending' && (
                      <span className={`ml-1.5 ${incomingRequests.length > 0 ? (friendsTab === tab ? 'bg-red-500 text-white' : 'bg-red-500/80 text-white/90') : (friendsTab === tab ? 'bg-white/20 text-white' : 'bg-white/10 text-white/50')} text-[10px] font-bold rounded-full px-1.5 py-0.5 inline-flex items-center justify-center transition-colors`}>
                        {incomingRequests.length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 discord-scrollbar">
              {friendsTab === "all" && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-white/20 mb-3 px-2">All Friends — {friends.filter(f => !f.isAI).length}</p>
                  {friends.filter(f => !f.isAI).map(f => (
                    <div key={f.id} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-white/[0.03] group border-t border-white/[0.04]">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="w-9 h-9 rounded-full bg-white/[0.06] flex items-center justify-center text-sm font-bold text-white/40">{f.username[0].toUpperCase()}</div>
                          <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#0a0a0c] transition-colors ${onlineUsers.has(f.id) ? 'bg-green-500' : 'bg-white/20'}`} />
                        </div>
                        <span className="text-[14px] font-medium text-white/80">{f.username}</span>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setActiveChat(f); setMobileSidebarOpen(false); }} className="p-2 rounded-full bg-white/[0.06] text-white/40 hover:text-white transition-colors"><MessageSquare size={16} /></button>
                        <button onClick={() => removeFriend(f.id)} className="p-2 rounded-full bg-white/[0.06] text-white/40 hover:text-red-400 transition-colors"><UserMinus size={16} /></button>
                      </div>
                    </div>
                  ))}
                  {friends.filter(f => !f.isAI).length === 0 && <div className="text-center py-16 text-white/15 text-sm">No friends yet. Go to "Add Friend" to find people.</div>}
                </div>
              )}
              {friendsTab === "pending" && (
                <div>
                  {incomingRequests.length > 0 && <>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-white/20 mb-3 px-2">Incoming — {incomingRequests.length}</p>
                    {incomingRequests.map(r => (
                      <div key={r.fromUserId} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-white/[0.03] border-t border-white/[0.04]">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-amber-500/10 flex items-center justify-center text-sm font-bold text-amber-400">{r.username[0].toUpperCase()}</div>
                          <div><p className="text-[14px] font-medium text-white/80">{r.username}</p><p className="text-[10px] text-amber-500/50">Incoming Request</p></div>
                        </div>
                        <div className="flex gap-1.5">
                          <button onClick={() => acceptFriendReq(r.fromUserId)} className="px-3 py-1.5 bg-green-600/20 text-green-400 rounded-md text-xs font-bold hover:bg-green-600 hover:text-white transition-colors">Accept</button>
                          <button onClick={() => rejectFriendReq(r.fromUserId)} className="px-3 py-1.5 bg-red-500/10 text-red-400 rounded-md text-xs font-bold hover:bg-red-500 hover:text-white transition-colors">Reject</button>
                        </div>
                      </div>
                    ))}
                  </>}
                  {outgoingRequests.length > 0 && <>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-white/20 mb-3 mt-6 px-2">Outgoing — {outgoingRequests.length}</p>
                    {outgoingRequests.map(r => (
                      <div key={r.toUserId} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-white/[0.03] border-t border-white/[0.04]">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-white/[0.06] flex items-center justify-center text-sm font-bold text-white/40">{r.username[0].toUpperCase()}</div>
                          <div><p className="text-[14px] font-medium text-white/80">{r.username}</p><p className="text-[10px] text-indigo-400/50">Pending</p></div>
                        </div>
                        <button onClick={() => unsendFriendReq(r.toUserId)} className="px-3 py-1.5 bg-red-500/10 text-red-400 rounded-md text-xs font-bold hover:bg-red-500 hover:text-white transition-colors">Cancel</button>
                      </div>
                    ))}
                  </>}
                  {!incomingRequests.length && !outgoingRequests.length && <div className="text-center py-16 text-white/15 text-sm">No pending friend requests</div>}
                </div>
              )}
              {friendsTab === "add" && (
                <div>
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-white/80 mb-1">Add Friend</h3>
                    <p className="text-[13px] text-white/25 mb-4">Search users by their username.</p>
                    <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.06] rounded-lg px-4 py-3 focus-within:border-indigo-500/40 transition-colors">
                      <input className="bg-transparent flex-1 text-sm outline-none text-white/80 placeholder:text-white/15" placeholder="Enter a username..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} autoComplete="off" />
                      <Search size={16} className="text-white/20" />
                    </div>
                  </div>
                  {discoveredUsers.map(u => (
                    <div key={u.id} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-white/[0.03] border-t border-white/[0.04]">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-white/[0.06] flex items-center justify-center text-sm font-bold text-white/40">{u.username[0].toUpperCase()}</div>
                        <span className="text-[14px] font-medium text-white/80">{u.username}</span>
                      </div>
                      <button onClick={() => sendFriendReq(u.id)} className="px-3 py-1.5 bg-indigo-600/20 text-indigo-400 rounded-md text-xs font-bold hover:bg-indigo-600 hover:text-white transition-colors">Send Request</button>
                    </div>
                  ))}
                  {!discoveredUsers.length && searchQuery && <div className="text-center py-12 text-white/15 text-sm">No users found</div>}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ─── Settings Modal ─── */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6">
          <div className="bg-[#1a1a1e] border border-white/10 p-8 rounded-2xl w-full max-w-md space-y-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div><h3 className="text-xs font-bold uppercase tracking-widest text-white/40">Settings</h3><p className="text-lg font-bold text-white mt-1">Preferences</p></div>
              <button onClick={() => setShowSettingsModal(false)} className="p-2 text-white/20 hover:text-white transition-colors"><X size={18} /></button>
            </div>
            <div className="space-y-2">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-indigo-400/50 flex items-center gap-2 px-1"><Bell size={12} /> Notifications</h4>
              {[{ key: "messages", label: "Messages" }, { key: "friendRequests", label: "Friend Requests" }, { key: "groupRequests", label: "Group Requests" }, { key: "sounds", label: "Sounds" }].map(r => (
                <button key={r.key} onClick={() => setNotificationPrefs(p => ({ ...p, [r.key]: !p[r.key] }))}
                  className="w-full bg-white/[0.03] rounded-lg px-4 py-3 flex items-center justify-between hover:bg-white/[0.05] transition-colors">
                  <span className="text-sm text-white/70">{r.label}</span>
                  <div className={`w-9 h-5 rounded-full transition-colors relative p-0.5 ${notificationPrefs[r.key] ? 'bg-indigo-600' : 'bg-white/10'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full transition-transform ${notificationPrefs[r.key] ? 'translate-x-4' : ''}`} />
                  </div>
                </button>
              ))}
            </div>
            <div className="bg-white/[0.03] rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-white/70">Cipher Secure</p>
                <span className="text-[10px] font-bold text-green-500 bg-green-500/10 px-2 py-0.5 rounded">Live</span>
              </div>
              <p className="text-[11px] text-white/25">E2EE Protocol • Zero-Log Architecture</p>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .discord-scrollbar::-webkit-scrollbar { width: 6px; }
        .discord-scrollbar::-webkit-scrollbar-track { background: transparent; margin: 4px 0; }
        .discord-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.06); border-radius: 3px; }
        .discord-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.1); }

        /* Mobile PWA optimizations */
        * { -webkit-tap-highlight-color: transparent; }
        html, body { overscroll-behavior: none; touch-action: pan-y; }
        body { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
        input, textarea { font-size: 16px !important; } /* Prevents iOS zoom on focus */
        @media (max-width: 768px) {
          .discord-scrollbar::-webkit-scrollbar { width: 0px; } /* Hide scrollbar on mobile */
        }

        /* Safe area insets for notched phones */
        .safe-top { padding-top: env(safe-area-inset-top, 0px); }
        .safe-bottom { padding-bottom: env(safe-area-inset-bottom, 0px); }

        /* Smooth view transitions */
        .mobile-view-transition {
          animation: mobileSlideIn 0.2s ease-out;
        }
        @keyframes mobileSlideIn {
          from { opacity: 0.8; transform: translateX(8px); }
          to { opacity: 1; transform: translateX(0); }
        }

        /* Dynamic viewport height for mobile browsers */
        @supports (height: 100dvh) {
          .h-\\[100dvh\\] { height: 100dvh; }
        }

        /* Improved touch targets */
        @media (max-width: 768px) {
          .h-13 { height: 3.25rem; }
        }
      `}</style>
    </div>
  );
};

export default App;
