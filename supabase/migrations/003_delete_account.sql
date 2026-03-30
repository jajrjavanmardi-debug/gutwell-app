-- Function to delete all user data when they request account deletion.
-- Called via supabase.rpc('delete_user_account') from the client.
-- Uses SECURITY DEFINER to ensure it runs with elevated privileges.
CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID;
BEGIN
  uid := auth.uid();

  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Delete all user data from every table
  DELETE FROM public.check_ins WHERE user_id = uid;
  DELETE FROM public.food_logs WHERE user_id = uid;
  DELETE FROM public.symptoms WHERE user_id = uid;
  DELETE FROM public.gut_scores WHERE user_id = uid;
  DELETE FROM public.reminders WHERE user_id = uid;
  DELETE FROM public.water_logs WHERE user_id = uid;
  DELETE FROM public.favorites WHERE user_id = uid;
  DELETE FROM public.streaks WHERE user_id = uid;
  DELETE FROM public.profiles WHERE id = uid;

  -- Delete the auth user (requires service_role, which SECURITY DEFINER provides)
  DELETE FROM auth.users WHERE id = uid;
END;
$$;

-- Allow authenticated users to call this function
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;
