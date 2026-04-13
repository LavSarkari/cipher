-- Run this in Supabase SQL Editor to add reply/edit/react features without wiping your data

-- 1. Add columns to 1-on-1 Messages
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES public.messages(id) ON DELETE SET NULL;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}';

-- 2. Add columns to Group Messages
ALTER TABLE public.group_messages ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES public.group_messages(id) ON DELETE SET NULL;
ALTER TABLE public.group_messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE public.group_messages ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}';

-- 3. Add UPDATE policies for 1-on-1 Messages
DROP POLICY IF EXISTS "Users can update own messages (edit)" ON public.messages;
CREATE POLICY "Users can update own messages (edit)" ON public.messages FOR UPDATE TO authenticated USING (auth.uid() = sender_id);

DROP POLICY IF EXISTS "Users can react to messages" ON public.messages;
CREATE POLICY "Users can react to messages" ON public.messages FOR UPDATE TO authenticated USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- 4. Add UPDATE policies for Group Messages
DROP POLICY IF EXISTS "Members can update own group messages (edit)" ON public.group_messages;
CREATE POLICY "Members can update own group messages (edit)" ON public.group_messages FOR UPDATE TO authenticated USING (auth.uid() = sender_id AND EXISTS (SELECT 1 FROM public.group_members WHERE group_id = public.group_messages.group_id AND user_id = auth.uid()));

DROP POLICY IF EXISTS "Members can react to group messages" ON public.group_messages;
CREATE POLICY "Members can react to group messages" ON public.group_messages FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.group_members WHERE group_id = public.group_messages.group_id AND user_id = auth.uid()));
