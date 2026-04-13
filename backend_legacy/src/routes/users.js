import express from "express";
import { db } from "../db.js";
import { requireAuth } from "../middleware.js";

const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  const search = (req.query.search || "").toString().trim().toLowerCase();
  const me = req.user.sub;

  let query = db
    .from("users")
    .select("id, username, created_at")
    .neq("id", me)
    .order("username")
    .limit(50);

  if (search) {
    query = query.ilike("username", `%${search}%`);
  }

  const { data: users, error } = await query;

  if (error) {
    return res.status(500).json({ error: "Failed to fetch users." });
  }

  return res.json({ users: users || [] });
});

export default router;
