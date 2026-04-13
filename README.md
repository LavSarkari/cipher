# Vault Secure Re-Architecture

This project is split into three isolated layers:

- `frontend/` React UI (same visual style/feature flow)
- `backend/` Express API with secure auth and authorization checks
- `database/` SQL schema for users, friendships, and encrypted messages

## Security upgrades implemented

- Removed plaintext passwords, replaced with `argon2id` hashing.
- Removed weak custom crypto, replaced with browser `Web Crypto` (`PBKDF2 + AES-256-GCM`) and per-message random IV.
- Messages are encrypted on client before upload. Server stores only ciphertext + IV.
- Added `httpOnly` session cookie, CSRF protection, `helmet`, CORS policy, and rate limiting.
- Added strict server-side validation with `zod`.
- Added access control for chats (only friends can read/send).

## Run

1. Copy env files:
   - `backend/.env.example -> backend/.env`
   - `frontend/.env.example -> frontend/.env`
2. Install dependencies separately in `backend/` and `frontend/`.
3. Start backend on `:4000` and frontend on `:5173`.

## Important security note

`100% secure` is not technically achievable in any real-world app. This build is a strong baseline, but production hardening should also include:

- HTTPS everywhere with HSTS
- refresh-token rotation / session revocation store
- dependency scanning + SAST/DAST
- key backup/recovery strategy
- independent security audit and pentest

Also, this does **not** implement the full Signal protocol used by WhatsApp. It uses strong modern primitives, but protocol parity with WhatsApp/Telegram requires significantly more infrastructure and cryptographic state management.
