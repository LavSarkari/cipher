import { supabase } from './supabase';
import { saveMessages, getCachedMessages } from './db';

/**
 * Robust Supabase API layer.
 * Includes defensive checks to prevent crashes when data is partially synced.
 */

export const api = {
  getCsrf: async () => ({ csrfToken: "supabase_managed" }),

  register: async ({ username, password }) => {
    const email = `${username.toLowerCase()}@vault.id`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } }
    });
    if (error) throw error;
    return { user: { id: data.user?.id, username } };
  },

  login: async ({ username, password }) => {
    const email = `${username.toLowerCase()}@vault.id`;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return { user: { id: data.user?.id, username: username } };
  },

  me: async () => {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) throw new Error("Not authenticated");
    
    let { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile) {
      // Self-healing: Create profile if missing (helps with database migrations)
      const username = user.user_metadata?.username || user.email?.split('@')[0] || 'user_' + user.id.slice(0, 5);
      const { data: newProfile, error: insError } = await supabase
        .from('users')
        .insert({ id: user.id, username })
        .select()
        .single();
      
      if (!insError) profile = newProfile;
    }

    return { user: profile || { id: user.id, username: user.email?.split('@')[0] || 'unknown' } };
  },

  logout: async () => {
    await supabase.auth.signOut();
  },
  users: async (search) => {
    let query = supabase.from('users').select('id, username, display_name, avatar_id, bio, status, created_at');
    if (search) query = query.ilike('username', `%${search}%`).or(`display_name.ilike.%${search}%`);
    const { data, error } = await query.limit(40);
    if (error) throw error;
    return { users: data || [] };
  },
  friends: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { friends: [] };

    // Query both directions to handle partial inserts
    const [asUser, asFriend] = await Promise.all([
      supabase.from('friendships').select('friend_id, u:friend_id(username, display_name, avatar_id, bio, status, created_at)').eq('user_id', user.id),
      supabase.from('friendships').select('user_id, u:user_id(username, display_name, avatar_id, bio, status, created_at)').eq('friend_id', user.id)
    ]);

    const friendMap = new Map();
    (asUser.data || []).forEach(f => {
      if (f.u) friendMap.set(f.friend_id, { id: f.friend_id, ...f.u });
    });
    (asFriend.data || []).forEach(f => {
      if (f.u) friendMap.set(f.user_id, { id: f.user_id, ...f.u });
    });

    return {
      friends: Array.from(friendMap.values())
    };
  },

  removeFriend: async (targetId) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from('friendships')
      .delete()
      .or(`and(user_id.eq.${user.id},friend_id.eq.${targetId}),and(user_id.eq.${targetId},friend_id.eq.${user.id})`);
    return { ok: true };
  },

  friendRequests: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { incoming: [], outgoing: [] };
    
    const [incoming, outgoing] = await Promise.all([
      supabase.from('friend_requests').select('from_user_id, created_at, u:from_user_id(username, display_name, avatar_id)').eq('to_user_id', user.id),
      supabase.from('friend_requests').select('to_user_id, created_at, u:to_user_id(username, display_name, avatar_id)').eq('from_user_id', user.id)
    ]);

    return {
      incoming: (incoming.data || []).map(r => ({
        fromUserId: r.from_user_id,
        username: r.u?.username || 'Unknown',
        display_name: r.u?.display_name,
        avatar_id: r.u?.avatar_id,
        createdAt: r.created_at
      })),
      outgoing: (outgoing.data || []).map(r => ({
        toUserId: r.to_user_id,
        username: r.u?.username || 'Unknown',
        display_name: r.u?.display_name,
        avatar_id: r.u?.avatar_id,
        createdAt: r.created_at
      }))
    };
  },

  sendFriendRequest: async (targetId) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Session expired");
    const { error } = await supabase.from('friend_requests').insert({
      from_user_id: user.id,
      to_user_id: targetId
    });
    if (error) throw error;
    return { ok: true };
  },

  unsendFriendRequest: async (targetId) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('friend_requests').delete().eq('from_user_id', user.id).eq('to_user_id', targetId);
    return { ok: true };
  },

  acceptFriendRequest: async (fromUserId) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    // Use server-side function to insert both friendship directions
    const { error } = await supabase.rpc('accept_friend_request', { requester_id: fromUserId });
    if (error) throw error;
    return { ok: true };
  },

  rejectFriendRequest: async (fromUserId) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('friend_requests').delete().eq('from_user_id', fromUserId).eq('to_user_id', user.id);
    return { ok: true };
  },

  myGroups: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { groups: [] };
    const { data, error } = await supabase
      .from('group_members')
      .select('group_id, g:group_id(name)')
      .eq('user_id', user.id);
    
    if (error) throw error;
    return { groups: (data || []).filter(d => d.g).map(d => ({ id: d.group_id, name: d.g.name })) };
  },

  createGroup: async ({ name }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Session expired");
    const groupId = crypto.randomUUID();
    
    const { error: gError } = await supabase.from('groups').insert({
      id: groupId,
      name,
      creator_id: user.id
    });
    if (gError) throw gError;

    await supabase.from('group_members').insert({
      group_id: groupId,
      user_id: user.id
    });

    return { ok: true };
  },

  messages: async (peerId) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { messages: [] };
    const chatId = [user.id, peerId].sort().join(':');
    
    // 1. Get from local cache
    const cached = await getCachedMessages(chatId, false);
    const lastTimestamp = cached.length > 0 ? cached[cached.length - 1].created_at : '1970-01-01T00:00:00Z';

    // 2. Fetch only new ones from Supabase
    const { data, error } = await supabase.from('messages')
      .select('*, u1:sender_id(username, display_name, avatar_id), u2:reply_to_id(ciphertext, iv, sender_id(username, display_name, avatar_id))')
      .eq('chat_id', chatId)
      .gt('created_at', lastTimestamp)
      .order('created_at', { ascending: true });
    
    if (error) throw error;

    if (data && data.length > 0) {
      const fresh = data.map(m => ({ 
        ...m, timestamp: m.created_at, senderId: m.sender_id, receiverId: m.receiver_id,
        replyTo: m.u2 ? { ciphertext: m.u2.ciphertext, iv: m.u2.iv, senderUsername: m.u2.sender_id?.username } : null
      }));
      await saveMessages(fresh);
      const all = [...cached, ...fresh];
      const unique = Array.from(new Map(all.map(m => [m.id, m])).values());
      return { messages: unique };
    }

    return { messages: cached };
  },

  sendMessage: async (peerId, payload, replyToId = null) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Session expired");
    const chatId = [user.id, peerId].sort().join(':');
    const msg = {
      id: crypto.randomUUID(),
      chat_id: chatId,
      sender_id: user.id,
      receiver_id: peerId,
      ciphertext: payload.ciphertext,
      iv: payload.iv,
      reply_to_id: replyToId
    };
    const { error } = await supabase.from('messages').insert(msg);
    if (error) throw error;
    const finalMsg = { ...msg, created_at: new Date().toISOString(), timestamp: new Date().toISOString(), senderId: msg.sender_id, receiverId: msg.receiver_id, reactions: {} };
    await saveMessages([finalMsg]);
    return { message: finalMsg };
  },

  editMessage: async (msgId, payload) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Session expired");
    const { error } = await supabase.from('messages')
      .update({ ciphertext: payload.ciphertext, iv: payload.iv, edited_at: new Date().toISOString() })
      .eq('id', msgId).eq('sender_id', user.id);
    if (error) throw error;
    return { ok: true };
  },

  reactToMessage: async (msgId, reactionsJson) => {
    // Only logged in users can see/update, handled by RLS
    const { error } = await supabase.from('messages').update({ reactions: reactionsJson }).eq('id', msgId);
    if (error) throw error;
    return { ok: true };
  },

  // ─── Media API ───

  uploadMedia: async (encryptedBlob, fileName) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Session expired");
    const path = `${user.id}/${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { data, error } = await supabase.storage
      .from('cipher-media')
      .upload(path, encryptedBlob, { contentType: 'application/octet-stream', upsert: false });
    if (error) throw error;
    return { path: data.path };
  },

  downloadMedia: async (path) => {
    const { data, error } = await supabase.storage.from('cipher-media').download(path);
    if (error) throw error;
    return data; // Returns a Blob
  },

  deleteMedia: async (path) => {
    const { error } = await supabase.storage.from('cipher-media').remove([path]);
    if (error) console.warn('[Media] Delete failed:', error);
  },

  sendMediaMessage: async (peerId, payload, mediaInfo, replyToId = null) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Session expired");
    const chatId = [user.id, peerId].sort().join(':');
    const msg = {
      id: crypto.randomUUID(),
      chat_id: chatId,
      sender_id: user.id,
      receiver_id: peerId,
      ciphertext: payload.ciphertext || '',
      iv: payload.iv || '',
      reply_to_id: replyToId,
      type: mediaInfo.type,           // 'image', 'gif', 'sticker'
      media_url: mediaInfo.media_url,  // Storage path or external URL
      media_meta: mediaInfo.media_meta || {},
      ephemeral: mediaInfo.ephemeral || false
    };
    const { error } = await supabase.from('messages').insert(msg);
    if (error) throw error;
    const finalMsg = { ...msg, created_at: new Date().toISOString(), timestamp: new Date().toISOString(), senderId: msg.sender_id, receiverId: msg.receiver_id, reactions: {} };
    await saveMessages([finalMsg]);
    return { message: finalMsg };
  },

  sendGroupMediaMessage: async (groupId, payload, mediaInfo, replyToId = null) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Session expired");
    const msg = {
      id: crypto.randomUUID(),
      group_id: groupId,
      sender_id: user.id,
      ciphertext: payload.ciphertext || '',
      iv: payload.iv || '',
      reply_to_id: replyToId,
      type: mediaInfo.type,
      media_url: mediaInfo.media_url,
      media_meta: mediaInfo.media_meta || {},
      ephemeral: mediaInfo.ephemeral || false
    };
    const { error } = await supabase.from('group_messages').insert(msg);
    if (error) throw error;
    const finalMsg = { ...msg, created_at: new Date().toISOString(), timestamp: new Date().toISOString(), senderId: msg.sender_id, reactions: {} };
    await saveMessages([finalMsg]);
    return { message: finalMsg };
  },

  markEphemeralViewed: async (msgId, isGroup = false) => {
    const table = isGroup ? 'group_messages' : 'messages';
    const { error } = await supabase.from(table)
      .update({ viewed_at: new Date().toISOString() })
      .eq('id', msgId);
    if (error) console.warn('[Media] Ephemeral mark failed:', error);
    return { ok: true };
  },

  groupMessages: async (groupId) => {
    // 1. Get from local cache
    const cached = await getCachedMessages(groupId, true);
    const lastTimestamp = cached.length > 0 ? cached[cached.length - 1].created_at : '1970-01-01T00:00:00Z';

    // 2. Fetch new ones
    const { data, error } = await supabase.from('group_messages')
      .select('*, u:sender_id(username, display_name, avatar_id), u2:reply_to_id(ciphertext, iv, sender_id(username, display_name, avatar_id))')
      .eq('group_id', groupId)
      .gt('created_at', lastTimestamp)
      .order('created_at', { ascending: true });
    
    if (error) throw error;

    if (data && data.length > 0) {
      const fresh = data.map(m => ({ 
        ...m, 
        senderUsername: m.u?.username || 'Unknown', 
        senderDisplayName: m.u?.display_name,
        senderAvatarId: m.u?.avatar_id,
        timestamp: m.created_at, senderId: m.sender_id,
        replyTo: m.u2 ? { ciphertext: m.u2.ciphertext, iv: m.u2.iv, senderUsername: m.u2.sender_id?.username, senderDisplayName: m.u2.sender_id?.display_name } : null
      }));
      await saveMessages(fresh);
      const all = [...cached, ...fresh];
      const unique = Array.from(new Map(all.map(m => [m.id, m])).values());
      return { messages: unique };
    }

    return { messages: cached };
  },

  sendGroupMessage: async (groupId, payload, replyToId = null) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Session expired");
    const msg = {
      id: crypto.randomUUID(),
      group_id: groupId,
      sender_id: user.id,
      ciphertext: payload.ciphertext,
      iv: payload.iv,
      reply_to_id: replyToId
    };
    const { error } = await supabase.from('group_messages').insert(msg);
    if (error) throw error;
    const finalMsg = { ...msg, created_at: new Date().toISOString(), timestamp: new Date().toISOString(), senderId: msg.sender_id, reactions: {} };
    await saveMessages([finalMsg]);
    return { message: finalMsg };
  },

  editGroupMessage: async (msgId, payload) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Session expired");
    const { error } = await supabase.from('group_messages')
      .update({ ciphertext: payload.ciphertext, iv: payload.iv, edited_at: new Date().toISOString() })
      .eq('id', msgId).eq('sender_id', user.id);
    if (error) throw error;
    return { ok: true };
  },

  reactToGroupMessage: async (msgId, reactionsJson) => {
    const { error } = await supabase.from('group_messages').update({ reactions: reactionsJson }).eq('id', msgId);
    if (error) throw error;
    return { ok: true };
  },

  groupFriendOptions: async (groupId) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { friends: [] };
    const { friends } = await api.friends();
    const { data: members, error } = await supabase.from('group_members').select('user_id').eq('group_id', groupId);
    if (error) throw error;
    const memberIds = new Set(members.map(m => m.user_id));
    return { friends: friends.filter(f => f.id !== 'ai-999' && !memberIds.has(f.id)) };
  },

  addFriendToGroup: async (groupId, userId) => {
    const { error } = await supabase.from('group_members').insert({ group_id: groupId, user_id: userId });
    if (error) throw error;
    return { ok: true };
  },

  leaveGroup: async (groupId) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', user.id);
    if (error) throw error;
    return { ok: true };
  }
};
