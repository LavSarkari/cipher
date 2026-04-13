import express from "express";
import { db } from "../db.js";
import { requireAuth, requireCsrf } from "../middleware.js";

const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  const { data, error } = await db
    .from("friendships")
    .select(`
      created_at,
      u:friend_id (id, username)
    `)
    .eq("user_id", req.user.sub)
    .order("u(username)");

  if (error) {
    return res.status(500).json({ error: "Failed to fetch friends." });
  }

  const friends = (data || []).map((row) => ({
    id: row.u.id,
    username: row.u.username,
    created_at: row.created_at
  }));

  return res.json({ friends });
});

router.post("/:targetId", requireAuth, requireCsrf, (req, res) => {
  return res
    .status(410)
    .json({ error: "Direct add is disabled. Use /api/friend-requests flow." });
});

router.delete("/:targetId", requireAuth, requireCsrf, async (req, res) => {
  const me = req.user.sub;
  const { targetId } = req.params;

  if (!targetId || targetId === me) {
    return res.status(400).json({ error: "Invalid target user." });
  }

  // Delete from friendships (both directions) and friend_requests
  const { error: err1 } = await db
    .from("friendships")
    .delete()
    .or(`user_id.eq.${me},friend_id.eq.${me}`)
    .or(`user_id.eq.${targetId},friend_id.eq.${targetId}`);

  const { error: err2 } = await db
    .from("friend_requests")
    .delete()
    .or(`from_user_id.eq.${me},to_user_id.eq.${me}`)
    .or(`from_user_id.eq.${targetId},to_user_id.eq.${targetId}`);

  if (err1 || err2) {
    return res.status(500).json({ error: "Failed to remove friend." });
  }

  return res.json({ ok: true });
});

export default router;
