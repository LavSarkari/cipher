import { supabase } from './supabase';

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
    let query = supabase.from('users').select('id, username');
    if (search) query = query.ilike('username', `%${search}%`);
    const { data, error } = await query.limit(40);
    if (error) throw error;
    return { users: data || [] };
  },

  friends: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { friends: [] };

    // Query both directions to handle partial inserts
    const [asUser, asFriend] = await Promise.all([
      supabase.from('friendships').select('friend_id, u:friend_id(username)').eq('user_id', user.id),
      supabase.from('friendships').select('user_id, u:user_id(username)').eq('friend_id', user.id)
    ]);

    const friendMap = new Map();
    (asUser.data || []).forEach(f => friendMap.set(f.friend_id, f.u?.username || 'Unknown Node'));
    (asFriend.data || []).forEach(f => friendMap.set(f.user_id, f.u?.username || 'Unknown Node'));

    return {
      friends: Array.from(friendMap.entries()).map(([id, username]) => ({ id, username }))
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
      supabase.from('friend_requests').select('from_user_id, created_at, u:from_user_id(username)').eq('to_user_id', user.id),
      supabase.from('friend_requests').select('to_user_id, created_at, u:to_user_id(username)').eq('from_user_id', user.id)
    ]);

    return {
      incoming: (incoming.data || []).map(r => ({
        fromUserId: r.from_user_id,
        username: r.u?.username || 'Unknown',
        createdAt: r.created_at
      })),
      outgoing: (outgoing.data || []).map(r => ({
        toUserId: r.to_user_id,
        username: r.u?.username || 'Unknown',
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
    const { data, error } = await supabase.from('messages')
      .select('*, u1:sender_id(username), u2:reply_to_id(ciphertext, iv, sender_id(username))')
      .eq('chat_id', chatId).order('created_at', { ascending: true });
    if (error) throw error;
    return { messages: (data || []).map(m => ({ 
      ...m, timestamp: m.created_at, senderId: m.sender_id, receiverId: m.receiver_id,
      replyTo: m.u2 ? { ciphertext: m.u2.ciphertext, iv: m.u2.iv, senderUsername: m.u2.sender_id?.username } : null
    }))};
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
    return { message: { ...msg, timestamp: new Date().toISOString(), senderId: msg.sender_id, receiverId: msg.receiver_id, reactions: {} } };
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

  groupMessages: async (groupId) => {
    const { data, error } = await supabase.from('group_messages')
      .select('*, u:sender_id(username), u2:reply_to_id(ciphertext, iv, sender_id(username))')
      .eq('group_id', groupId).order('created_at', { ascending: true });
    if (error) throw error;
    return { messages: (data || []).map(m => ({ 
      ...m, senderUsername: m.u?.username || 'Unknown', timestamp: m.created_at, senderId: m.sender_id,
      replyTo: m.u2 ? { ciphertext: m.u2.ciphertext, iv: m.u2.iv, senderUsername: m.u2.sender_id?.username } : null
    }))};
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
    return { message: { ...msg, timestamp: new Date().toISOString(), senderId: msg.sender_id, reactions: {} } };
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
  }
};
