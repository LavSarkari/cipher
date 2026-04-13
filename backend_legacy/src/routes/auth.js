import express from "express";
import rateLimit from "express-rate-limit";
import { db } from "../db.js";
import { validateBody, schemas, requireAuth, requireCsrf } from "../middleware.js";
import {
  clearAuthCookies,
  csrfCookie,
  generateCsrf,
  generateId,
  hashPassword,
  makeUserToken,
  setAuthCookies,
  verifyPassword
} from "../security.js";
import { isProd } from "../config.js";

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again later." }
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many signup attempts. Try again later." }
});

router.get("/csrf", (_req, res) => {
  const csrfToken = generateCsrf();
  res.cookie(csrfCookie, csrfToken, {
    httpOnly: false,
    sameSite: "lax",
    secure: isProd,
    maxAge: 15 * 60 * 1000
  });
  return res.json({ csrfToken });
});

router.post("/register", registerLimiter, validateBody(schemas.authRegister), async (req, res) => {
  const { username, password } = req.validatedBody;
  const { data: existing, error: findError } = await db
    .from("users")
    .select("id")
    .eq("username", username)
    .maybeSingle();

  if (findError) {
    return res.status(500).json({ error: "Database error." });
  }
  if (existing) {
    return res.status(409).json({ error: "Username already exists." });
  }

  const user = {
    id: generateId("node"),
    username,
    password_hash: await hashPassword(password),
    created_at: Date.now()
  };

  const { error: insertError } = await db.from("users").insert(user);
  if (insertError) {
    return res.status(500).json({ error: "Failed to create user." });
  }

  const token = makeUserToken(user);
  const csrfToken = generateCsrf();
  setAuthCookies(res, token, csrfToken);
  return res.status(201).json({
    user: { id: user.id, username: user.username },
    csrfToken
  });
});

router.post("/login", loginLimiter, validateBody(schemas.authLogin), async (req, res) => {
  const { username, password } = req.validatedBody;
  const { data: found, error: findError } = await db
    .from("users")
    .select("id, username, password_hash")
    .eq("username", username)
    .maybeSingle();

  if (findError || !found) {
    return res.status(401).json({ error: "Invalid username/password." });
  }

  const ok = await verifyPassword(found.password_hash, password);
  if (!ok) {
    return res.status(401).json({ error: "Invalid username/password." });
  }

  const token = makeUserToken(found);
  const csrfToken = generateCsrf();
  setAuthCookies(res, token, csrfToken);

  return res.json({
    user: { id: found.id, username: found.username },
    csrfToken
  });
});

router.get("/me", requireAuth, async (req, res) => {
  const { data: user, error } = await db
    .from("users")
    .select("id, username, created_at")
    .eq("id", req.user.sub)
    .maybeSingle();

  if (!user) {
    clearAuthCookies(res);
    return res.status(401).json({ error: "User not found." });
  }
  return res.json({ user });
});

router.post("/logout", requireAuth, requireCsrf, (_req, res) => {
  clearAuthCookies(res);
  return res.status(204).send();
});

export default router;
