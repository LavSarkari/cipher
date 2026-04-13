-- SUPABASE REBUILD SCRIPT
-- RUN THIS IN THE SUPABASE SQL EDITOR

-- 1. PURGE (Clean Slate)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.group_messages CASCADE;
DROP TABLE IF EXISTS public.group_members CASCADE;
DROP TABLE IF EXISTS public.group_join_requests CASCADE;
DROP TABLE IF EXISTS public.groups CASCADE;
DROP TABLE IF EXISTS public.friend_requests CASCADE;
DROP TABLE IF EXISTS public.friendships CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;

-- 2. CORE TABLES
-- Public users table metadata (synced from auth.users)
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Friendships (Bi-directional)
CREATE TABLE public.friendships (
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  friend_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, friend_id)
);

-- Friend Requests
CREATE TABLE public.friend_requests (
  from_user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  to_user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (from_user_id, to_user_id),
  CHECK (from_user_id <> to_user_id)
);

-- Groups
CREATE TABLE public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  creator_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Group Members
CREATE TABLE public.group_members (
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

-- 1-on-1 Messages (E2EE Ciphertext)
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id TEXT NOT NULL, -- Format: uuid1:uuid2 (sorted)
  sender_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  receiver_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Group Messages (E2EE Ciphertext)
CREATE TABLE public.group_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. ENABLE RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;

-- 4. POLICIES

-- Users
CREATE POLICY "Users are visible to all authenticated users" ON public.users FOR SELECT TO authenticated USING (true);

-- Friendships
CREATE POLICY "Users can view their own friendships" ON public.friendships FOR SELECT TO authenticated USING (auth.uid() = user_id OR auth.uid() = friend_id);
CREATE POLICY "Users can remove friendships" ON public.friendships FOR DELETE TO authenticated USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- Friend Requests
CREATE POLICY "Users can view requests they sent or received" ON public.friend_requests FOR SELECT TO authenticated USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);
CREATE POLICY "Users can send requests" ON public.friend_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = from_user_id);
CREATE POLICY "Users can accept/reject requests" ON public.friend_requests FOR DELETE TO authenticated USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

-- Groups
CREATE POLICY "Groups visible to members" ON public.groups FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.group_members WHERE group_id = id AND user_id = auth.uid()));
CREATE POLICY "Anyone can create groups" ON public.groups FOR INSERT TO authenticated WITH CHECK (auth.uid() = creator_id);

-- Group Members
CREATE POLICY "Members visible to each other" ON public.group_members FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.group_members WHERE group_id = public.group_members.group_id AND user_id = auth.uid()));
CREATE POLICY "Join groups" ON public.group_members FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Messages
CREATE POLICY "Users can see messages in their chats" ON public.messages FOR SELECT TO authenticated USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "Users can send messages to friends" ON public.messages FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = sender_id AND (
    EXISTS (SELECT 1 FROM public.friendships WHERE (user_id = auth.uid() AND friend_id = receiver_id) OR (user_id = receiver_id AND friend_id = auth.uid()))
  )
);

-- Group Messages
CREATE POLICY "Members can see group messages" ON public.group_messages FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.group_members WHERE group_id = public.group_messages.group_id AND user_id = auth.uid()));
CREATE POLICY "Members can send group messages" ON public.group_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id AND EXISTS (SELECT 1 FROM public.group_members WHERE group_id = public.group_messages.group_id AND user_id = auth.uid()));

-- 5. AUTOMATED USER SYNC (CRITICAL)
-- This function runs whenever a new user signs up via Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, username)
  VALUES (new.id, COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
