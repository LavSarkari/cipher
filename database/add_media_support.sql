-- CIPHER MEDIA SUPPORT MIGRATION
-- Run this in the Supabase SQL Editor AFTER the initial rebuild script.

-- ═══════════════════════════════════════════════════════
-- 1. ADD MEDIA COLUMNS TO MESSAGES
-- ═══════════════════════════════════════════════════════

-- Message type: 'text', 'image', 'gif', 'sticker', 'file'
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS media_url TEXT,       -- Supabase Storage path or external URL (GIF/sticker)
  ADD COLUMN IF NOT EXISTS media_meta JSONB DEFAULT '{}',  -- { width, height, thumbnail, fileName, fileSize, mimeType }
  ADD COLUMN IF NOT EXISTS ephemeral BOOLEAN DEFAULT false, -- "Burn After Reading" flag
  ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ;           -- When ephemeral was viewed (triggers delete)

ALTER TABLE public.group_messages
  ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS media_url TEXT,
  ADD COLUMN IF NOT EXISTS media_meta JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ephemeral BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ;

-- ═══════════════════════════════════════════════════════
-- 2. CREATE STORAGE BUCKET FOR ENCRYPTED MEDIA
-- ═══════════════════════════════════════════════════════

-- Create the bucket (public = false means RLS-protected)
INSERT INTO storage.buckets (id, name, public)
VALUES ('cipher-media', 'cipher-media', false)
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════
-- 3. STORAGE RLS POLICIES
-- ═══════════════════════════════════════════════════════

-- Allow authenticated users to upload files
CREATE POLICY "Authenticated users can upload media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'cipher-media');

-- Allow authenticated users to read files (they still need the decryption key)
CREATE POLICY "Authenticated users can read media"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'cipher-media');

-- Allow authenticated users to delete their own uploads
CREATE POLICY "Users can delete own media"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'cipher-media' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ═══════════════════════════════════════════════════════
-- 4. AUTO-PURGE FUNCTION (14-day cleanup)
-- Call this periodically via Supabase Edge Function or cron
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.purge_old_media()
RETURNS void AS $$
BEGIN
  -- Delete storage references from messages older than 14 days
  UPDATE public.messages
  SET media_url = NULL, media_meta = '{}'
  WHERE media_url IS NOT NULL
    AND type IN ('image', 'file')
    AND created_at < NOW() - INTERVAL '14 days';

  UPDATE public.group_messages
  SET media_url = NULL, media_meta = '{}'
  WHERE media_url IS NOT NULL
    AND type IN ('image', 'file')
    AND created_at < NOW() - INTERVAL '14 days';

  -- Mark ephemeral messages that were viewed for cleanup
  UPDATE public.messages
  SET media_url = NULL, media_meta = '{}'
  WHERE ephemeral = true AND viewed_at IS NOT NULL;

  UPDATE public.group_messages
  SET media_url = NULL, media_meta = '{}'
  WHERE ephemeral = true AND viewed_at IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
