import crypto from "crypto";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { config, isProd } from "./config.js";

export const sessionCookie = "vault_session";
export const csrfCookie = "vault_csrf";

export const hashPassword = async (password) =>
  argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1
  });

export const verifyPassword = (hash, password) =>
  argon2.verify(hash, password);

export const makeUserToken = (user) =>
  jwt.sign({ sub: user.id, username: user.username }, config.jwtSecret, {
    expiresIn: "15m",
    issuer: "vault-backend",
    audience: "vault-frontend"
  });

export const verifyUserToken = (token) =>
  jwt.verify(token, config.jwtSecret, {
    issuer: "vault-backend",
    audience: "vault-frontend"
  });

export const setAuthCookies = (res, token, csrfToken) => {
  res.cookie(sessionCookie, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    maxAge: 15 * 60 * 1000
  });

  res.cookie(csrfCookie, csrfToken, {
    httpOnly: false,
    secure: isProd,
    sameSite: "lax",
    maxAge: 15 * 60 * 1000
  });
};

export const clearAuthCookies = (res) => {
  res.clearCookie(sessionCookie, { httpOnly: true, sameSite: "lax", secure: isProd });
  res.clearCookie(csrfCookie, { httpOnly: false, sameSite: "lax", secure: isProd });
};

export const generateId = (prefix) => `${prefix}_${crypto.randomUUID()}`;
export const generateCsrf = () => crypto.randomBytes(32).toString("hex");
export const stableChatId = (a, b) => [a, b].sort().join(":");
