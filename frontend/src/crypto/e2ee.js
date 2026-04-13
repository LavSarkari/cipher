const enc = new TextEncoder();
const dec = new TextDecoder();

const toB64 = (bytes) => btoa(String.fromCharCode(...bytes));
const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

const deriveKey = async (passphrase, chatId) => {
  const material = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, [
    "deriveKey"
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(`vault:${chatId}`),
      iterations: 310000,
      hash: "SHA-256"
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
};

export const encryptMessage = async ({ plaintext, passphrase, chatId }) => {
  const key = await deriveKey(passphrase, chatId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plaintext)
  );

  return {
    ciphertext: toB64(new Uint8Array(ciphertext)),
    iv: toB64(iv)
  };
};

export const decryptMessage = async ({ ciphertext, iv, passphrase, chatId }) => {
  const key = await deriveKey(passphrase, chatId);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(iv) },
    key,
    fromB64(ciphertext)
  );
  return dec.decode(plain);
};
