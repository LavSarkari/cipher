-- Add extra fields for users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'online';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS recovery_email TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS recovery_phone TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS banner_color TEXT DEFAULT '#4f46e5';

-- Update existing users to have a display name if null
UPDATE public.users SET display_name = username WHERE display_name IS NULL;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_id INTEGER DEFAULT 1;

-- Update the sync function to include defaults or handle new fields
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, username, display_name, status, banner_color, avatar_id)
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)), 
    COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)), 
    'online',
    '#4f46e5',
    floor(random() * 9 + 1)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
