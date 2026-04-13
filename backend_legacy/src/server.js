import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { config } from "./config.js";
import "./db.js";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import friendRoutes from "./routes/friends.js";
import friendRequestRoutes from "./routes/friendRequests.js";
import groupRoutes from "./routes/groups.js";
import chatRoutes from "./routes/chats.js";

const app = express();

app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin: config.frontendOrigin,
    credentials: true
  })
);
app.use(express.json({ limit: "32kb" }));
app.use(cookieParser());

const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Write rate limit exceeded." }
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/friends", writeLimiter, friendRoutes);
app.use("/api/friend-requests", writeLimiter, friendRequestRoutes);
app.use("/api/groups", writeLimiter, groupRoutes);
app.use("/api/chats", writeLimiter, chatRoutes);

app.use((_req, res) => res.status(404).json({ error: "Route not found." }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error." });
});

app.listen(config.port, () => {
  console.log(`Vault backend listening on http://localhost:${config.port}`);
});
