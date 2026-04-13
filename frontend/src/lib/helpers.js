// Discord-style timestamp formatting
export const formatDiscordTime = (timestamp) => {
  const d = new Date(timestamp);
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `Today at ${time}`;
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `Yesterday at ${time}`;
  return `${d.toLocaleDateString()} ${time}`;
};

export const formatDateSeparator = (ts) =>
  new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

// Group consecutive messages from same sender within 5 min
export const groupMessages = (messages) => {
  const groups = [];
  let cur = null;
  for (const msg of messages) {
    const t = new Date(msg.timestamp).getTime();
    if (isNaN(t)) {
        // Fallback for real-time messages that might have slightly different timestamp formats
        const same = cur?.senderId === msg.senderId;
        if (same) { cur.messages.push(msg); continue; }
    }
    const same = cur?.senderId === msg.senderId;
    const near = cur && (t - cur.lastTime) < 5 * 60 * 1000;
    const sameDay = cur && new Date(cur.lastTime).toDateString() === new Date(t).toDateString();
    if (same && near && sameDay) {
      cur.messages.push(msg);
      cur.lastTime = t;
    } else {
      cur = { senderId: msg.senderId, senderUsername: msg.senderUsername, messages: [msg], firstTime: isNaN(t) ? Date.now() : t, lastTime: isNaN(t) ? Date.now() : t, newDay: !cur || !sameDay };
      groups.push(cur);
    }
  }
  return groups;
};
