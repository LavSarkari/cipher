/**
 * Cipher Media Pipeline
 * Handles: Image compression, thumbnail generation, AES-GCM file encryption/decryption
 * 
 * Flow: File → Compress → Generate Thumbnail → Encrypt → Upload
 * Flow: Download → Decrypt → Display
 */

const enc = new TextEncoder();

// ─── Image Compression ───
// Uses Canvas API to resize and compress images client-side
export const compressImage = (file, maxWidth = 1600, quality = 0.7) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      
      let { width, height } = img;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error('Compression failed'));
          resolve({
            blob,
            width,
            height,
            originalSize: file.size,
            compressedSize: blob.size,
            mimeType: 'image/jpeg'
          });
        },
        'image/jpeg',
        quality
      );
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    
    img.src = url;
  });
};

// ─── Blurred Thumbnail Generator ───
// Creates a tiny Base64 preview (~20x20px) for instant "blur-up" loading
export const generateThumbnail = (file, size = 20) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file instanceof Blob ? file : new Blob([file]));
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      
      const ratio = img.width / img.height;
      const w = ratio >= 1 ? size : Math.round(size * ratio);
      const h = ratio >= 1 ? Math.round(size / ratio) : size;
      
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      
      resolve(canvas.toDataURL('image/jpeg', 0.3));
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Thumbnail generation failed'));
    };
    
    img.src = url;
  });
};

// ─── AES-GCM File Encryption ───
// Derives a key from the chat passphrase and encrypts file data
const deriveFileKey = async (passphrase, chatId) => {
  const material = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(`cipher-media:${chatId}`),
      iterations: 310000,
      hash: 'SHA-256'
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

export const encryptFile = async (arrayBuffer, passphrase, chatId) => {
  const key = await deriveFileKey(passphrase, chatId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    arrayBuffer
  );
  
  // Prepend IV to ciphertext for single-blob storage
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  
  return combined;
};

export const decryptFile = async (encryptedData, passphrase, chatId) => {
  const key = await deriveFileKey(passphrase, chatId);
  const dataArray = encryptedData instanceof Uint8Array ? encryptedData : new Uint8Array(encryptedData);
  const iv = dataArray.slice(0, 12);
  const ciphertext = dataArray.slice(12);
  
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  
  return plaintext;
};

/**
 * Encrypts a small JSON object (metadata) for database storage
 */
export const encryptMetadata = async (data, passphrase, chatId) => {
  if (!data) return null;
  const key = await deriveFileKey(passphrase, chatId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = enc.encode(JSON.stringify(data));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );
  
  // Return as an object that can be stored in JSONB or as a string
  return {
    ct: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    iv: btoa(String.fromCharCode(...iv))
  };
};

/**
 * Decrypts metadata from its encrypted object form
 */
export const decryptMetadata = async (encrypted, passphrase, chatId) => {
  if (!encrypted) return null;
  
  // Handle stringified JSON from TEXT columns
  let payload = encrypted;
  if (typeof encrypted === 'string') {
    try {
      payload = JSON.parse(encrypted);
    } catch (e) {
      return encrypted; // Probably a raw storage path string
    }
  }

  if (!payload.ct || !payload.iv) return payload; 
  
  try {
    const key = await deriveFileKey(passphrase, chatId);
    const iv = Uint8Array.from(atob(payload.iv), c => c.charCodeAt(0));
    const ct = Uint8Array.from(atob(payload.ct), c => c.charCodeAt(0));
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ct
    ).catch(err => {
      // If it's an OperationError, it's likely just not cipher-text or wrong key, avoid console spam
      if (err.name === 'OperationError') return null;
      throw err;
    });
    
    if (!decrypted) return payload; // Fallback to raw payload
    
    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch (e) {
    // Only log if it's a real unexpected error
    if (e.name !== 'SyntaxError') {
      console.warn('[Media] Decryption skipped or failed:', e.message);
    }
    return payload; 
  }
};

// ─── Full Media Processing Pipeline ───
// Takes a raw file, compresses, generates thumbnail, encrypts
export const processMediaForUpload = async (file, passphrase, chatId) => {
  const isImage = file.type.startsWith('image/');
  
  if (!isImage) {
    throw new Error('Only images are supported currently');
  }
  
  console.log('[Media] Processing:', file.name, `(${(file.size / 1024).toFixed(1)}KB)`);
  
  // 1. Compress
  const compressed = await compressImage(file);
  console.log('[Media] Compressed:', `${(compressed.originalSize / 1024).toFixed(0)}KB → ${(compressed.compressedSize / 1024).toFixed(0)}KB`);
  
  // 2. Generate thumbnail
  const thumbnail = await generateThumbnail(compressed.blob);
  console.log('[Media] Thumbnail generated');
  
  // 3. Encrypt the compressed blob
  const buffer = await compressed.blob.arrayBuffer();
  const encrypted = await encryptFile(buffer, passphrase, chatId);
  console.log('[Media] Encrypted:', `${(encrypted.byteLength / 1024).toFixed(0)}KB`);
  
  return {
    encryptedBlob: new Blob([encrypted], { type: 'application/octet-stream' }),
    metadata: {
      width: compressed.width,
      height: compressed.height,
      thumbnail,
      fileName: file.name,
      fileSize: compressed.compressedSize,
      mimeType: compressed.mimeType
    }
  };
};

// ─── File Size Formatter ───
export const formatFileSize = (bytes) => {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

// ─── Giphy Search (Free Tier) ───
// Using a common public beta key. If this fails, users should get their own from developers.giphy.com
const GIPHY_API_KEY = 't0wdUHXYwPRhJEUeujITcgY0wBz4GyKC'; 
const GIPHY_BASE  = 'https://api.giphy.com/v1';

export const searchGifs = async (query, limit = 20) => {
  const endpoint = query.trim()
    ? `${GIPHY_BASE}/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=${limit}&rating=pg`
    : `${GIPHY_BASE}/gifs/trending?api_key=${GIPHY_API_KEY}&limit=${limit}&rating=pg`;
  
  try {
    const res = await fetch(endpoint);
    if (!res.ok) throw new Error('Giphy search failed');
    const data = await res.json();
    return (data.data || []).map(g => ({
      id: g.id,
      title: g.title,
      url: g.images.fixed_height.url,
      preview: g.images.fixed_height_small.url || g.images.preview_gif?.url,
      width: parseInt(g.images.fixed_height.width),
      height: parseInt(g.images.fixed_height.height),
      mp4: g.images.fixed_height.mp4
    }));
  } catch (err) {
    console.warn('[Media] GIF search failed (API Key issue?):', err);
    return [];
  }
};

export const searchStickers = async (query, limit = 20) => {
  const endpoint = query.trim()
    ? `${GIPHY_BASE}/stickers/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=${limit}&rating=pg`
    : `${GIPHY_BASE}/stickers/trending?api_key=${GIPHY_API_KEY}&limit=${limit}&rating=pg`;
  
  try {
    const res = await fetch(endpoint);
    if (!res.ok) throw new Error('Giphy sticker search failed');
    const data = await res.json();
    return (data.data || []).map(s => ({
      id: s.id,
      title: s.title,
      url: s.images.fixed_height.url,
      preview: s.images.fixed_height_small?.url || s.images.preview_gif?.url,
      width: parseInt(s.images.fixed_height.width),
      height: parseInt(s.images.fixed_height.height)
    }));
  } catch (err) {
    console.warn('[Media] Sticker search failed (API Key issue?):', err);
    return [];
  }
};

// ─── Cipher Original Stickers (3D Premium Assets) ───
// Using high-quality 3D renders from the Microsoft Fluent Emoji set
export const CIPHER_STICKERS = [
  { id: 'c3d_ghost', name: 'Phantom', url: 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Ghost/3D/ghost_3d.png', emoji: '👻' },
  { id: 'c3d_heart', name: 'Pulse', url: 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Red%20heart/3D/red_heart_3d.png', emoji: '❤️' },
  { id: 'c3d_rocket', name: 'Blast', url: 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Rocket/3D/rocket_3d.png', emoji: '🚀' },
  { id: 'c3d_skull', name: 'Doom', url: 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Skull/3D/skull_3d.png', emoji: '💀' },
  { id: 'c3d_fire', name: 'Ignite', url: 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Fire/3D/fire_3d.png', emoji: '🔥' },
  { id: 'c3d_crown', name: 'Elite', url: 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Crown/3D/crown_3d.png', emoji: '👑' },
  { id: 'c3d_shield', name: 'Secure', url: 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Shield/3D/shield_3d.png', emoji: '🛡️' },
  { id: 'c3d_lock', name: 'Cipher', url: 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Locked/3D/locked_3d.png', emoji: '🔒' },
];
