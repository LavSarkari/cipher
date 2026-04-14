-- 1. Allow users to update their own profile data
-- Without this, Supabase will reject any 'update' calls from the application
CREATE POLICY "Users can update their own profile" 
ON public.users 
FOR UPDATE 
TO authenticated 
USING (auth.uid() = id);

-- 2. Enable Realtime triggers for the users table
-- Without this, other users won't see your changes until they refresh
ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
