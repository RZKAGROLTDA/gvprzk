-- Check what triggers currently exist on profiles table
SELECT 
    trigger_name,
    trigger_schema,
    event_manipulation,
    event_object_table,
    action_timing,
    action_condition,
    action_statement
FROM information_schema.triggers 
WHERE event_object_table = 'profiles' 
AND trigger_schema = 'public'
ORDER BY trigger_name;

-- Also check if there are any remaining duplicate triggers we missed
SELECT 
    tgname as trigger_name,
    pg_proc.proname as function_name,
    tgtype,
    tgenabled
FROM pg_trigger 
JOIN pg_proc ON pg_trigger.tgfoid = pg_proc.oid
JOIN pg_class ON pg_trigger.tgrelid = pg_class.oid
WHERE pg_class.relname = 'profiles'
AND pg_class.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');