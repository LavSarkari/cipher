const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000/api";

let csrfToken = "";

const request = async (path, options = {}) => {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (csrfToken && ["POST", "PUT", "PATCH", "DELETE"].includes((options.method || "GET").toUpperCase())) {
    headers["x-csrf-token"] = csrfToken;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include"
  });

  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Request failed");
  }

  if (data.csrfToken) csrfToken = data.csrfToken;
  return data;
};

export const api = {
  getCsrf: () => request("/auth/csrf"),
  register: (payload) => request("/auth/register", { method: "POST", body: JSON.stringify(payload) }),
  login: (payload) => request("/auth/login", { method: "POST", body: JSON.stringify(payload) }),
  me: () => request("/auth/me"),
  logout: () => request("/auth/logout", { method: "POST" }),
  users: (search) => request(`/users${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  friends: () => request("/friends"),
  removeFriend: (targetId) => request(`/friends/${targetId}`, { method: "DELETE" }),
  friendRequests: () => request("/friend-requests"),
  sendFriendRequest: (targetId) => request(`/friend-requests/${targetId}`, { method: "POST" }),
  unsendFriendRequest: (targetId) => request(`/friend-requests/${targetId}`, { method: "DELETE" }),
  acceptFriendRequest: (fromUserId) =>
    request(`/friend-requests/${fromUserId}/accept`, { method: "POST" }),
  rejectFriendRequest: (fromUserId) =>
    request(`/friend-requests/${fromUserId}/reject`, { method: "POST" }),
  myGroups: () => request("/groups/mine"),
  createGroup: (payload) => request("/groups", { method: "POST", body: JSON.stringify(payload) }),
  leaveGroup: (groupId) => request(`/groups/${groupId}/leave`, { method: "DELETE" }),
  groupFriendOptions: (groupId) => request(`/groups/${groupId}/friend-options`),
  addFriendToGroup: (groupId, friendId) =>
    request(`/groups/${groupId}/add-friend/${friendId}`, { method: "POST" }),
  groupMessages: (groupId, before) =>
    request(`/groups/${groupId}/messages${before ? `?before=${before}` : ""}`),
  sendGroupMessage: (groupId, payload) =>
    request(`/groups/${groupId}/messages`, { method: "POST", body: JSON.stringify(payload) }),
  messages: (peerId, before) =>
    request(`/chats/${peerId}/messages${before ? `?before=${before}` : ""}`),
  sendMessage: (peerId, payload) =>
    request(`/chats/${peerId}/messages`, { method: "POST", body: JSON.stringify(payload) })
};
