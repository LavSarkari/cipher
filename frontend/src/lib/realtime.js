import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from './supabase';

const PRESENCE_ROOM = 'global_presence';

// Hook to track online users globally
export const usePresence = (me) => {
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const channelRef = useRef(null);
  
  useEffect(() => {
    if (!me?.id) return;
    
    // Create a global room for presence
    const channel = supabase.channel(PRESENCE_ROOM, {
      config: { presence: { key: me.id } }
    });
    
    channelRef.current = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const online = new Set(Object.keys(state));
        setOnlineUsers(online);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ online_at: new Date().toISOString(), username: me.username });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [me?.id]);

  return onlineUsers;
};

// Hook to track typing in a specific chat
export const useTypingIndicator = (chatId, me) => {
  const [typingUsers, setTypingUsers] = useState(new Set());
  const channelRef = useRef(null);
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (!chatId || !me?.id) return;

    setTypingUsers(new Set());
    
    // Create a chat-specific room for typing broadcasts
    const channel = supabase.channel(`typing:${chatId}`);
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (payload.payload.userId === me.id) return; // ignore self
        
        setTypingUsers(prev => {
          const next = new Set(prev);
          if (payload.payload.isTyping) {
            next.add(payload.payload.username);
          } else {
            next.delete(payload.payload.username);
          }
          return next;
        });

        // Auto clear after 5s if we miss the stop event
        if (payload.payload.isTyping) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = setTimeout(() => {
            setTypingUsers(prev => {
              const next = new Set(prev);
              next.delete(payload.payload.username);
              return next;
            });
          }, 5000);
        }
      })
      .subscribe();

    return () => {
      clearTimeout(timeoutRef.current);
      supabase.removeChannel(channel);
    };
  }, [chatId, me?.id]);

  const lastTypingEventTime = useRef(0);
  const typingStateRef = useRef(false);

  const sendTypingEvent = useCallback((isTyping) => {
    if (!channelRef.current || !me?.id) return;
    
    const now = Date.now();
    if (typingStateRef.current !== isTyping || (isTyping && now - lastTypingEventTime.current > 2500)) {
      typingStateRef.current = isTyping;
      lastTypingEventTime.current = now;
      channelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId: me.id, username: me.username, isTyping }
      }).catch(err => {
        console.warn("Failed to send typing event", err);
      });
    }
  }, [me?.id, me?.username]);

  return { typingUsers: Array.from(typingUsers), sendTypingEvent };
};

/**
 * Hook to listen for new messages in real-time
 */
export const useMessageListener = (chatOrGroupId, isGroup = false, onMessage) => {
  useEffect(() => {
    if (!chatOrGroupId) return;

    const channel = supabase.channel(`msg_events:${chatOrGroupId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: isGroup ? 'group_messages' : 'messages',
          filter: isGroup ? `group_id=eq.${chatOrGroupId}` : `chat_id=eq.${chatOrGroupId}`
        },
        (payload) => {
          onMessage(payload);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatOrGroupId, isGroup, onMessage]);
};

/**
 * Hook to listen for any changes on a table for the current user
 */
export const useTableListener = (table, filterField, filterValue, onChange) => {
  useEffect(() => {
    if (!filterValue) return;

    const channel = supabase.channel(`table_events:${table}:${filterField}:${filterValue}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: table,
          filter: `${filterField}=eq.${filterValue}`
        },
        () => {
          onChange();
        }
      )
      // Special case: for friendships and requests, we often need to listen to the other side too
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, filterField, filterValue, onChange]);
};

