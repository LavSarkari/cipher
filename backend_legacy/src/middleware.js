import { z } from "zod";
import { csrfCookie, sessionCookie, verifyUserToken } from "./security.js";

export const schemas = {
  authLogin: z.object({
    username: z.string().trim().toLowerCase().min(3).max(24).regex(/^[a-z0-9_]+$/),
    password: z.string().min(1).max(128)
  }),
  authRegister: z.object({
    username: z.string().trim().toLowerCase().min(3).max(24).regex(/^[a-z0-9_]+$/),
    password: z.string().min(10).max(128)
  }),
  sendMessage: z.object({
    ciphertext: z.string().min(1).max(12000),
    iv: z.string().min(1).max(128)
  })
};

export const validateBody = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: "Invalid request payload." });
  }
  req.validatedBody = result.data;
  return next();
};

export const requireAuth = (req, res, next) => {
  const token = req.cookies?.[sessionCookie];
  if (!token) {
    return res.status(401).json({ error: "Authentication required." });
  }
  try {
    req.user = verifyUserToken(token);
    return next();
  } catch {
    return res.status(401).json({ error: "Session expired. Please log in again." });
  }
};

export const requireCsrf = (req, res, next) => {
  const cookieToken = req.cookies?.[csrfCookie];
  const headerToken = req.headers["x-csrf-token"];
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: "CSRF validation failed." });
  }
  return next();
};
