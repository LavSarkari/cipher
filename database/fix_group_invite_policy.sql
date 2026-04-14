-- UNIFIED FIX: GROUP INVITATIONS & VISIBILITY
-- Run this in the Supabase SQL Editor

-- 1. Helper function (Non-recursive membership check)
CREATE OR REPLACE FUNCTION public.check_is_group_member(gid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.group_members 
    WHERE group_id = gid AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Update Group Members Policies (Fixed 403 and 500 issues)
DROP POLICY IF EXISTS "Members can invite others" ON public.group_members;
DROP POLICY IF EXISTS "Members visible to each other" ON public.group_members;
DROP POLICY IF EXISTS "Join groups" ON public.group_members;

CREATE POLICY "Members visible to each other" ON public.group_members 
FOR SELECT TO authenticated 
USING (user_id = auth.uid() OR public.check_is_group_member(group_id));

CREATE POLICY "Members can invite others" ON public.group_members 
FOR INSERT TO authenticated 
WITH CHECK (
  user_id = auth.uid() 
  OR public.check_is_group_member(group_id)
  OR EXISTS (SELECT 1 FROM public.groups WHERE id = group_id AND creator_id = auth.uid())
);

-- 3. Update Groups Policies (Fixes Visibility for invited users)
DROP POLICY IF EXISTS "Groups visible to members" ON public.groups;
CREATE POLICY "Groups visible to members" ON public.groups 
FOR SELECT TO authenticated 
USING (creator_id = auth.uid() OR public.check_is_group_member(id));
