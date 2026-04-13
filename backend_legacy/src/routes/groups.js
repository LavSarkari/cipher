import express from "express";
import { db } from "../db.js";
import { requireAuth, requireCsrf } from "../middleware.js";
import { generateId } from "../security.js";

const router = express.Router();

const isMember = async (groupId, userId) => {
  const { data, error } = await db
    .from("group_members")
    .select("1")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data) && !error;
};

const isFriend = async (a, b) => {
  const { data, error } = await db
    .from("friendships")
    .select("1")
    .eq("user_id", a)
    .eq("friend_id", b)
    .maybeSingle();
  return Boolean(data) && !error;
};

router.get("/mine", requireAuth, async (req, res) => {
  const { data, error } = await db
    .from("group_members")
    .select(`
      groups (id, name, creator_id, created_at)
    `)
    .eq("user_id", req.user.sub)
    .order("groups(created_at)", { ascending: false });

  if (error) {
    return res.status(500).json({ error: "Failed to fetch groups." });
  }

  const groups = (data || []).map((row) => ({
    id: row.groups.id,
    name: row.groups.name,
    creatorId: row.groups.creator_id,
    createdAt: row.groups.created_at
  }));

  return res.json({ groups });
});


router.get("/:groupId/friend-options", requireAuth, async (req, res) => {
  const me = req.user.sub;
  const { groupId } = req.params;
  
  if (!(await isMember(groupId, me))) {
    return res.status(403).json({ error: "Group access denied." });
  }

  // Find friends who are NOT in the group
  const { data, error } = await db
    .from("friendships")
    .select(`
      u:friend_id (id, username)
    `)
    .eq("user_id", me)
    .neq("friend_id", "ai-999");

  if (error) {
    return res.status(500).json({ error: "Failed to fetch friends." });
  }

  // Get current members to filter them out
  const { data: members, error: memError } = await db
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId);

  if (memError) {
    return res.status(500).json({ error: "Failed to fetch group members." });
  }

  const memberIds = new Set((members || []).map(m => m.user_id));
  const friends = (data || [])
    .filter(f => !memberIds.has(f.u.id))
    .map(f => ({ id: f.u.id, username: f.u.username }))
    .sort((a, b) => a.username.localeCompare(b.username));

  return res.json({ friends });
});

router.post("/", requireAuth, requireCsrf, async (req, res) => {
  const me = req.user.sub;
  const name = (req.body?.name || "").toString().trim();
  if (!name || name.length < 2 || name.length > 40) {
    return res.status(400).json({ error: "Group name must be 2-40 characters." });
  }

  const now = Date.now();
  const group = {
    id: generateId("grp"),
    name,
    creator_id: me,
    created_at: now
  };

  const { error: groupError } = await db.from("groups").insert(group);
  if (groupError) {
    return res.status(500).json({ error: "Failed to create group." });
  }

  const { error: memberError } = await db
    .from("group_members")
    .insert({ group_id: group.id, user_id: me, joined_at: now });
  
  if (memberError) {
    return res.status(500).json({ error: "Failed to add creator as member." });
  }

  return res.status(201).json({ group: { 
    id: group.id, 
    name: group.name, 
    creatorId: group.creator_id, 
    createdAt: group.created_at 
  } });
});

router.delete("/:groupId/leave", requireAuth, requireCsrf, async (req, res) => {
  const me = req.user.sub;
  const { groupId } = req.params;
  if (!(await isMember(groupId, me))) {
    return res.status(404).json({ error: "Group membership not found." });
  }

  const { error: err1 } = await db
    .from("group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", me);

  if (err1) {
    return res.status(500).json({ error: "Failed to leave group." });
  }

  return res.json({ ok: true });
});

router.post("/:groupId/add-friend/:friendId", requireAuth, requireCsrf, async (req, res) => {
  const me = req.user.sub;
  const { groupId, friendId } = req.params;
  if (!friendId || friendId === me) {
    return res.status(400).json({ error: "Invalid friend id." });
  }
  if (!(await isMember(groupId, me))) {
    return res.status(403).json({ error: "Only group members can add friends." });
  }
  if (!(await isFriend(me, friendId))) {
    return res.status(403).json({ error: "You can only add your friends." });
  }

  const { data: user, error: userError } = await db
    .from("users")
    .select("id, username")
    .eq("id", friendId)
    .maybeSingle();

  if (userError || !user) {
    return res.status(404).json({ error: "Friend not found." });
  }

  const { error: insertError } = await db
    .from("group_members")
    .upsert({ group_id: groupId, user_id: friendId, joined_at: Date.now() });

  if (insertError) {
    return res.status(500).json({ error: "Failed to add friend to group." });
  }

  return res.json({ ok: true, added: { id: user.id, username: user.username } });
});


router.get("/:groupId/messages", requireAuth, async (req, res) => {
  const me = req.user.sub;
  const { groupId } = req.params;
  if (!(await isMember(groupId, me))) {
    return res.status(403).json({ error: "Group chat access denied." });
  }

  const before = Number(req.query.before || Date.now());
  const { data: messages, error } = await db
    .from("group_messages")
    .select(`
      id,
      sender_id,
      ciphertext,
      iv,
      alg,
      created_at,
      u:sender_id (username)
    `)
    .eq("group_id", groupId)
    .lt("created_at", before)
    .order("created_at", { ascending: false })
    .limit(120);

  if (error) {
    return res.status(500).json({ error: "Failed to fetch messages." });
  }

  const formatted = (messages || [])
    .map((m) => ({
      id: m.id,
      senderId: m.sender_id,
      senderUsername: m.u.username,
      ciphertext: m.ciphertext,
      iv: m.iv,
      alg: m.alg,
      timestamp: m.created_at
    }))
    .reverse();

  return res.json({ messages: formatted });
});

router.post("/:groupId/messages", requireAuth, requireCsrf, async (req, res) => {
  const me = req.user.sub;
  const { groupId } = req.params;
  if (!(await isMember(groupId, me))) {
    return res.status(403).json({ error: "Cannot send to this group." });
  }

  const ciphertext = (req.body?.ciphertext || "").toString();
  const iv = (req.body?.iv || "").toString();
  if (!ciphertext || !iv || ciphertext.length > 12000 || iv.length > 128) {
    return res.status(400).json({ error: "Invalid encrypted payload." });
  }

  const message = {
    id: generateId("gmsg"),
    group_id: groupId,
    sender_id: me,
    ciphertext,
    iv,
    alg: "AES-GCM-256",
    created_at: Date.now()
  };

  const { error } = await db.from("group_messages").insert(message);

  if (error) {
    return res.status(500).json({ error: "Failed to send group message." });
  }

  return res.status(201).json({ 
    message: {
      id: message.id,
      groupId: message.group_id,
      senderId: message.sender_id,
      ciphertext: message.ciphertext,
      iv: message.iv,
      alg: message.alg,
      timestamp: message.created_at
    } 
  });
});

export default router;
