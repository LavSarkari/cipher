-- Enable Realtime for network-related tables
-- Run this in the Supabase SQL Editor
alter publication supabase_realtime add table public.friendships;
alter publication supabase_realtime add table public.friend_requests;
alter publication supabase_realtime add table public.group_members;
alter publication supabase_realtime add table public.groups;
