import express from "express";
import { db } from "../db.js";
import { requireAuth, requireCsrf, schemas, validateBody } from "../middleware.js";
import { generateId, stableChatId } from "../security.js";

const router = express.Router();

const checkFriendship = async (meId, peerId) => {
  const { data, error } = await db
    .from("friendships")
    .select("1")
    .eq("user_id", meId)
    .eq("friend_id", peerId)
    .maybeSingle();

  return Boolean(data) && !error;
};

router.get("/:peerId/messages", requireAuth, async (req, res) => {
  const { peerId } = req.params;
  const isFriend = await checkFriendship(req.user.sub, peerId);
  if (!isFriend) {
    return res.status(403).json({ error: "Chat access denied." });
  }

  const before = Number(req.query.before || Date.now());
  const chatId = stableChatId(req.user.sub, peerId);

  const { data: messages, error } = await db
    .from("messages")
    .select("id, sender_id, receiver_id, ciphertext, iv, alg, created_at")
    .eq("chat_id", chatId)
    .lt("created_at", before)
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) {
    return res.status(500).json({ error: "Failed to fetch messages." });
  }

  const formatted = (messages || [])
    .map((m) => ({
      id: m.id,
      senderId: m.sender_id,
      receiverId: m.receiver_id,
      ciphertext: m.ciphertext,
      iv: m.iv,
      alg: m.alg,
      timestamp: m.created_at
    }))
    .reverse();

  return res.json({ messages: formatted });
});

router.post(
  "/:peerId/messages",
  requireAuth,
  requireCsrf,
  validateBody(schemas.sendMessage),
  async (req, res) => {
    const { peerId } = req.params;
    const isFriend = await checkFriendship(req.user.sub, peerId);
    if (!isFriend) {
      return res.status(403).json({ error: "Cannot message this user." });
    }

    const { ciphertext, iv } = req.validatedBody;
    const now = Date.now();
    const msg = {
      id: generateId("msg"),
      chat_id: stableChatId(req.user.sub, peerId),
      sender_id: req.user.sub,
      receiver_id: peerId,
      ciphertext,
      iv,
      alg: "AES-GCM-256",
      created_at: now
    };

    const { error } = await db.from("messages").insert(msg);

    if (error) {
      return res.status(500).json({ error: "Failed to send message." });
    }

    return res.status(201).json({
      message: {
        id: msg.id,
        senderId: msg.sender_id,
        receiverId: msg.receiver_id,
        ciphertext: msg.ciphertext,
        iv: msg.iv,
        alg: msg.alg,
        timestamp: msg.created_at
      }
    });
  }
);

export default router;
