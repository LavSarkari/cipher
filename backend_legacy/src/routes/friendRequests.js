import express from "express";
import { db } from "../db.js";
import { requireAuth, requireCsrf } from "../middleware.js";

const router = express.Router();

const isFriend = async (a, b) => {
  const { data, error } = await db
    .from("friendships")
    .select("1")
    .eq("user_id", a)
    .eq("friend_id", b)
    .maybeSingle();
  return Boolean(data) && !error;
};

router.get("/", requireAuth, async (req, res) => {
  const me = req.user.sub;

  const { data: incomingData, error: inError } = await db
    .from("friend_requests")
    .select(`
      from_user_id,
      created_at,
      u:from_user_id (username)
    `)
    .eq("to_user_id", me);

  const { data: outgoingData, error: outError } = await db
    .from("friend_requests")
    .select(`
      to_user_id,
      created_at,
      u:to_user_id (username)
    `)
    .eq("from_user_id", me);

  if (inError || outError) {
    return res.status(500).json({ error: "Failed to fetch friend requests." });
  }

  const incoming = (incomingData || []).map((fr) => ({
    fromUserId: fr.from_user_id,
    username: fr.u.username,
    createdAt: fr.created_at
  }));

  const outgoing = (outgoingData || []).map((fr) => ({
    toUserId: fr.to_user_id,
    username: fr.u.username,
    createdAt: fr.created_at
  }));

  return res.json({ incoming, outgoing });
});

router.post("/:targetId", requireAuth, requireCsrf, async (req, res) => {
  const me = req.user.sub;
  const { targetId } = req.params;

  if (!targetId || targetId === me) {
    return res.status(400).json({ error: "Invalid target user." });
  }

  const { data: target, error: targetError } = await db
    .from("users")
    .select("id")
    .eq("id", targetId)
    .maybeSingle();

  if (targetError || !target) {
    return res.status(404).json({ error: "User not found." });
  }

  if (await isFriend(me, targetId)) {
    return res.status(409).json({ error: "Already connected." });
  }

  const { data: outgoingExists } = await db
    .from("friend_requests")
    .select("1")
    .eq("from_user_id", me)
    .eq("to_user_id", targetId)
    .maybeSingle();

  if (outgoingExists) {
    return res.status(200).json({ ok: true, pending: true });
  }

  const { data: incomingExists } = await db
    .from("friend_requests")
    .select("1")
    .eq("from_user_id", targetId)
    .eq("to_user_id", me)
    .maybeSingle();

  if (incomingExists) {
    return res.status(409).json({ error: "Incoming friend request already exists." });
  }

  const { error: insertError } = await db
    .from("friend_requests")
    .insert({ from_user_id: me, to_user_id: targetId, created_at: Date.now() });

  if (insertError) {
    return res.status(500).json({ error: "Failed to send request." });
  }

  return res.status(201).json({ ok: true, pending: true });
});

router.delete("/:targetId", requireAuth, requireCsrf, async (req, res) => {
  const me = req.user.sub;
  const { targetId } = req.params;

  if (!targetId || targetId === me) {
    return res.status(400).json({ error: "Invalid target user." });
  }

  const { error } = await db
    .from("friend_requests")
    .delete()
    .eq("from_user_id", me)
    .eq("to_user_id", targetId);

  if (error) {
    return res.status(500).json({ error: "Failed to delete request." });
  }

  return res.json({ ok: true });
});

router.post("/:fromUserId/accept", requireAuth, requireCsrf, async (req, res) => {
  const me = req.user.sub;
  const { fromUserId } = req.params;

  const { data: requestExists } = await db
    .from("friend_requests")
    .select("1")
    .eq("from_user_id", fromUserId)
    .eq("to_user_id", me)
    .maybeSingle();

  if (!requestExists) {
    return res.status(404).json({ error: "Request not found." });
  }

  const now = Date.now();
  // Delete requests and insert friendships
  await db.from("friend_requests").delete().or(`from_user_id.eq.${fromUserId},to_user_id.eq.${fromUserId}`).or(`from_user_id.eq.${me},to_user_id.eq.${me}`);
  
  await db.from("friendships").upsert([
    { user_id: me, friend_id: fromUserId, created_at: now },
    { user_id: fromUserId, friend_id: me, created_at: now }
  ]);

  return res.json({ ok: true });
});

router.post("/:fromUserId/reject", requireAuth, requireCsrf, async (req, res) => {
  const me = req.user.sub;
  const { fromUserId } = req.params;
  
  const { error } = await db
    .from("friend_requests")
    .delete()
    .eq("from_user_id", fromUserId)
    .eq("to_user_id", me);

  if (error) {
    return res.status(500).json({ error: "Failed to reject request." });
  }

  return res.json({ ok: true });
});

export default router;
