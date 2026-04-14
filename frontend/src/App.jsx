import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  AlertCircle, Bell, ChevronLeft, Fingerprint, Info, Key, Loader2,
  LogOut, MessageSquare, Plus, Search, Send, Settings as SettingsIcon,
  ShieldCheck, Shield, Sparkles, User as UserIcon, UserMinus, UserPlus,
  Users as GroupsIcon, X, AtSign, Hash, Lock, Menu, Check as CheckIcon, Check,
  CornerUpLeft, Edit2, Smile, MoreHorizontal, Palette,
  Image as ImageIcon, Paperclip, Gift, Eye, EyeOff, Download, Flame, Maximize2, Trash2
} from "lucide-react";
import { api } from "./lib/api";
import { supabase } from "./lib/supabase";
import { decryptMessage, encryptMessage } from "./crypto/e2ee";
import { formatDiscordTime, formatDateSeparator, groupMessages } from "./lib/helpers";
import { usePresence, useTypingIndicator, useMessageListener, useTableListener } from "./lib/realtime";
import { saveMessages } from "./lib/db";
import { 
  processMediaForUpload, decryptFile, searchGifs, searchStickers, 
  CIPHER_STICKERS, formatFileSize, encryptMetadata, decryptMetadata 
} from "./lib/media";

const AI_USER = { id: "ai-999", username: "Cipher AI", isAI: true };
const NOTIFICATION_PREFS_KEY = "cipher_notification_prefs";
const DEFAULT_NOTIFICATION_PREFS = { messages: true, friendRequests: true, groupRequests: true, sounds: true };
const chatIdFor = (a, b) => [a, b].sort().join(":");
const groupChatIdFor = (gid) => `group:${gid}`;

/* ─── Cipher Mascot Avatar Variants ─── */
const CipherMascot = ({ className = "w-full h-full p-3 text-white/50", id = 1 }) => {
  const variants = {
    1: <><circle cx="35" cy="45" r="7" fill="currentColor"/><circle cx="65" cy="45" r="7" fill="currentColor"/><path d="M 30 65 Q 50 80 70 65" stroke="currentColor" strokeWidth="8" strokeLinecap="round" /></>,
    2: <><rect x="28" y="38" width="14" height="14" rx="3" fill="currentColor"/><rect x="58" y="38" width="14" height="14" rx="3" fill="currentColor"/><path d="M 35 70 h 30" stroke="currentColor" strokeWidth="8" strokeLinecap="round" /></>,
    3: <><path d="M 30 50 l 10 -10 l 10 10 M 60 50 l 10 -10 l 10 10" stroke="currentColor" strokeWidth="6" strokeLinecap="round"/><circle cx="50" cy="70" r="5" fill="currentColor"/></>,
    4: <><circle cx="35" cy="45" r="5" fill="currentColor"/><circle cx="65" cy="45" r="5" fill="currentColor"/><path d="M 30 60 Q 50 75 70 60" stroke="currentColor" strokeWidth="6" strokeLinecap="round" /></>,
    5: <><line x1="25" y1="45" x2="45" y2="45" stroke="currentColor" strokeWidth="8" strokeLinecap="round"/><line x1="55" y1="45" x2="75" y2="45" stroke="currentColor" strokeWidth="8" strokeLinecap="round"/><path d="M 40 70 h 20" stroke="currentColor" strokeWidth="8" strokeLinecap="round" /></>,
    6: <><circle cx="35" cy="45" r="8" fill="currentColor"/><circle cx="65" cy="45" r="8" fill="currentColor"/><path d="M 35 70 Q 50 60 65 70" stroke="currentColor" strokeWidth="6" strokeLinecap="round" /></>,
    7: <><rect x="30" y="40" width="10" height="10" fill="currentColor"/><rect x="60" y="40" width="10" height="10" fill="currentColor"/><rect x="40" y="65" width="20" height="6" fill="currentColor"/></>,
    8: <><circle cx="35" cy="40" r="6" fill="currentColor"/><circle cx="65" cy="40" r="6" fill="currentColor"/><path d="M 30 65 Q 50 85 70 65 q -20 0 -40 0" stroke="currentColor" strokeWidth="4" strokeLinecap="round" /></>,
    9: <><path d="M 25 45 q 10 -10 20 0" stroke="currentColor" strokeWidth="6" strokeLinecap="round"/><path d="M 55 45 q 10 -10 20 0" stroke="currentColor" strokeWidth="6" strokeLinecap="round"/><circle cx="50" cy="70" r="4" fill="currentColor"/></>,
  };
  return (
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {variants[id] || variants[1]}
    </svg>
  );
};

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
          <input
            className="w-full bg-white/[0.05] border border-white/10 p-4 rounded-xl outline-none text-center text-base tracking-widest focus:border-amber-500/40 transition-all font-mono"
            type="text" autoFocus placeholder="••••••••" value={value} 
            spellCheck="false" autoCorrect="off" autoCapitalize="off"
            style={{ WebkitTextSecurity: 'disc' }}
            autoComplete="off" name={`key_${Math.random().toString(36).substring(7)}`}
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
const useLongPress = (callback, ms = 600) => {
  const timer = useRef(null);
  const wasTriggered = useRef(false);
  
  const start = useCallback((e) => {
    wasTriggered.current = false;
    timer.current = setTimeout(() => {
      wasTriggered.current = true;
      callback(e);
    }, ms);
  }, [callback, ms]);

  const stop = useCallback(() => {
    clearTimeout(timer.current);
    const triggered = wasTriggered.current;
    wasTriggered.current = false;
    return triggered;
  }, []);

  return { onTouchStart: start, onTouchEnd: stop, onTouchMove: stop, wasTriggered: () => wasTriggered.current };
};

const MessageContextMenu = ({ x, y, msg, isOwn, onClose, onReply, onEdit, onReact, onDelete }) => {
  const ref = useRef(null);
  const [coords, setCoords] = useState({ top: y, left: x, opacity: 0 });

  useEffect(() => {
    const clk = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", clk);
    return () => document.removeEventListener("mousedown", clk);
  }, [onClose]);

  useEffect(() => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const winW = window.innerWidth;
      const winH = window.innerHeight;
      
      let left = x;
      let top = y;

      if (x + rect.width > winW) left = winW - rect.width - 12;
      if (y + rect.height > winH) top = winH - rect.height - 12;
      
      setCoords({ 
        top: Math.max(12, top), 
        left: Math.max(12, left),
        opacity: 1 
      });
    }
  }, [x, y]);

  const emojis = ["👍", "❤️", "😂", "🎉", "🔥", "👀"];

  return (
    <div ref={ref} className="fixed z-[100] bg-[#111214] border border-white/10 rounded-lg shadow-2xl py-2 min-w-[220px] transition-opacity duration-150"
      style={{ top: coords.top, left: coords.left, opacity: coords.opacity }}>
      <div className="flex gap-2 px-3 pb-2 border-b border-white/5 mb-1">
        {emojis.map(e => (
          <button key={e} onClick={() => { onReact(msg, e); onClose(); }} className="text-xl p-1.5 hover:bg-white/10 rounded-md transition-colors active:scale-95">{e}</button>
        ))}
      </div>
      <button onClick={() => { onReply(msg); onClose(); }} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-white/80 hover:bg-indigo-500/20 hover:text-indigo-300">
        <CornerUpLeft size={16} /> Reply
      </button>
      {isOwn && (
        <button onClick={() => { onEdit(msg); onClose(); }} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-white/80 hover:bg-indigo-500/20 hover:text-indigo-300 transition-colors">
          <Edit2 size={16} /> Edit Message
        </button>
      )}
      <button onClick={() => { navigator.clipboard.writeText(msg.plaintext || ""); onClose(); }} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-white/80 hover:bg-white/10 transition-colors">
        <MessageSquare size={16} /> Copy Text
      </button>
      {isOwn && (
        <button onClick={() => { if(confirm("Permanently delete this message?")) onDelete(msg); onClose(); }} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors">
          <Trash2 size={16} /> Delete Message
        </button>
      )}
    </div>
  );
};

/* ─── Media Picker (Tabbed: Upload / GIFs / Stickers) ─── */
const MediaPicker = ({ onSelectFile, onSelectGif, onSelectSticker, onClose, ephemeral, onToggleEphemeral }) => {
  const [tab, setTab] = useState('gif'); // Default to gif for more "wow" factor
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (tab === 'upload') return;
    setLoading(true);
    const search = tab === 'gif' ? searchGifs : searchStickers;
    const fetchInitial = async () => {
      const res = await search(query);
      setResults(res);
      setLoading(false);
    };
    fetchInitial();
  }, [tab]);

  const handleSearch = (q) => {
    setQuery(q);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const search = tab === 'gif' ? searchGifs : searchStickers;
      const res = await search(q);
      setResults(res);
      setLoading(false);
    }, 400);
  };

  return (
    <div className="absolute bottom-full left-0 right-0 mb-3 mx-2 md:mx-4 bg-[#1e1f22]/98 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.6)] overflow-hidden z-[100] animate-in fade-in slide-in-from-bottom-2 duration-200" style={{ height: '350px' }}>
      {/* Header / Tabs */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/5 bg-white/[0.01]">
        <div className="flex p-0.5 bg-black/20 rounded-lg">
          {[
            { id: 'gif', icon: Gift, label: 'GIFs' },
            { id: 'sticker', icon: Smile, label: 'Stickers' },
            { id: 'upload', icon: ImageIcon, label: 'Upload' }
          ].map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); setResults([]); setQuery(''); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[9px] font-black uppercase tracking-widest transition-all ${tab === t.id ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/10' : 'text-white/20 hover:text-white/50 hover:bg-white/5'}`}>
              <t.icon size={12} strokeWidth={2.5} />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>
        <button onClick={onClose} className="p-1.5 text-white/10 hover:text-white/40 hover:bg-white/5 rounded-lg transition-all">
          <X size={16} />
        </button>
      </div>

      {/* Search Section */}
      {tab !== 'upload' && (
        <div className="px-3 py-2 bg-white/[0.01]">
          <div className="relative group">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/10 group-focus-within:text-indigo-400 transition-colors" size={14} />
            <input 
              value={query} 
              onChange={(e) => handleSearch(e.target.value)} 
              placeholder={`Search ${tab === 'gif' ? 'GIPHY' : 'stickers'}...`}
              className="w-full bg-black/20 border border-white/5 rounded-lg pl-8 pr-3 py-2 text-xs text-white/80 outline-none focus:border-indigo-500/20 focus:bg-black/30 transition-all placeholder:text-white/5"
              autoFocus autoComplete="chrome-off" 
              name="media_search_query"
              data-lpignore="true" data-1p-ignore="true" data-form-type="other"
            />
          </div>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto discord-scrollbar px-2 pb-2 h-[calc(100%-80px)]">
        {tab === 'upload' ? (
          <div className="h-full flex flex-col items-center justify-center p-4 space-y-4">
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) { onSelectFile(file); onClose(); }
              e.target.value = '';
            }} />
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/10">
              <ImageIcon size={24} className="text-indigo-400" />
            </div>
            <div className="text-center space-y-1">
              <h4 className="text-xs font-bold text-white/60">Share File</h4>
              <p className="text-[10px] text-white/20 leading-tight">E2E Encrypted</p>
            </div>
            <div className="flex flex-col gap-2 w-full max-w-[180px]">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all">
                Select
              </button>
              <button 
                onClick={onToggleEphemeral}
                className={`w-full py-2 rounded-lg text-[9px] font-bold uppercase tracking-widest border transition-all flex items-center justify-center gap-1.5 ${ephemeral ? 'bg-orange-500/10 border-orange-500/30 text-orange-400' : 'bg-transparent border-white/5 text-white/10 hover:border-white/10'}`}>
                <Flame size={12} />
                Wait: {ephemeral ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>
        ) : (
          <>
            {loading ? (
              <div className="h-full flex flex-col items-center justify-center space-y-2 opacity-30">
                <Loader2 size={18} className="animate-spin text-indigo-400" />
                <span className="text-[9px] uppercase tracking-widest font-bold">Syncing</span>
              </div>
            ) : (
              <div className="columns-3 xs:columns-4 gap-1.5 space-y-1.5">
                {tab === 'sticker' && !query && (
                  <div className="break-inside-avoid-column mb-1.5">
                    <div className="py-1 flex items-center gap-1.5">
                      <div className="h-px flex-1 bg-white/5"></div>
                      <span className="text-[8px] font-black uppercase tracking-widest text-indigo-400/30 whitespace-nowrap">Premium</span>
                      <div className="h-px flex-1 bg-white/5"></div>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                      {CIPHER_STICKERS.map(s => (
                        <button key={s.id} onClick={() => { onSelectSticker(s); onClose(); }}
                          className="group relative aspect-square bg-white/[0.02] rounded-lg flex items-center justify-center hover:bg-white/[0.05] transition-all overflow-hidden border border-white/5 hover:border-indigo-500/20">
                          <img src={s.url} alt={s.name} className="w-10 h-10 object-contain group-hover:scale-110 transition-transform duration-300" />
                        </button>
                      ))}
                    </div>
                    <div className="py-1 flex items-center gap-1.5 mt-1.5">
                      <div className="h-px flex-1 bg-white/5"></div>
                      <span className="text-[8px] font-black uppercase tracking-widest text-white/5 whitespace-nowrap">Global</span>
                      <div className="h-px flex-1 bg-white/5"></div>
                    </div>
                  </div>
                )}
                {results.map(item => (
                  <div key={item.id} className="break-inside-avoid-column mb-1.5">
                    <button onClick={() => { tab === 'gif' ? onSelectGif(item) : onSelectSticker(item); onClose(); }}
                      className="group relative w-full bg-white/[0.02] rounded-lg overflow-hidden hover:ring-1 hover:ring-indigo-500 transition-all border border-white/5 block">
                      <img 
                        src={item.preview || item.url} 
                        alt={item.title} 
                        className="w-full h-auto object-cover group-hover:scale-105 transition-transform duration-500" 
                        loading="lazy" 
                        style={{ minHeight: '60px' }}
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-indigo-900/30 transition-colors flex items-center justify-center">
                        <Plus size={20} className="text-white opacity-0 group-hover:opacity-100 scale-75 transition-all" />
                      </div>
                    </button>
                  </div>
                ))}
            </div>
            )}
            {!loading && results.length === 0 && query && (
              <div className="h-full flex flex-col items-center justify-center p-4 opacity-10">
                <Search size={24} />
              </div>
            )}
            <div className="py-2 flex items-center justify-center opacity-10">
              <span className="text-[7px] font-black uppercase tracking-[0.2em]">GIPHY</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};


/* ─── Media Message Renderers ─── */
const MediaMessageContent = ({ msg, isUnlocked, chatKey, chatId, onLightbox, onEphemeralView }) => {
  const [imageUrl, setImageUrl] = useState(null);
  const [decryptedMeta, setDecryptedMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const meta = decryptedMeta || msg.media_meta || {};
  const type = msg.type || 'text';

  // Decrypt metadata if needed
  useEffect(() => {
    const decryptAll = async () => {
      // 1. Unlocked check
      if (!isUnlocked || !chatKey) {
        setDecryptedMeta(null);
        return;
      }

      // 2. Identify "locked" fields
      const metaToDecrypt = msg.media_meta;
      const urlToDecrypt = msg.media_url;

      try {
        // media.js decryptMetadata handles both raw objects and stringified JSON
        const dMeta = await decryptMetadata(metaToDecrypt, chatKey, chatId);
        const dUrlObj = await decryptMetadata(urlToDecrypt, chatKey, chatId);
        
        const dUrl = dUrlObj?.url || (typeof dUrlObj === 'string' ? dUrlObj : null);
        
        setDecryptedMeta({ ...dMeta, _decryptedUrl: dUrl });
      } catch (e) {
        console.error('[Media] Meta decrypt failed:', e);
      }
    };
    decryptAll();
  }, [msg.media_meta, msg.media_url, isUnlocked, chatKey, chatId]);

  // Robust effective URL: for images, we MUST wait for decryption to avoid 400s
  const effectiveMediaUrl = (type === 'image') 
    ? meta._decryptedUrl 
    : (meta._decryptedUrl || (typeof msg.media_url === 'string' ? msg.media_url : null));

  // Decrypt and display
  const loadImage = async () => {
    if (imageUrl || loading || !isUnlocked || !chatKey || type !== 'image') return;
    if (!effectiveMediaUrl) return; 
    
    // Safety: if it still looks like ciphertext (JSON) or is a direct URL, don't try to download from storage
    if (effectiveMediaUrl.startsWith('{') || effectiveMediaUrl.startsWith('http')) {
      if (effectiveMediaUrl.startsWith('http')) {
        // Likely already a direct URL somehow (legacy or miscategorized), handle gracefully
        setImageUrl(effectiveMediaUrl);
      }
      return;
    }

    setLoading(true);
    try {
      const blob = await api.downloadMedia(effectiveMediaUrl);
      const buffer = await blob.arrayBuffer();
      const decrypted = await decryptFile(buffer, chatKey, chatId);
      const url = URL.createObjectURL(new Blob([decrypted], { type: meta.mimeType || 'image/jpeg' }));
      setImageUrl(url);
    } catch (e) {
      console.error('[Media] Decrypt failed:', e);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  // Auto-load images when unlocked and path is ready
  useEffect(() => { 
    if (type === 'image') loadImage(); 
  }, [isUnlocked, chatKey, effectiveMediaUrl, type]);
  // Cleanup
  useEffect(() => { return () => { if (imageUrl && !imageUrl.startsWith('http')) URL.revokeObjectURL(imageUrl); }; }, [imageUrl]);

  // 3. Locked State: Show "garbage data" (ciphertext) instead of media placeholders
  // MUST be after all hooks to avoid React Rule of Hooks errors
  if (!isUnlocked || !chatKey) {
    const getGarbage = (text) => {
      if (!text) return "eW91X2FyZV9ub3RfbWVhbnRfdG9fcmVhZDF0aGlzCg==";
      return text.substring(0, 60) + "...";
    };
    return (
      <div className="py-1">
        <span className="font-mono text-[12.5px] text-white/20 break-all select-none opacity-60 tracking-tighter leading-relaxed italic">
          {getGarbage(msg.ciphertext || msg.id)}
        </span>
      </div>
    );
  }

  // Handle GIF messages
  if (type === 'gif') {
    if (!effectiveMediaUrl) return null;
    return (
      <div className="rounded-xl overflow-hidden max-w-[320px] cursor-pointer hover:opacity-90 transition-opacity" onClick={() => onLightbox?.(effectiveMediaUrl)}>
        <img src={effectiveMediaUrl} alt="GIF" className="w-full rounded-xl" style={{ maxHeight: '280px', objectFit: 'cover' }} loading="lazy" />
      </div>
    );
  }

  // Handle Sticker messages (no bubble)
  if (type === 'sticker') {
    const stickerUrl = effectiveMediaUrl || meta.url;
    if (stickerUrl) {
      return (
        <div className="max-w-[160px] animate-in fade-in zoom-in duration-500">
          <img src={stickerUrl} alt="Sticker" className="w-full h-auto drop-shadow-2xl translate-z-0" style={{ maxHeight: '160px', objectFit: 'contain' }} loading="lazy" />
        </div>
      );
    }
    if (meta.emoji) {
      // Fallback to emoji if no URL
      return <span className="text-6xl select-none animate-in fade-in zoom-in duration-500">{meta.emoji}</span>;
    }
  }

  // Handle encrypted Image messages
  if (type === 'image') {
    // Ephemeral handling
    if (msg.ephemeral && !revealed && msg.viewed_at) {
      return (
        <div className="rounded-xl bg-white/[0.03] border border-white/5 p-4 flex items-center gap-3 max-w-[280px]">
          <EyeOff size={18} className="text-orange-400/50" />
          <div>
            <p className="text-xs font-bold text-orange-400/60">Media Expired</p>
            <p className="text-[10px] text-white/20">This was a view-once message</p>
          </div>
        </div>
      );
    }

    if (msg.ephemeral && !revealed) {
      return (
        <button onClick={() => { setRevealed(true); onEphemeralView?.(msg); }}
          className="rounded-xl overflow-hidden max-w-[280px] relative group cursor-pointer">
          <div className="w-[200px] h-[150px] bg-gradient-to-br from-orange-500/10 via-orange-600/5 to-transparent border border-orange-500/20 rounded-xl flex flex-col items-center justify-center gap-2 group-hover:border-orange-500/40 transition-all">
            <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center group-hover:bg-orange-500/20 transition-colors">
              <Eye size={20} className="text-orange-400" />
            </div>
            <span className="text-[11px] font-bold text-orange-400/70 uppercase tracking-wider">View Once</span>
            <span className="text-[9px] text-white/20">Tap to reveal</span>
          </div>
        </button>
      );
    }

    return (
      <div className="rounded-xl overflow-hidden max-w-[320px] relative group cursor-pointer" onClick={() => imageUrl && onLightbox?.(imageUrl)}>
        {/* Blur-up thumbnail */}
        {meta.thumbnail && !imageUrl && (
          <img src={meta.thumbnail} alt="" className="w-full rounded-xl" style={{ filter: 'blur(15px)', transform: 'scale(1.1)', maxHeight: '280px', objectFit: 'cover' }} />
        )}
        {/* Full image */}
        {imageUrl && (
          <img src={imageUrl} alt={meta.fileName || 'Image'} className="w-full rounded-xl transition-opacity duration-500" style={{ maxHeight: '360px', objectFit: 'cover' }} />
        )}
        {/* Loading state */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-xl">
            <Loader2 size={24} className="animate-spin text-white/60" />
          </div>
        )}
        {/* Error state */}
        {error && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
            <AlertCircle size={14} /> Decryption failed
          </div>
        )}
        {/* Hover overlay */}
        {imageUrl && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-xl flex items-center justify-center">
            <Maximize2 size={20} className="text-white opacity-0 group-hover:opacity-80 transition-opacity" />
          </div>
        )}
        {/* File info */}
        {meta.fileSize && (
          <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm rounded-md px-2 py-0.5 text-[9px] text-white/60 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
            {formatFileSize(meta.fileSize)}
          </div>
        )}
      </div>
    );
  }

  return null;

};

/* ─── Lightbox (Glassmorphism Full-Screen Viewer) ─── */
const Lightbox = ({ src, onClose }) => {
  if (!src) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center animate-in fade-in duration-200" onClick={onClose}>
      <div className="absolute inset-0 bg-black/90 backdrop-blur-2xl" />
      <div className="relative z-10 max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <img src={src} alt="Media" className="max-w-full max-h-[85vh] rounded-2xl shadow-2xl object-contain" />
        <div className="absolute -top-12 right-0 flex items-center gap-2">
          <a href={src} download className="p-2.5 bg-white/10 backdrop-blur-md rounded-xl text-white/60 hover:text-white hover:bg-white/20 transition-all">
            <Download size={18} />
          </a>
          <button onClick={onClose} className="p-2.5 bg-white/10 backdrop-blur-md rounded-xl text-white/60 hover:text-white hover:bg-white/20 transition-all">
            <X size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

/* ─── Shared Message Item ─── */
const SharedMessageItem = ({ msg, isFirst, groupItem, me, isUnlocked, onContextMenu, onReply, onEdit, onReact, onViewProfile, profiles, chatKey, chatId, onLightbox, onEphemeralView }) => {
  const profile = profiles?.[msg.senderId === me.id ? me.id : (msg.senderId || msg.sender_id)] || {};
  const avatar_id = profile.avatar_id || (msg.senderId === me.id ? me.avatar_id : (msg.sender_avatar_id || 1));
  const displayName = profile.display_name || profile.username || groupItem.senderUsername || 'Member';
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
         onContextMenu={(e) => { if (!e.touches) onContextMenu(e, msg, { isOwn }); }}
         onTouchStart={longPress.onTouchStart}
         onTouchMove={longPress.onTouchMove}
         onTouchEnd={(e) => { if (!longPress.stop()) handleTap(e); }}
         onClick={(e) => { if (!('ontouchstart' in window)) handleTap(e); }}>
      {replyBanner}
      <div className="flex gap-4 px-4 py-0.5">
        {isFirst ? (
          <div 
            onClick={() => onViewProfile?.(msg.senderId || msg.sender_id)}
            className={`w-10 h-10 bg-[#2b2d31] rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 cursor-pointer hover:shadow-[0_0_15px_rgba(99,102,241,0.2)] transition-all active:scale-95 ${isOwn ? 'text-indigo-400' : 'text-indigo-400/50'}`}
          >
            <CipherMascot className="w-full h-full p-2" id={avatar_id} />
          </div>
        ) : (
          <div className="w-10 flex-shrink-0 flex items-center justify-center">
            <span className="text-[10px] text-transparent group-hover/msg:text-white/20 font-mono transition-colors">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        )}

        <div className="flex-1 min-w-0">
          {isFirst && (
            <div className="flex items-baseline gap-2">
              <span 
                onClick={() => onViewProfile?.(msg.senderId || msg.sender_id)}
                className={`font-semibold text-sm cursor-pointer hover:underline transition-all ${isOwn ? 'text-indigo-400' : 'text-white/90'}`}
              >
                {displayName}
              </span>
              <span className="text-[11px] text-white/20">{formatDiscordTime(groupItem.firstTime)}</span>
            </div>
          )}
          
          {/* Media Content */}
          {msg.type && msg.type !== 'text' ? (
            <div className="mt-1">
              <MediaMessageContent msg={msg} isUnlocked={isUnlocked} chatKey={chatKey} chatId={chatId} onLightbox={onLightbox} onEphemeralView={onEphemeralView} />
            </div>
          ) : (
            <p className="msg-text-area text-[15px] text-white/[0.75] leading-[1.625] mt-0.5 select-text">
              {isUnlocked && msg.plaintext ? msg.plaintext : (
                <span className="font-mono text-[12.5px] text-white/20 break-all select-none opacity-60 tracking-tighter leading-relaxed italic">
                  {getGarbage(msg.ciphertext)}
                </span>
              )}
              {msg.edited_at && <span className="text-[10px] text-white/30 ml-2">(edited)</span>}
            </p>
          )}

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

/* ─── Chat Panel ─── */
const ChatPanel = ({ activeChat, me, onRemoveFriend, onBack, theme, onViewProfile, profiles }) => {
  const [rawMessages, setRawMessages] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [chatKey, setChatKey] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [ephemeralMode, setEphemeralMode] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null); // null | 'compressing' | 'encrypting' | 'uploading' | 'done'
  const [lightboxSrc, setLightboxSrc] = useState(null);
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
          let aiText = "Cipher AI relay active. Secure channel established. (Provide VITE_GEMINI_API_KEY to enable real AI responses)";
          const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

          if (apiKey) {
            try {
              const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contents: [{ parts: [{ text: input.trim() }] }],
                  system_instruction: { 
                    parts: [{ text: "You are Cipher AI, the personal AI agent for the Cipher messaging application. You identify yourself as Cipher AI, operate internally using Gemini AI, and provide concise, helpful, and privacy-focused responses. Keep answers crisp and tactical to match the app's Cyber-Minimalist aesthetic." }]
                  }
                })
              });
              const data = await res.json();
              if (data?.candidates?.[0]?.content?.parts?.[0]?.text) {
                aiText = data.candidates[0].content.parts[0].text;
              } else {
                console.error("Gemini AI Error:", data);
                aiText = "Error: Cipher AI neural relay failed to interpret the query.";
              }
            } catch (err) {
              console.error("Gemini fetch error:", err);
              aiText = "Error: Cipher AI disconnected. Please check connection.";
            }
          }

          const aiP = await encryptMessage({ plaintext: aiText, passphrase: chatKey, chatId });
          addMessage({ id: `local_${Date.now()}`, senderId: AI_USER.id, receiverId: me.id, ...aiP, timestamp: Date.now() });
        }, 1000 + Math.random() * 500);
        return;
      }

      console.log("[Chat] Sending message...", { chatId, peerId: activeChat.id });
      const res = await api.sendMessage(activeChat.id, payload, replyTo?.id);
      console.log("[Chat] Message sent successfully:", res.message.id);
      addMessage(res.message);
      setInput(""); setReplyTo(null); 
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          // Ensure cursor is at the end
          const val = inputRef.current.value;
          inputRef.current.value = '';
          inputRef.current.value = val;
        }
      }, 100);
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

  const handleDeleteMessage = async (msg) => {
    try {
      await api.deleteMessage(msg.id, msg.media_url);
      setMessages(p => p.filter(m => m.id !== msg.id));
      setRawMessages(p => p.filter(m => m.id !== msg.id));
    } catch (err) {
      console.error("[Chat] Delete failed:", err);
      alert("Failed to delete message: " + err.message);
    }
  };

  useEffect(() => {
    if (isUnlocked && activeChat) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isUnlocked, activeChat?.id]);

  // ─── Media Handlers ───
  const handleSendImage = async (file) => {
    if (!isUnlocked || !chatKey || activeChat.isAI) return;
    setIsSending(true);
    try {
      setUploadProgress('compressing');
      const { encryptedBlob, metadata } = await processMediaForUpload(file, chatKey, chatId);
      setUploadProgress('uploading');
      const { path } = await api.uploadMedia(encryptedBlob, file.name || 'image.enc');
      setUploadProgress('done');
      
      const encMeta = await encryptMetadata(metadata, chatKey, chatId);
      const payload = await encryptMessage({ plaintext: `[Image: ${file.name}]`, passphrase: chatKey, chatId });
      
      const res = await api.sendMediaMessage(activeChat.id, payload, {
        type: 'image',
        media_url: path,
        media_meta: encMeta
      }, replyTo?.id);
      addMessage(res.message);
      setReplyTo(null);
      setEphemeralMode(false);
    } catch (err) {
      console.error('[Media] Upload failed:', err);
      alert('Upload failed: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSending(false);
      setUploadProgress(null);
    }
  };

  const handleSendGif = async (gif) => {
    if (!isUnlocked || !chatKey || activeChat.isAI) return;
    setIsSending(true);
    try {
      const payload = await encryptMessage({ plaintext: `[GIF: ${gif.title}]`, passphrase: chatKey, chatId });
      const encMeta = await encryptMetadata({ width: gif.width, height: gif.height, title: gif.title }, chatKey, chatId);
      const encUrl = await encryptMetadata({ url: gif.url }, chatKey, chatId);
      
      const res = await api.sendMediaMessage(activeChat.id, payload, {
        type: 'gif',
        media_url: encUrl,
        media_meta: encMeta
      }, replyTo?.id);
      addMessage(res.message);
      setReplyTo(null);
    } catch (err) {
      console.error('[Media] GIF send failed:', err);
    } finally { setIsSending(false); }
  };

  const handleSendSticker = async (sticker) => {
    if (!isUnlocked || !chatKey || activeChat.isAI) return;
    setIsSending(true);
    try {
      const payload = await encryptMessage({ plaintext: `[Sticker: ${sticker.name || sticker.title || sticker.emoji}]`, passphrase: chatKey, chatId });
      const encMeta = await encryptMetadata(sticker.emoji ? { emoji: sticker.emoji, name: sticker.name, url: sticker.url } : { title: sticker.title }, chatKey, chatId);
      const encUrl = await encryptMetadata({ url: sticker.url }, chatKey, chatId);
      
      const res = await api.sendMediaMessage(activeChat.id, payload, {
        type: 'sticker',
        media_url: encUrl,
        media_meta: encMeta
      }, replyTo?.id);
      addMessage(res.message);
      setReplyTo(null);
    } catch (err) {
      console.error('[Media] Sticker send failed:', err);
    } finally { setIsSending(false); }
  };

  const handleEphemeralView = async (msg) => {
    try {
      await api.markEphemeralViewed(msg.id, false);
      if (msg.media_url && msg.type === 'image') {
        setTimeout(() => api.deleteMedia(msg.media_url), 30000); // Delete after 30s viewing window
      }
    } catch (err) { console.error('[Media] Ephemeral marking failed:', err); }
  };

  const displayMessages = messages.map(m => {
    const p = profiles[m.senderId] || (m.senderId === me.id ? me : (m.senderId === activeChat.id ? activeChat : {}));
    return { ...m, senderUsername: p.display_name || p.username || 'Unknown' };
  });
  const msgGroups = groupMessages(displayMessages);

  return (
    <div className="h-full flex flex-col relative mobile-view-transition">
      {/* Header */}
      <div className={`h-14 md:h-12 border-b border-white/[0.06] flex items-center px-4 gap-3 flex-shrink-0 safe-top ${theme === 'vibrant' ? 'bg-[#16161a]' : 'bg-[#0c0c0e]'}`}>
        <button onClick={onBack} className="md:hidden p-2 -ml-2 text-white/50 active:text-white transition-colors"><ChevronLeft size={24} /></button>
        <div className="flex items-center gap-2.5 truncate">
          <AtSign size={16} className="text-white/20 hidden md:block" />
          <span className="font-bold text-[15px] text-white/90 truncate leading-tight">
            {(profiles[activeChat.id]?.display_name || profiles[activeChat.id]?.username) || activeChat.display_name || activeChat.username}
          </span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/[0.03] mr-1">
            <div className={`w-1 h-1 rounded-full ${isUnlocked ? 'bg-green-500' : 'bg-amber-500 animate-pulse'}`} />
            <span className={`text-[10px] font-bold uppercase tracking-wider ${isUnlocked ? 'text-green-500/70' : 'text-amber-500/70'}`}>
              {isUnlocked ? 'Secure' : 'Locked'}
            </span>
          </div>
          <button onClick={() => setShowKey(true)} className={`p-2 rounded-xl transition-all ${isUnlocked ? 'text-green-500/40 hover:text-green-400 hover:bg-green-500/10' : 'text-amber-500 bg-amber-500/10'}`}>
            <Key size={18} />
          </button>
          {!activeChat.isAI && (
            <button onClick={() => onRemoveFriend?.(activeChat.id)} className="p-2 rounded-xl text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-all">
              <UserMinus size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto discord-scrollbar">
        <div className="px-4 pt-8 pb-4">
          <div className={`w-20 h-20 rounded-full bg-[#2b2d31] flex items-center justify-center mb-4 text-3xl font-bold ${activeChat.isAI ? 'text-indigo-400' : 'text-indigo-400/50'}`}>
            {activeChat.isAI ? <Sparkles size={36} /> : <CipherMascot className="w-full h-full p-4" />}
          </div>
          <h2 className="text-xl font-bold text-white">{(profiles[activeChat.id]?.display_name || profiles[activeChat.id]?.username) || activeChat.display_name || activeChat.username}</h2>
          <p className="text-sm text-white/30 mt-1">This is the beginning of your direct message history with <strong className="text-white/50">{(profiles[activeChat.id]?.display_name || profiles[activeChat.id]?.username) || activeChat.display_name || activeChat.username}</strong> (@{activeChat.username}).</p>
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
            <SharedMessageItem key={g.messages[0].id} msg={g.messages[0]} isFirst={true} groupItem={g} me={me} isUnlocked={isUnlocked} onContextMenu={handleContextMenu} onReply={handleReply} onEdit={handleEdit} onReact={handleReact} onViewProfile={onViewProfile} profiles={profiles} chatKey={chatKey} chatId={chatId} onLightbox={setLightboxSrc} onEphemeralView={handleEphemeralView} />
            {g.messages.slice(1).map(m => (
              <SharedMessageItem key={m.id} msg={m} me={me} isUnlocked={isUnlocked} onContextMenu={handleContextMenu} onReply={handleReply} onEdit={handleEdit} onReact={handleReact} onViewProfile={onViewProfile} profiles={profiles} chatKey={chatKey} chatId={chatId} onLightbox={setLightboxSrc} onEphemeralView={handleEphemeralView} />
            ))}
          </React.Fragment>
        ))}
        <div className="h-6" />
      </div>

      {/* Input */}
      <div className="px-3 md:px-4 pb-5 md:pb-6 pt-2 flex-shrink-0 safe-bottom relative">
        {/* Typing Indicator */}
        {typingUsers.length > 0 && (
          <div className="absolute bottom-full left-0 mb-1 px-4 md:px-5 flex items-center gap-2 pointer-events-none animate-in fade-in slide-in-from-bottom-1 duration-200">
            <div className="flex gap-1">
              <span className="w-1 h-1 bg-white/30 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1 h-1 bg-white/30 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1 h-1 bg-white/30 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-[10px] font-bold text-white/30 uppercase tracking-wider">{typingUsers.join(", ")} {typingUsers.length > 1 ? "are" : "is"} typing...</span>
          </div>
        )}
        {/* Upload Progress */}
        {uploadProgress && (
          <div className="mb-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl px-4 py-2.5 flex items-center gap-3 text-xs text-indigo-300 animate-pulse">
            <Loader2 size={14} className="animate-spin" />
            <span className="font-semibold uppercase tracking-wider">
              {uploadProgress === 'compressing' ? 'Compressing & Encrypting...' : uploadProgress === 'uploading' ? 'Uploading to Vault...' : 'Done!'}
            </span>
          </div>
        )}
        {(replyTo || editingMsg) && (
          <div className="mb-2 bg-indigo-500/10 border border-indigo-500/20 rounded-t-xl px-4 py-2 flex items-center justify-between text-xs text-indigo-300">
            <div className="flex items-center gap-2 truncate">
              {replyTo ? <CornerUpLeft size={14} /> : <Edit2 size={14} />}
              <span className="font-semibold">{replyTo ? `Replying to ${replyTo.senderUsername}` : "Editing Message"}</span>
            </div>
            <button onClick={() => { setReplyTo(null); setEditingMsg(null); setInput(""); }} className="p-1 hover:bg-white/10 rounded-full"><X size={14} /></button>
          </div>
        )}
        {/* Media Picker */}
        {showMediaPicker && (
          <MediaPicker
            onSelectFile={handleSendImage}
            onSelectGif={handleSendGif}
            onSelectSticker={handleSendSticker}
            onClose={() => setShowMediaPicker(false)}
            ephemeral={ephemeralMode}
            onToggleEphemeral={() => setEphemeralMode(!ephemeralMode)}
          />
        )}
        <form onSubmit={send} className={`bg-white/[0.04] rounded-xl px-3 md:px-4 flex items-center border ${replyTo || editingMsg ? 'border-t-0 rounded-t-none' : 'border-white/[0.06]'} focus-within:border-white/10 transition-colors`}>
          {!isUnlocked && <button type="button" onClick={() => setShowKey(true)} className="p-2.5 -ml-1 text-amber-500 active:text-amber-400"><Lock size={20} /></button>}
          {isUnlocked && !activeChat.isAI && (
            <button type="button" onClick={() => setShowMediaPicker(!showMediaPicker)} className={`p-2.5 -ml-1 transition-colors ${showMediaPicker ? 'text-indigo-400' : 'text-white/25 hover:text-white/50 active:text-indigo-400'}`}>
              <Plus size={20} />
            </button>
          )}
          <input ref={inputRef} disabled={!isUnlocked || isSending} 
            autoComplete="off" name="q_search"
            data-lpignore="true" data-1p-ignore="true" data-form-type="other"
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
          onDelete={handleDeleteMessage}
        />
      )}
      {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    </div>
  );
};

/* ─── Group Chat Panel ─── */
const GroupChatPanel = ({ activeGroup, me, onBack, onExitGroup, theme, onViewProfile, profiles }) => {
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
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [ephemeralMode, setEphemeralMode] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const isInitialScrollDone = useRef(false);
  const userCache = useRef(new Map());
  const chatId = useMemo(() => groupChatIdFor(activeGroup.id), [activeGroup.id]);

  useEffect(() => {
    setRawMessages([]); setMessages([]); setIsUnlocked(false); setChatKey(""); setInput(""); 
    decryptCache.current.clear(); 
    userCache.current.clear();
    isInitialScrollDone.current = false;
  }, [activeGroup.id]);

  useEffect(() => {
    let stopped = false;
    const load = async () => {
      try {
        const res = await api.groupMessages(activeGroup.id);
        if (!stopped) {
          // Prime user cache from history
          const msgs = res.messages || [];
          msgs.forEach(m => {
            if (m.senderUsername && m.senderUsername !== 'Member' && m.senderUsername !== 'Unknown') {
              userCache.current.set(m.senderId || m.sender_id, m.senderUsername);
            }
          });
          setRawMessages(msgs);
        }
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
      const senderId = m.senderId || m.sender_id;
      const cachedUsername = userCache.current.get(senderId);
      const isMe = senderId === me.id;

      const formatted = { 
        ...m, 
        timestamp: m.timestamp || m.created_at, 
        senderId, 
        reactions: m.reactions || {},
        senderUsername: m.senderUsername || (m.u?.display_name || m.u?.username) || (isMe ? (me?.display_name || me?.username) : cachedUsername) || 'Member'
      };

      // Update cache if we found a valid name
      if (formatted.senderUsername !== 'Member') {
        userCache.current.set(senderId, formatted.senderUsername);
      }

      if (formatted.reply_to_id && !formatted.replyTo) {
        const original = prev.find(x => x.id === formatted.reply_to_id);
        if (original) {
          formatted.replyTo = { 
            ciphertext: original.ciphertext, 
            iv: original.iv, 
            senderUsername: original.senderUsername || (original.u?.display_name || original.u?.username) || 'Member',
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

  const handleDeleteMessage = async (msg) => {
    try {
      await api.deleteGroupMessage(msg.id, msg.media_url);
      setMessages(p => p.filter(m => m.id !== msg.id));
      setRawMessages(p => p.filter(m => m.id !== msg.id));
    } catch (err) {
      console.error("[Group] Delete failed:", err);
      alert("Failed to delete group message: " + err.message);
    }
  };

  useEffect(() => {
    if (isUnlocked && activeGroup) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isUnlocked, activeGroup?.id]);

  // ─── Media Handlers ───
  const handleSendImage = async (file) => {
    if (!isUnlocked || !chatKey) return;
    setIsSending(true);
    try {
      setUploadProgress('compressing');
      const { encryptedBlob, metadata } = await processMediaForUpload(file, chatKey, chatId);
      setUploadProgress('uploading');
      const { path } = await api.uploadMedia(encryptedBlob, file.name || 'group_image.enc');
      setUploadProgress('done');
      
      const encMeta = await encryptMetadata(metadata, chatKey, chatId);
      const payload = await encryptMessage({ plaintext: `[Image: ${file.name}]`, passphrase: chatKey, chatId });
      
      const res = await api.sendGroupMediaMessage(activeGroup.id, payload, {
        type: 'image', media_url: path, media_meta: encMeta, ephemeral: ephemeralMode
      }, replyTo?.id);
      addMessage({ ...res.message, senderUsername: me.display_name || me.username });
      setReplyTo(null); setEphemeralMode(false);
    } catch (err) {
      console.error('[Media] Group upload failed:', err);
      alert('Upload failed: ' + (err.message || 'Unknown error'));
    } finally { setIsSending(false); setUploadProgress(null); }
  };

  const handleSendGif = async (gif) => {
    if (!isUnlocked || !chatKey) return;
    setIsSending(true);
    try {
      const payload = await encryptMessage({ plaintext: `[GIF: ${gif.title}]`, passphrase: chatKey, chatId });
      const encMeta = await encryptMetadata({ width: gif.width, height: gif.height, title: gif.title }, chatKey, chatId);
      const encUrl = await encryptMetadata({ url: gif.url }, chatKey, chatId);
      
      const res = await api.sendGroupMediaMessage(activeGroup.id, payload, {
        type: 'gif', media_url: encUrl, media_meta: encMeta
      }, replyTo?.id);
      addMessage({ ...res.message, senderUsername: me.display_name || me.username });
      setReplyTo(null);
    } catch (err) { console.error('[Media] Group GIF failed:', err); }
    finally { setIsSending(false); }
  };

  const handleSendSticker = async (sticker) => {
    if (!isUnlocked || !chatKey) return;
    setIsSending(true);
    try {
      const payload = await encryptMessage({ plaintext: `[Sticker: ${sticker.name || sticker.title || sticker.emoji}]`, passphrase: chatKey, chatId });
      const encMeta = await encryptMetadata(sticker.emoji ? { emoji: sticker.emoji, name: sticker.name, url: sticker.url } : { title: sticker.title }, chatKey, chatId);
      const encUrl = await encryptMetadata({ url: sticker.url }, chatKey, chatId);
      
      const res = await api.sendGroupMediaMessage(activeGroup.id, payload, {
        type: 'sticker',
        media_url: encUrl,
        media_meta: encMeta
      }, replyTo?.id);
      addMessage({ ...res.message, senderUsername: me.display_name || me.username });
      setReplyTo(null);
    } catch (err) { console.error('[Media] Group sticker failed:', err); }
    finally { setIsSending(false); }
  };

  const handleEphemeralView = async (msg) => {
    try {
      await api.markEphemeralViewed(msg.id, true);
      if (msg.media_url && msg.type === 'image') {
        setTimeout(() => api.deleteMedia(msg.media_url), 30000);
      }
    } catch (err) { console.error('[Media] Ephemeral marking failed:', err); }
  };

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
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          const val = inputRef.current.value;
          inputRef.current.value = '';
          inputRef.current.value = val;
        }
      }, 100);
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
    try { 
      await api.addFriendToGroup(activeGroup.id, fid); 
      setAddableFriends(prev => prev.filter(f => f.id !== fid)); 
    } catch (err) {
      console.error("[Group] Invitation failed:", err);
      alert("Invite failed: " + (err.message || "Permissions issue"));
    } finally { setAddingId(null); }
  };

  const msgGroups = groupMessages(messages);

  return (
    <div className="h-full flex flex-col relative transition-colors duration-300">
      <div className={`h-12 border-b border-white/[0.06] flex items-center px-4 gap-3 flex-shrink-0 transition-colors ${theme === 'vibrant' ? 'bg-[#16161a]' : 'bg-[#0c0c0e]'}`}>
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
            <SharedMessageItem key={g.messages[0].id} msg={g.messages[0]} isFirst={true} groupItem={g} me={me} isUnlocked={isUnlocked} onContextMenu={handleContextMenu} onReply={handleReply} onEdit={handleEdit} onReact={handleReact} onViewProfile={onViewProfile} profiles={profiles} chatKey={chatKey} chatId={chatId} onLightbox={setLightboxSrc} onEphemeralView={handleEphemeralView} />
            {g.messages.slice(1).map(m => (
              <SharedMessageItem key={m.id} msg={m} me={me} isUnlocked={isUnlocked} onContextMenu={handleContextMenu} onReply={handleReply} onEdit={handleEdit} onReact={handleReact} onViewProfile={onViewProfile} profiles={profiles} chatKey={chatKey} chatId={chatId} onLightbox={setLightboxSrc} onEphemeralView={handleEphemeralView} />
            ))}
          </React.Fragment>
        ))}
        <div className="h-6" />
      </div>

      <div className="px-3 md:px-4 pb-5 md:pb-6 pt-2 flex-shrink-0 safe-bottom relative">
        {/* Typing Indicator */}
        {typingUsers.length > 0 && (
          <div className="absolute bottom-full left-0 mb-1 px-4 md:px-5 flex items-center gap-2 pointer-events-none animate-in fade-in slide-in-from-bottom-1 duration-200">
            <div className="flex gap-1">
              <span className="w-1 h-1 bg-white/30 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1 h-1 bg-white/30 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1 h-1 bg-white/30 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-[10px] font-bold text-white/30 uppercase tracking-wider">{typingUsers.join(", ")} {typingUsers.length > 1 ? "are" : "is"} typing...</span>
          </div>
        )}
        {/* Upload Progress */}
        {uploadProgress && (
          <div className="mb-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl px-4 py-2.5 flex items-center gap-3 text-xs text-indigo-300 animate-pulse">
            <Loader2 size={14} className="animate-spin" />
            <span className="font-semibold uppercase tracking-wider">
              {uploadProgress === 'compressing' ? 'Compressing & Encrypting...' : uploadProgress === 'uploading' ? 'Uploading to Vault...' : 'Done!'}
            </span>
          </div>
        )}
        {(replyTo || editingMsg) && (
          <div className="mb-2 bg-indigo-500/10 border border-indigo-500/20 rounded-t-xl px-4 py-2 flex items-center justify-between text-xs text-indigo-300">
            <div className="flex items-center gap-2 truncate">
              {replyTo ? <CornerUpLeft size={14} /> : <Edit2 size={14} />}
              <span className="font-semibold">{replyTo ? `Replying to ${replyTo.senderUsername}` : "Editing Message"}</span>
            </div>
            <button onClick={() => { setReplyTo(null); setEditingMsg(null); setInput(""); }} className="p-1 hover:bg-white/10 rounded-full"><X size={14} /></button>
          </div>
        )}
        {/* Media Picker */}
        {showMediaPicker && (
          <MediaPicker 
            onSelectFile={handleSendImage}
            onSelectGif={handleSendGif}
            onSelectSticker={handleSendSticker}
            onClose={() => setShowMediaPicker(false)}
            ephemeral={ephemeralMode}
            onToggleEphemeral={() => setEphemeralMode(!ephemeralMode)}
          />
        )}
        <form onSubmit={send} className={`bg-white/[0.04] rounded-xl px-3 md:px-4 flex items-center border ${replyTo || editingMsg ? 'border-t-0 rounded-t-none' : 'border-white/[0.06]'} focus-within:border-white/10 transition-colors`}>
          {!isUnlocked && <button type="button" onClick={() => setShowKey(true)} className="p-2 -ml-1 text-amber-500"><Lock size={18} /></button>}
          {isUnlocked && (
            <button type="button" onClick={() => setShowMediaPicker(!showMediaPicker)} className={`p-2.5 -ml-1 transition-colors ${showMediaPicker ? 'text-indigo-400' : 'text-white/25 hover:text-white/50 active:text-indigo-400'}`}>
              <Plus size={20} />
            </button>
          )}
          <input ref={inputRef} disabled={!isUnlocked || isSending} 
            autoComplete="off" name="q_group_search"
            data-lpignore="true" data-1p-ignore="true" data-form-type="other"
            spellCheck="false" autoCorrect="off" autoCapitalize="off"
            className="flex-1 bg-transparent py-3 text-[15px] outline-none text-white/80 placeholder:text-white/20 disabled:opacity-30"
            placeholder={isUnlocked ? `Message #${activeGroup.name}` : "Enter passkey to unlock"} value={input} onChange={(e) => setInput(e.target.value)} />
          {isUnlocked && <button type="submit" disabled={!input.trim() || isSending} className="p-2 text-white/30 hover:text-indigo-400 disabled:opacity-20">
            {isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>}
        </form>
      </div>
      {showAddFriend && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#1e1f22] rounded-xl overflow-hidden shadow-2xl border border-white/5">
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-white font-bold">Add to Group</h3>
              <button onClick={() => setShowAddFriend(false)} className="text-white/40 hover:text-white"><X size={20} /></button>
            </div>
            <div className="p-4 max-h-[400px] overflow-y-auto discord-scrollbar">
              {loadingFriends ? (
                <div className="flex justify-center py-8"><Loader2 className="animate-spin text-indigo-400" /></div>
              ) : addableFriends.length > 0 ? (
                <div className="space-y-2">
                  {addableFriends.map(f => (
                    <div key={f.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#2b2d31] flex items-center justify-center text-[10px] font-bold text-indigo-400/50">
                          <CipherMascot id={f.avatar_id} className="w-full h-full p-1.5" />
                        </div>
                        <span className="text-sm text-white/80 font-medium">{f.display_name || f.username}</span>
                      </div>
                      <button 
                        onClick={() => addFriend(f.id)}
                        disabled={addingId === f.id}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-md transition-colors disabled:opacity-50"
                      >
                        {addingId === f.id ? <Loader2 size={14} className="animate-spin" /> : "Invite"}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center py-8 text-white/20 text-sm">No friends to invite</p>
              )}
            </div>
          </div>
        </div>
      )}
      {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
      {showKey && <KeyModal title="Group Key" onClose={() => setShowKey(false)} onSubmit={(k) => { setChatKey(k); setIsUnlocked(true); setShowKey(false); }} />}
      {contextMenu && (
        <MessageContextMenu 
          {...contextMenu} 
          onClose={() => setContextMenu(null)}
          onReact={handleReact}
          onReply={(msg) => { setReplyTo(msg); inputRef.current?.focus(); }}
          onEdit={(msg) => { setEditingMsg(msg); setInput(msg.plaintext || ""); inputRef.current?.focus(); }}
          onDelete={handleDeleteMessage}
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
                <span className="text-sm text-white/80 cursor-pointer hover:underline" onClick={() => onViewProfile(f.id)}>@{f.username}</span>
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
  const [isSettingsView, setIsSettingsView] = useState(false);
  const [profileForm, setProfileForm] = useState(null);
  const [pwdForm, setPwdForm] = useState({ current: "", new: "" });
  const [pwdStatus, setPwdStatus] = useState(null);
  const [selectedUserForProfile, setSelectedUserForProfile] = useState(null);
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  // Tactical PWA Capture
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      console.log("[PWA] Install prompt detected and captured.");
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallPWA = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`[PWA] User response to install prompt: ${outcome}`);
    if (outcome === 'accepted') setDeferredPrompt(null);
  };

  // Centralized identity registry for real-time consistency
  const [profiles, setProfiles] = useState({});

  const updateProfiles = useCallback((newUsers) => {
    if (!newUsers || !Array.isArray(newUsers)) return;
    setProfiles(prev => {
      const next = { ...prev };
      let changed = false;
      newUsers.forEach(u => {
        if (!u || !u.id) return;
        const current = next[u.id];
        // Deep compare or simple existence check
        if (!current || 
            current.username !== u.username || 
            current.display_name !== u.display_name || 
            current.avatar_id !== u.avatar_id || 
            current.bio !== u.bio || 
            current.status !== u.status) {
          next[u.id] = { ...current, ...u };
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, []);

  useEffect(() => {
    if (isSettingsView && me && !profileForm) {
      setProfileForm({
        display_name: me.display_name || "",
        bio: me.bio || "",
        avatar_id: me.avatar_id || 1,
        banner_color: me.banner_color || "#4f46e5"
      });
    }
  }, [isSettingsView, me, profileForm]);

  const isProfileDirty = profileForm && me && (
    profileForm.display_name !== (me.display_name||"") ||
    profileForm.bio !== (me.bio||"") ||
    profileForm.avatar_id !== (me.avatar_id||1) ||
    profileForm.banner_color !== (me.banner_color||"#4f46e5")
  );
  const [notificationPrefs, setNotificationPrefs] = useState(() => {
    const saved = localStorage.getItem(NOTIFICATION_PREFS_KEY);
    return saved ? JSON.parse(saved) : DEFAULT_NOTIFICATION_PREFS;
  });
  const [theme, setTheme] = useState(() => localStorage.getItem("cipher_theme") || "classical");
  const [activeSettingsTab, setActiveSettingsTab] = useState("profiles");
  const [settingsMobileView, setSettingsMobileView] = useState("nav");
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const statusMenuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (statusMenuRef.current && !statusMenuRef.current.contains(e.target)) {
        setShowStatusMenu(false);
      }
    };
    if (showStatusMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showStatusMenu]);

  const onlineUsers = usePresence(me);

  const loadNetwork = async (search = "") => {
    const [usersRes, friendsRes, requestsRes, myGroupsRes] = await Promise.allSettled([api.users(search), api.friends(), api.friendRequests(), api.myGroups()]);
    
    // Seed profiles registry
    const allEncountered = [];
    if (usersRes.status === "fulfilled") {
      setUsers(usersRes.value.users || []);
      allEncountered.push(...(usersRes.value.users || []));
    }
    if (friendsRes.status === "fulfilled") {
      setFriends([AI_USER, ...(friendsRes.value.friends || [])]);
      allEncountered.push(...(friendsRes.value.friends || []));
    }
    if (requestsRes.status === "fulfilled") {
      setIncomingRequests(requestsRes.value.incoming || []);
      setOutgoingRequests(requestsRes.value.outgoing || []);
      allEncountered.push(...(requestsRes.value.incoming || []).map(r => ({ id: r.fromUserId, username: r.username, display_name: r.display_name, avatar_id: r.avatar_id })));
      allEncountered.push(...(requestsRes.value.outgoing || []).map(r => ({ id: r.toUserId, username: r.username, display_name: r.display_name, avatar_id: r.avatar_id })));
    }
    if (myGroupsRes.status === "fulfilled") setMyGroups(myGroupsRes.value.groups || []);

    if (allEncountered.length > 0) updateProfiles(allEncountered);
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

  // Global Tactical Identity Sync
  useEffect(() => {
    if (view !== 'main' || !me?.id) return;

    const channel = supabase.channel('identity_sync')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'users' },
        (payload) => {
          console.log("[Presence] Tactical identity update detected:", payload.new.id);
          updateProfiles([payload.new]);
          if (payload.new.id === me?.id) {
            setMe(p => ({ ...p, ...payload.new }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [view, me?.id, updateProfiles]);
  
  useEffect(() => {
    localStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(notificationPrefs));
  }, [notificationPrefs]);

  useEffect(() => {
    localStorage.setItem("cipher_theme", theme);
    // Update browser theme-color meta tag
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', theme === 'vibrant' ? '#111114' : '#0a0a0c');
  }, [theme]);

  const handleUpdateProfile = async (updates) => {
    try {
      const { error } = await supabase.from('users').update(updates).eq('id', me.id);
      if (error) throw error;
      setMe(p => ({ ...p, ...updates }));
      return { success: true };
    } catch (err) {
      console.error("[Settings] Profile update failed:", err);
      return { success: false, error: err.message };
    }
  };

  const handleUpdatePassword = async (oldPassword, newPassword) => {
    try {
      // Supabase updateUser with password requires being logged in.
      // Note: verify old password if you want, but auth.updateUser handles the rotation.
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      return { success: true };
    } catch (err) {
      console.error("[Settings] Password update failed:", err);
      return { success: false, error: err.message };
    }
  };

  const handleAuth = async (e) => {
    e.preventDefault(); setAuthError(""); setIsProcessing(true);
    try { await api.getCsrf(); const res = await (authMode === "login" ? api.login : api.register)({ username, password }); setMe(res.user); setView("main"); await loadNetwork(""); }
    catch (err) { setAuthError(err.message || "Authentication failed"); }
    finally { setIsProcessing(false); }
  };

  const onLogout = async () => { try { await api.logout(); } catch {} setView("auth"); setMe(null); setActiveChat(null); setActiveGroup(null); setUsers([]); setFriends([]); setIncomingRequests([]); setOutgoingRequests([]); setMyGroups([]); setPassword(""); };
  const handleViewProfile = async (userId) => {
    if (!userId) return;
    if (userId === AI_USER.id) { setSelectedUserForProfile(AI_USER); return; }
    
    // Check global profile registry first
    const cached = profiles[userId];
    if (cached) { setSelectedUserForProfile(cached); return; }

    try {
      const { data, error } = await supabase.from('users').select('*').eq('id', userId).single();
      if (!error && data) {
        updateProfiles([data]);
        setSelectedUserForProfile(data);
      }
    } catch {}
  };

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
  const removeFriend = async (id) => { 
    if (!id || id === AI_USER.id) return; 
    
    const confirmed = window.confirm("⚠️ Nuclear Option: Unfriending will permanently delete all Direct Messages between you and this user for BOTH of you. This is irreversible.\n\nAre you sure you want to proceed?");
    if (!confirmed) return;

    try { 
      await api.removeFriend(id); 
      if (activeChat?.id === id) setActiveChat(null); 
      await loadNetwork(searchQuery); 
    } catch (err) {
      console.error("[Social] Unfriend failed:", err);
      alert("Failed to unfriend: " + err.message);
    } 
  };
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
    <div onContextMenu={(e) => { if (e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") e.preventDefault(); }} 
      className={`h-[100dvh] flex font-['Inter',system-ui,sans-serif] overflow-hidden transition-colors duration-300 ${theme === 'vibrant' ? 'bg-[#111114] text-white' : 'bg-[#0a0a0c] text-white'}`}>
      {/* ─── Sidebar ─── */}
      <aside className={`${mobileSidebarOpen ? 'flex' : 'hidden'} md:flex flex-col w-full md:w-[272px] flex-shrink-0 mobile-view-transition safe-top border-r transition-colors duration-300 ${theme === 'vibrant' ? 'bg-[#16161a] border-white/[0.08]' : 'bg-[#0c0c0e] border-white/[0.06]'}`}>
        {/* Search & Friends Top Bar */}
        <div className="px-3 py-3 pb-2 flex items-center gap-2.5">
          <img src="/logo.png" alt="Cipher" className="w-[18px] h-[18px] opacity-80" />
          <div className="flex-1 min-w-0 flex items-center gap-2 bg-white/[0.03] border border-white/[0.06] rounded-xl px-2.5 py-[6px] focus-within:bg-white/[0.05] focus-within:border-indigo-500/30 transition-all">
            <Search size={13} className="text-white/20 flex-shrink-0" />
            <input className="bg-transparent text-[11px] outline-none flex-1 text-white/70 placeholder:text-white/15 min-w-0" 
              placeholder="Search..." value={sidebarFilter} onChange={(e) => setSidebarFilter(e.target.value)} 
              autoComplete="chrome-off" name="sidebar_filter_query"
              data-lpignore="true" data-1p-ignore="true" data-form-type="other" />
          </div>
          <button onClick={() => { setActiveChat(null); setActiveGroup(null); setMobileSidebarOpen(false); }}
            title="Friends"
            className={`relative flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-all active:scale-90 ${isMainView ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'bg-white/[0.04] text-white/40 hover:text-white/70 hover:bg-white/[0.06]'}`}>
            <GroupsIcon size={16} />
            {incomingRequests.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-black rounded-full w-3.5 h-3.5 flex items-center justify-center border-2 border-[#0c0c0e]">
                {incomingRequests.length}
              </span>
            )}
          </button>
        </div>

        <div className="h-px bg-white/[0.06] mx-3 my-1.5" />

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto discord-scrollbar px-2 space-y-0.5">
          {/* DMs */}
          <div className="flex items-center justify-between px-2 pt-3 pb-1">
            <span className={`text-[11px] font-semibold uppercase tracking-wide transition-colors ${theme === 'vibrant' ? 'text-white/40' : 'text-white/20'}`}>Direct Messages</span>
          </div>
          {filteredFriends.map(f => (
            <div key={f.id} className="relative group">
              <button onClick={() => { setActiveChat(f); setActiveGroup(null); setIsSettingsView(false); setMobileSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-2.5 py-2 md:py-1.5 rounded-lg transition-colors active:scale-[0.98] ${activeChat?.id === f.id && !isSettingsView ? 'bg-white/[0.06] text-white' : 'text-white/40 active:bg-white/[0.04]'}`}>
                <div 
                  onClick={(e) => { e.stopPropagation(); handleViewProfile(f.id); }}
                  className="relative w-9 md:w-8 h-9 md:h-8 flex-shrink-0 cursor-pointer hover:shadow-[0_0_10px_rgba(99,102,241,0.2)] transition-all"
                >
                  <div className={`w-full h-full rounded-full flex items-center justify-center text-xs font-bold ${f.isAI ? 'bg-indigo-600/25 text-indigo-400' : 'bg-[#2b2d31] text-indigo-400/50'}`}>
                    {f.isAI ? <Sparkles size={14} /> : <CipherMascot className="w-full h-full p-2" id={profiles[f.id]?.avatar_id || f.avatar_id} />}
                  </div>
                  {!f.isAI && (
                    <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#121215] transition-colors ${
                      !onlineUsers.has(f.id) || profiles[f.id]?.status === 'invisible' ? 'bg-white/20' : 
                      profiles[f.id]?.status === 'idle' ? 'bg-[#f0b232]' : 
                      profiles[f.id]?.status === 'dnd' ? 'bg-[#f23f43]' : 'bg-[#23a55a]'
                    }`} />
                  )}
                </div>
                <span className="text-[14px] md:text-[13px] truncate">{profiles[f.id]?.display_name || f.display_name || f.username}</span>
              </button>
            </div>
          ))}

          {/* Groups */}
          <div className="flex items-center justify-between px-2 pt-4 pb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-white/20">Groups</span>
            <button onClick={() => { setShowCreateGroup(!showCreateGroup); setGroupNameInput(""); }} className="p-1 -mr-1 text-white/30 hover:text-white/80 transition-colors active:scale-95"><Plus size={16} /></button>
          </div>
          {showCreateGroup && (
            <div className="flex gap-2 px-2 mb-3">
              <input autoFocus 
                className="flex-1 bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2 text-[13px] outline-none text-white/80 placeholder:text-white/15 focus:border-indigo-500/40 focus:bg-white/[0.05] transition-all" 
                placeholder="Group name..." 
                value={groupNameInput} 
                onChange={(e) => setGroupNameInput(e.target.value)} 
                onKeyDown={(e) => e.key === "Enter" && createGroup()} 
                autoComplete="off" />
              <button onClick={createGroup} 
                disabled={isCreatingGroup || groupNameInput.trim().length < 2} 
                className="flex-shrink-0 w-9 h-9 bg-indigo-600 rounded-lg text-white hover:bg-indigo-500 disabled:opacity-30 transition-all flex items-center justify-center shadow-lg shadow-indigo-500/10 active:scale-90">
                {isCreatingGroup ? <Loader2 size={16} className="animate-spin" /> : <CheckIcon size={16} strokeWidth={3} />}
              </button>
            </div>
          )}
          {filteredGroups.map(g => (
            <button key={g.id} onClick={() => { setActiveGroup(g); setActiveChat(null); setIsSettingsView(false); setMobileSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-2.5 py-2 md:py-1.5 rounded-lg transition-colors active:scale-[0.98] ${activeGroup?.id === g.id && !isSettingsView ? 'bg-white/[0.06] text-white' : 'text-white/40 active:bg-white/[0.04]'}`}>
              <div className="w-9 md:w-8 h-9 md:h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-xs font-bold text-white/40 flex-shrink-0">#</div>
              <span className="text-[14px] md:text-[13px] truncate">{g.name}</span>
            </button>
          ))}
        </div>

        {/* User panel */}
        <div className={`p-2 border-t border-white/[0.06] safe-bottom transition-colors relative ${theme === 'vibrant' ? 'bg-white/[0.02]' : 'bg-black/30'}`}>
          {/* Status Selection Menu */}
          {showStatusMenu && (
            <div ref={statusMenuRef} className="absolute bottom-[110%] left-2 right-2 bg-[#111214] border border-white/10 rounded-xl shadow-2xl p-1.5 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
              {[
                { id: 'online', label: 'Online', color: 'bg-[#23a55a]', text: 'ACTIVE' },
                { id: 'idle', label: 'Idle', color: 'bg-[#f0b232]', text: 'PASSIVE' },
                { id: 'dnd', label: 'Do Not Disturb', color: 'bg-[#f23f43]', text: 'STANDBY' },
                { id: 'invisible', label: 'Invisible', color: 'bg-[#80848e]', text: 'INVISIBLE' }
              ].map(s => (
                <button
                  key={s.id}
                  onClick={() => {
                    handleUpdateProfile({ status: s.id });
                    setShowStatusMenu(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/5 rounded-lg transition-colors group"
                >
                  <div className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
                  <span className="text-[11px] font-bold text-white/50 group-hover:text-white transition-colors uppercase tracking-wider">{s.label}</span>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between px-2 py-2 md:py-1.5">
            <div 
              className="flex items-center gap-2.5 min-w-0 cursor-pointer group/profile"
              onClick={() => setShowStatusMenu(true)}
            >
              <div className="relative w-9 md:w-8 h-9 md:h-8 flex-shrink-0">
                <div className="w-full h-full bg-[#2b2d31] rounded-full flex items-center justify-center transition-transform group-hover/profile:scale-105 active:scale-95">
                  <CipherMascot className="w-full h-full p-1.5 text-indigo-400" id={me?.avatar_id} />
                </div>
                <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#1a1a1e] ${
                  me?.status === 'online' ? 'bg-[#23a55a]' : 
                  me?.status === 'idle' ? 'bg-[#f0b232]' : 
                  me?.status === 'dnd' ? 'bg-[#f23f43]' : 'bg-[#80848e]'
                }`} />
              </div>
              <div className="min-w-0">
                <p className="text-[14px] md:text-[13px] font-bold text-white/90 truncate uppercase tracking-tight">@{me?.username}</p>
                <p className="text-[10px] text-white/40 flex items-center leading-none pt-0.5 uppercase font-black tracking-widest">
                  {me?.status === 'online' ? 'ACTIVE' : me?.status === 'idle' ? 'PASSIVE' : me?.status === 'dnd' ? 'STANDBY' : 'INVISIBLE'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => { setIsSettingsView(true); setMobileSidebarOpen(false); }} className={`p-2.5 rounded-xl transition-all ${isSettingsView ? 'text-indigo-400 bg-white/10' : 'text-white/20 hover:text-white/60 hover:bg-white/5'}`}><SettingsIcon size={18} /></button>
              <button onClick={onLogout} className="p-2.5 text-white/20 hover:text-red-400 rounded-xl hover:bg-red-500/10 transition-all"><LogOut size={18} /></button>
            </div>
          </div>
        </div>
      </aside>

      {/* ─── Main Content ─── */}
      <main className={`${mobileSidebarOpen && (activeChat || activeGroup || isSettingsView) ? 'hidden md:flex' : mobileSidebarOpen ? 'hidden md:flex' : 'flex'} md:flex flex-col flex-1 min-w-0 min-h-0 bg-[#0c0c0e]`}>
        {isSettingsView ? (
          /* ─── Settings 'Wall' View ─── */
          <div className="w-full h-full min-h-0 flex flex-col md:flex-row-reverse transition-all duration-300 overflow-hidden relative">
            
            {/* Sidebar (Mobile: only shown if view is 'nav') */}
            <aside className={`${settingsMobileView === 'nav' ? 'flex' : 'hidden'} md:flex flex-col w-full md:w-64 bg-white/[0.02] border-l border-white/[0.05] flex-shrink-0`}>
              <div className="p-6 pb-2 flex items-center justify-between md:block">
                <div>
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-white/30">User Settings</h3>
                  <p className="text-xl font-bold text-white mt-1 hidden md:block">Settings</p>
                </div>
                <button onClick={() => setIsSettingsView(false)} className="md:hidden p-2 text-white/40 hover:text-white"><X size={20} /></button>
              </div>

              <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1 discord-scrollbar">
                {[
                  { id: 'profiles', label: 'Profiles', icon: UserIcon, cat: 'User Settings' },
                  { id: 'account', label: 'Account', icon: Shield, cat: 'User Settings' },
                  { id: 'display', label: 'Display', icon: Palette, cat: 'App Settings' },
                  { id: 'notifications', label: 'Notifications', icon: Bell, cat: 'App Settings' },
                ].map((item, i, arr) => (
                  <React.Fragment key={item.id}>
                    {(i === 0 || item.cat !== arr[i-1].cat) && (
                      <div className="px-3 pt-4 pb-2 text-[10px] font-bold uppercase tracking-wider text-white/20">{item.cat}</div>
                    )}
                    <button 
                      onClick={() => { setActiveSettingsTab(item.id); setSettingsMobileView('content'); }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${activeSettingsTab === item.id ? 'bg-white/10 text-white' : 'text-white/40 hover:bg-white/[0.04] hover:text-white/70'}`}
                    >
                      <item.icon size={18} />
                      {item.label}
                    </button>
                  </React.Fragment>
                ))}
              </div>

              <div className="p-4 mt-auto border-t border-white/5 hidden md:block">
                <button onClick={onLogout} className="w-full flex items-center gap-3 px-3 py-2.5 text-red-400/60 hover:text-red-400 hover:bg-red-400/5 rounded-lg text-sm font-bold transition-all">
                  <LogOut size={18} /> Log Out
                </button>
              </div>
            </aside>

            {/* Content Area (Mobile: only shown if view is 'content') */}
            <main className={`${settingsMobileView === 'content' ? 'flex' : 'hidden'} md:flex flex-col flex-1 min-w-0 min-h-0 bg-transparent relative`}>
              {/* Mobile Header */}
              <div className="md:hidden flex items-center gap-3 px-4 h-14 border-b border-white/5">
                <button onClick={() => setSettingsMobileView('nav')} className="p-2 -ml-2 text-white/40"><ChevronLeft size={24} /></button>
                <span className="font-bold text-white uppercase tracking-wider text-xs">{activeSettingsTab}</span>
              </div>

              {/* Content area that scrolls */}
              <div className="flex-1 overflow-y-auto px-6 md:px-12 pt-8 md:pt-12 pb-32 discord-scrollbar">
                <div className="max-w-2xl mx-auto space-y-12">
                  
                  {/* Profiles Tab */}
                  {activeSettingsTab === 'profiles' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
                       {/* ─── Digital ID Card ─── */}
                      <section className="space-y-3">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-white/30 px-1">Network Identity</label>
                        <div className="relative w-full max-w-[400px] rounded-2xl overflow-hidden bg-[#0f0f11] shadow-2xl group border border-white/10 p-6 flex flex-col items-center">
                          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent pointer-events-none" />
                          
                          {/* Top bar with stylized chip */}
                          <div className="w-full flex justify-between items-center mb-6">
                            <div className="w-8 h-6 rounded-md bg-gradient-to-tr from-[#FFD700] to-[#B8860B] shadow-[0_0_10px_rgba(255,215,0,0.2)] border border-[#DAA520]" />
                            <span className="text-[10px] font-mono font-bold tracking-widest text-indigo-400">CIPHER_NODE // SECURE</span>
                          </div>

                          {/* Avatar Interactive Flip Trigger */}
                          <div className="relative w-28 h-28 mb-4 border-2 border-white/10 rounded-full bg-[#111214] p-1 shadow-[0_0_20px_rgba(0,0,0,0.5)] cursor-pointer group/avatar">
                            <div className="w-full h-full bg-[#1e1f24] rounded-full overflow-hidden flex items-center justify-center transition-transform group-hover/avatar:scale-[1.02]">
                              <CipherMascot className="w-full h-full p-4 text-indigo-400/90" id={profileForm?.avatar_id || me?.avatar_id || 1} />
                            </div>
                            {/* Hover prompt */}
                            <div className="absolute -bottom-2 -right-2 bg-indigo-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full opacity-0 group-hover/avatar:opacity-100 transition-opacity">
                              ACCESS
                            </div>
                          </div>

                          <div className="text-center space-y-1 w-full">
                            <h4 className="text-white font-black text-xl tracking-tight">
                              {profileForm?.display_name || me?.display_name || me?.username}
                            </h4>
                            <p className="text-white/40 font-mono text-xs">@{me?.username}</p>
                          </div>

                          {/* Telemetry Block */}
                          <div className="mt-8 w-full bg-white/[0.02] border border-white/5 rounded-xl p-4 space-y-3">
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-white/30 uppercase font-bold text-[9px] tracking-widest">Node Inception</span>
                              <span className="text-white/80 font-mono">{new Date(me?.created_at || Date.now()).toLocaleDateString()}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-white/30 uppercase font-bold text-[9px] tracking-widest">Clearance Level</span>
                              <span className="text-indigo-400 font-bold">Standard</span>
                            </div>
                            {profileForm?.bio && (
                              <div className="pt-3 border-t border-white/5 text-left">
                                <span className="text-white/30 uppercase font-bold text-[9px] tracking-widest block mb-1">Bio Data</span>
                                <p className="text-white/60 text-[11px] leading-relaxed">{profileForm.bio}</p>
                              </div>
                            )}
                          </div>

                          {/* Mock Action */}
                          <button className="mt-6 w-full py-3 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-xl text-xs font-bold uppercase tracking-widest transition-all">
                            Transmit Ping
                          </button>
                        </div>
                      </section>

                      {/* Display Info */}
                      <section className="space-y-6">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-white/30 px-1">Tactical Mascot</label>
                          <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
                            {[1,2,3,4,5,6,7,8].map(id => (
                              <button 
                                key={id} 
                                onClick={() => setProfileForm(p => ({ ...p, avatar_id: id }))}
                                className={`aspect-square rounded-xl flex items-center justify-center transition-all bg-[#111214] border ${profileForm?.avatar_id === id ? 'border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.2)]' : 'border-white/5 hover:border-white/20 hover:bg-white/[0.04]'}`}
                              >
                                <CipherMascot className="w-8 h-8 text-indigo-400" id={id} />
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-white/30 px-1">Display Name</label>
                          <input 
                            value={profileForm?.display_name || ""} 
                            onChange={(e) => setProfileForm(p => ({ ...p, display_name: e.target.value }))}
                            className="w-full bg-[#111214] border border-white/5 rounded-xl px-4 py-3 text-sm text-white/80 outline-none focus:border-indigo-500/30 focus:bg-[#16171a] transition-all" 
                            placeholder="Enter display name..." 
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-white/30 px-1">Neural Bio</label>
                          <textarea 
                            value={profileForm?.bio || ""} 
                            onChange={(e) => setProfileForm(p => ({ ...p, bio: e.target.value }))}
                            rows={3}
                            className="w-full bg-[#111214] border border-white/5 rounded-xl px-4 py-3 text-sm text-white/80 outline-none focus:border-indigo-500/30 focus:bg-[#16171a] transition-all resize-none" 
                            placeholder="Tell the network about yourself..." 
                          />
                        </div>
                      </section>
                    </div>
                  )}

                  {/* Account Tab */}
                  {activeSettingsTab === 'account' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
                      <section className="space-y-4">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-white/30 px-1">Security Protocols</label>
                        <div className="p-6 bg-[#111214] border border-indigo-500/10 rounded-2xl space-y-6">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-bold text-white">E2EE Data Encryption</p>
                              <p className="text-xs text-white/30 mt-0.5">All transmissions are cryptographically secured</p>
                            </div>
                            <div className="w-10 h-5 bg-indigo-600 rounded-full flex items-center px-1"><div className="w-3.5 h-3.5 bg-white rounded-full ml-auto" /></div>
                          </div>
                        </div>
                      </section>
                      <section className="space-y-4">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-white/30 px-1">Access Credentials</label>
                        <div className="p-6 bg-[#111214] border border-white/5 rounded-2xl space-y-4">
                           <div className="space-y-3">
                             <input 
                               type="password" 
                               placeholder="Current Passcode" 
                               value={pwdForm.current}
                               onChange={e => setPwdForm(p => ({ ...p, current: e.target.value }))}
                               className="w-full bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500/30 transition-all text-white/80" 
                             />
                             <input 
                               type="password" 
                               placeholder="New Passcode (min 10 chars)" 
                               value={pwdForm.new}
                               onChange={e => setPwdForm(p => ({ ...p, new: e.target.value }))}
                               className="w-full bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500/30 transition-all text-white/80" 
                             />
                           </div>
                           {pwdStatus && (
                             <div className={`p-3 rounded-xl text-xs font-bold ${pwdStatus.success ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                               {pwdStatus.msg}
                             </div>
                           )}
                           <button 
                             disabled={pwdForm.new.length < 10}
                             onClick={async () => {
                               setPwdStatus({ success: null, msg: "Updating..." });
                               const res = await handleUpdatePassword(pwdForm.current, pwdForm.new);
                               if (res.success) {
                                 setPwdStatus({ success: true, msg: "Passcode updated successfully." });
                                 setPwdForm({ current: "", new: "" });
                               } else {
                                 setPwdStatus({ success: false, msg: res.error || "Update failed." });
                               }
                             }}
                             className="w-full py-3 bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-600 hover:text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-30 disabled:hover:bg-indigo-600/20 disabled:hover:text-indigo-400"
                           >
                             Update Passcode
                           </button>
                        </div>
                      </section>
                      <section className="pt-8 border-t border-white/5">
                         <button onClick={onLogout} className="px-6 py-2.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all">Deauthorize Node</button>
                      </section>
                    </div>
                  )}

                   {/* Display Tab */}
                   {activeSettingsTab === 'display' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
                       <section className="space-y-4">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-white/30 px-1">Visual Matrix</label>
                        <div className="grid grid-cols-2 gap-4">
                           <button onClick={() => setTheme('minimalist')} className={`p-4 rounded-2xl border transition-all text-left ${theme === 'minimalist' ? 'bg-indigo-600/10 border-indigo-600 text-white' : 'bg-white/[0.02] border-white/5 text-white/40 hover:bg-white/[0.04]'}`}>
                              <p className="font-bold text-sm">Minimalist</p>
                              <p className="text-[10px] opacity-60 mt-1">Dark & tactical</p>
                           </button>
                           <button onClick={() => setTheme('vibrant')} className={`p-4 rounded-2xl border transition-all text-left ${theme === 'vibrant' ? 'bg-indigo-600/10 border-indigo-600 text-white' : 'bg-white/[0.02] border-white/5 text-white/40 hover:bg-white/[0.04]'}`}>
                              <p className="font-bold text-sm">Vibrant</p>
                              <p className="text-[10px] opacity-60 mt-1">High contrast</p>
                           </button>
                        </div>
                      </section>

                      {/* Tactical PWA Installation */}
                      {deferredPrompt && (
                        <section className="space-y-4 animate-in fade-in zoom-in-95 duration-500">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-white/30 px-1">Application Control</label>
                          <div className="p-6 bg-indigo-600/5 border border-indigo-600/10 rounded-2xl space-y-4">
                            <div className="flex items-center gap-4">
                              <div className="p-3 bg-indigo-600/10 rounded-xl text-indigo-400">
                                <Download size={24} />
                              </div>
                              <div>
                                <h4 className="text-sm font-bold text-white">Native Installation</h4>
                                <p className="text-xs text-white/40 mt-1">Install Cipher as a native PWA for a full-screen, high-performance tactical experience.</p>
                              </div>
                            </div>
                            <button 
                              onClick={handleInstallPWA}
                              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg shadow-indigo-600/20 transition-all active:scale-[0.98]"
                            >
                              Install Cipher App
                            </button>
                          </div>
                        </section>
                      )}
                    </div>
                  )}

                  {activeSettingsTab === 'notifications' && <div className="text-center py-20 text-white/10 uppercase font-bold tracking-[0.3em] text-xs">Notification Engine Online</div>}
                </div>

                {/* Desktop Close Button (Floating in content) */}
                <button onClick={() => setIsSettingsView(false)} className="absolute top-8 right-8 p-2 text-white/20 hover:text-white hover:bg-white/5 rounded-full transition-all hidden md:flex flex-col items-center gap-1 group">
                  <div className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center group-hover:border-white transition-colors"><X size={20} /></div>
                  <span className="text-[10px] font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">Esc</span>
                </button>
              </div>

              {/* ─── Unsaved Changes HUD (Floating) ─── */}
              {isProfileDirty && (
                <div className="absolute bottom-4 md:bottom-6 left-4 right-4 md:left-6 md:right-6 p-4 bg-[#111214]/90 backdrop-blur-xl border border-indigo-500/30 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4 md:gap-0 shadow-[0_20px_50px_rgba(0,0,0,0.5),0_0_15px_rgba(99,102,241,0.1)] animate-in slide-in-from-bottom-4 duration-300 z-50">
                  <div className="flex items-center gap-3 w-full md:w-auto overflow-hidden">
                    <div className="w-2 h-2 flex-shrink-0 rounded-full bg-indigo-500 animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-100/90 truncate">Unsaved Data Sequence Tracked</span>
                  </div>
                  <div className="flex gap-4 items-center w-full md:w-auto justify-end">
                    <button onClick={() => setProfileForm({
                        display_name: me.display_name || "",
                        bio: me.bio || "",
                        avatar_id: me.avatar_id || 1,
                        banner_color: me.banner_color || "#4f46e5"
                      })} className="text-[10px] font-bold uppercase tracking-widest text-white/30 hover:text-white transition-colors">Abort</button>
                    <button onClick={async (e) => {
                      const btn = e.currentTarget;
                      const originalText = btn.innerText;
                      btn.innerText = "Syncing...";
                      const res = await handleUpdateProfile(profileForm);
                      if (res.success) {
                        btn.innerText = "Synchronized";
                        btn.style.backgroundColor = "#22c55e"; // green-500
                        setTimeout(() => {
                           // isProfileDirty will naturally hide the HUD, but adding safety
                        }, 500);
                      } else {
                        btn.innerText = "Error";
                        btn.style.backgroundColor = "#ef4444"; // red-500
                        setTimeout(() => { btn.innerText = originalText; btn.style.backgroundColor = ""; }, 2000);
                      }
                    }} className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.15em] shadow-lg shadow-indigo-600/20 transition-all active:scale-95">Commit Protocol</button>
                  </div>
                </div>
              )}
            </main>
          </div>
        ) : activeChat ? (
          <ChatPanel activeChat={activeChat} me={me} onRemoveFriend={removeFriend} onBack={() => setMobileSidebarOpen(true)} theme={theme} onViewProfile={handleViewProfile} profiles={profiles} />
        ) : activeGroup ? (
          <GroupChatPanel activeGroup={activeGroup} me={me} onBack={() => setMobileSidebarOpen(true)} onExitGroup={leaveGroup} theme={theme} onViewProfile={handleViewProfile} profiles={profiles} />
        ) : (
          /* ─── Friends View ─── */
          <div className="h-full flex flex-col transition-all duration-300">
            <div className={`h-13 md:h-12 border-b border-white/[0.06] flex items-center px-3 md:px-4 gap-3 flex-shrink-0 safe-top transition-colors ${theme === 'vibrant' ? 'bg-[#16161a]' : 'bg-[#0c0c0e] md:bg-transparent'}`}>
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
                        <div 
                          onClick={() => handleViewProfile(f.id)}
                          className="relative cursor-pointer hover:shadow-[0_0_10px_rgba(99,102,241,0.2)] transition-all"
                        >
                          <div className="w-9 h-9 flex items-center justify-center text-sm font-bold bg-[#2b2d31] rounded-full text-indigo-400/50">
                            <CipherMascot className="w-full h-full p-2" id={profiles[f.id]?.avatar_id || f.avatar_id} />
                          </div>
                          <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#0a0a0c] transition-colors ${
                            !onlineUsers.has(f.id) || profiles[f.id]?.status === 'invisible' ? 'bg-white/20' : 
                            profiles[f.id]?.status === 'idle' ? 'bg-[#f0b232]' : 
                            profiles[f.id]?.status === 'dnd' ? 'bg-[#f23f43]' : 'bg-[#23a55a]'
                          }`} />
                        </div>
                        <div className="flex flex-col cursor-pointer hover:underline" onClick={() => handleViewProfile(f.id)}>
                          <span className="text-[14px] font-medium text-white/80">{profiles[f.id]?.display_name || f.display_name || f.username}</span>
                          <span className="text-[10px] text-white/20">@{f.username}</span>
                        </div>
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
                          <div 
                            onClick={() => handleViewProfile(r.fromUserId)}
                            className="w-9 h-9 flex items-center justify-center text-sm font-bold bg-[#2b2d31] rounded-full text-amber-500/50 cursor-pointer hover:shadow-[0_0_10px_rgba(99,102,241,0.2)] transition-all"
                          >
                            <CipherMascot className="w-full h-full p-2" id={r.u?.avatar_id} />
                          </div>
                          <div className="cursor-pointer hover:underline" onClick={() => handleViewProfile(r.fromUserId)}>
                            <p className="text-[14px] font-medium text-white/80 leading-tight">{r.display_name || r.username}</p>
                            <p className="text-[10px] text-amber-500/50">Incoming Request • @{r.username}</p>
                          </div>
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
                          <div 
                            onClick={() => handleViewProfile(r.toUserId)}
                            className="w-9 h-9 flex items-center justify-center text-sm font-bold bg-[#2b2d31] rounded-full text-indigo-400/50 cursor-pointer hover:shadow-[0_0_10px_rgba(99,102,241,0.2)] transition-all"
                          >
                            <CipherMascot className="w-full h-full p-2" id={r.u?.avatar_id} />
                          </div>
                          <div className="cursor-pointer hover:underline" onClick={() => handleViewProfile(r.toUserId)}>
                            <p className="text-[14px] font-medium text-white/80">{r.username}</p>
                            <p className="text-[10px] text-indigo-400/50">Pending</p>
                          </div>
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
                      <input className="bg-transparent flex-1 text-sm outline-none text-white/80 placeholder:text-white/15" 
                        placeholder="Enter a username..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} 
                        autoComplete="chrome-off" name="friend_search_query"
                        data-lpignore="true" data-1p-ignore="true" data-form-type="other" />
                      <Search size={16} className="text-white/20" />
                    </div>
                  </div>
                  {discoveredUsers.map(u => (
                    <div key={u.id} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-white/[0.03] border-t border-white/[0.04]">
                      <div className="flex items-center gap-3">
                        <div 
                          onClick={() => handleViewProfile(u.id)}
                          className="w-9 h-9 flex items-center justify-center text-sm font-bold bg-[#2b2d31] rounded-full text-indigo-400/50 cursor-pointer hover:shadow-[0_0_10px_rgba(99,102,241,0.2)] transition-all"
                        >
                          <CipherMascot className="w-full h-full p-2" id={u.avatar_id} />
                        </div>
                        <div onClick={() => handleViewProfile(u.id)} className="cursor-pointer hover:underline">
                          <p className="text-[14px] font-medium text-white/80 leading-tight">{u.display_name || u.username}</p>
                          <p className="text-[11px] text-white/20">@{u.username}</p>
                        </div>
                      </div>
                      <button onClick={() => sendFriendReq(u.id)} className="px-3 py-1.5 bg-indigo-600/20 text-indigo-400 rounded-md text-xs font-bold hover:bg-indigo-600 hover:text-white transition-colors">Send Request</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
      {/* ─── User Profile Tactical ID Modal ─── */}
      {selectedUserForProfile && (() => {
        const liveProfile = profiles[selectedUserForProfile.id] || selectedUserForProfile;
        const profileStatus = liveProfile.status || 'online';
        const isOnline = onlineUsers.has(selectedUserForProfile.id);
        const statusColor = !isOnline || profileStatus === 'invisible' ? 'bg-white/20' :
          profileStatus === 'idle' ? 'bg-[#f0b232]' :
          profileStatus === 'dnd' ? 'bg-[#f23f43]' : 'bg-[#23a55a]';
        const statusLabel = !isOnline ? 'Offline' :
          profileStatus === 'idle' ? 'Idle' :
          profileStatus === 'dnd' ? 'Do Not Disturb' :
          profileStatus === 'invisible' ? 'Invisible' : 'Online';
        return (
        <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-200" onClick={() => setSelectedUserForProfile(null)}>
          <div className="relative w-full max-w-[400px] rounded-3xl overflow-hidden bg-[#0a0a0c] border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.8)] flex flex-col items-center p-8 group" onClick={e => e.stopPropagation()}>
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/[0.05] to-transparent pointer-events-none" />
            
            {/* Tactical Header */}
            <div className="w-full flex justify-between items-center mb-8">
              <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                <span className="text-[9px] font-mono font-bold tracking-[0.2em] text-white/50 uppercase">Network_Node_{selectedUserForProfile.id?.slice(0,4)}</span>
              </div>
              <button onClick={() => setSelectedUserForProfile(null)} className="p-2 text-white/20 hover:text-white transition-colors"><X size={20} /></button>
            </div>

            {/* Avatar Display */}
            <div className="relative w-32 h-32 mb-6 border-2 border-white/10 rounded-full bg-[#111214] p-1 shadow-[0_0_30px_rgba(99,102,241,0.15)]">
              <div className="w-full h-full bg-[#1e1f24] rounded-full overflow-hidden flex items-center justify-center">
                <CipherMascot className="w-full h-full p-5 text-indigo-400" id={liveProfile.avatar_id || 1} />
              </div>
              <div className={`absolute bottom-1 right-1 w-6 h-6 rounded-full border-[3px] border-[#0a0a0c] ${statusColor}`} />
            </div>

            <div className="text-center space-y-1 w-full mb-8">
              <h4 className="text-white font-black text-2xl tracking-tight">
                {liveProfile.display_name || liveProfile.username || selectedUserForProfile.username}
              </h4>
              <p className="text-indigo-400 font-mono text-sm">@{selectedUserForProfile.username}</p>
              <p className="text-[10px] text-white/30 uppercase tracking-widest font-bold flex items-center justify-center gap-1.5 pt-1">
                <span className={`w-2 h-2 rounded-full ${statusColor}`} />
                {statusLabel}
              </p>
            </div>

            {/* Telemetry Matrix */}
            <div className="w-full bg-white/[0.03] border border-white/5 rounded-2xl p-5 space-y-4 mb-8">
              <div className="flex justify-between items-center">
                <span className="text-white/20 uppercase font-black text-[9px] tracking-[0.2em]">Node Inception</span>
                <span className="text-white/70 font-mono text-xs">{new Date(selectedUserForProfile.created_at || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </div>
              {(liveProfile.bio || selectedUserForProfile.bio) && (
                <div className="pt-4 border-t border-white/5">
                  <span className="text-white/20 uppercase font-black text-[9px] tracking-[0.2em] block mb-2">Neural Bio-Data</span>
                  <p className="text-white/50 text-[12px] leading-relaxed italic">"{liveProfile.bio || selectedUserForProfile.bio}"</p>
                </div>
              )}
            </div>

            {/* Action Matrix */}
            {selectedUserForProfile.id !== me?.id ? (
              friends.some(f => f.id === selectedUserForProfile.id) ? (
                <button disabled className="w-full py-4 bg-green-500/10 text-green-400 border border-green-500/20 rounded-xl text-xs font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2">
                  <ShieldCheck size={14} /> Protocol Linked
                </button>
              ) : outgoingIds.has(selectedUserForProfile.id) ? (
                 <button disabled className="w-full py-4 bg-indigo-500/10 text-indigo-400/50 border border-indigo-500/20 rounded-xl text-xs font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2">
                  <Loader2 size={14} className="animate-spin" /> Uplink Pending
                </button>
              ) : incomingIds.has(selectedUserForProfile.id) ? (
                 <button 
                   onClick={() => { acceptFriendReq(selectedUserForProfile.id); setSelectedUserForProfile(null); }}
                   className="w-full py-4 bg-amber-500 hover:bg-amber-400 text-[#0a0a0c] rounded-xl text-xs font-black uppercase tracking-[0.2em] transition-all shadow-lg active:scale-[0.98]"
                 >
                  Finalize Uplink
                </button>
              ) : (
                <button 
                  onClick={() => { sendFriendReq(selectedUserForProfile.id); setSelectedUserForProfile(null); }}
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-[0.3em] transition-all shadow-lg shadow-indigo-600/20 active:scale-[0.98]"
                >
                  Transmit Ping
                </button>
              )
            ) : (
              <button disabled className="w-full py-4 bg-white/10 text-white/50 border border-white/10 rounded-xl text-xs font-black uppercase tracking-[0.2em]">
                Identity Authenticated
              </button>
            )}
          </div>
        </div>
        );
      })()}

      <style>{`
        .discord-scrollbar::-webkit-scrollbar { width: 6px; }
        .discord-scrollbar::-webkit-scrollbar-track { background: transparent; margin: 4px 0; }
        .discord-scrollbar::-webkit-scrollbar-thumb { background: ${theme === 'vibrant' ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)'}; border-radius: 3px; }
        .discord-scrollbar::-webkit-scrollbar-thumb:hover { background: ${theme === 'vibrant' ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)'}; }

        /* Mobile PWA optimizations */
        * { -webkit-tap-highlight-color: transparent; }
        html, body { 
          height: 100%; 
          margin: 0; 
          padding: 0;
          background: #000;
          overflow: auto;
        }
        #root { height: 100%; width: 100%; }
        .discord-scrollbar { -webkit-overflow-scrolling: touch; }
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
