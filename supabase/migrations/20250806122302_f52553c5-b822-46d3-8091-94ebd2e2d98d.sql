-- Add approval status to profiles table
ALTER TABLE public.profiles 
ADD COLUMN approval_status text NOT NULL DEFAULT 'pending' 
CHECK (approval_status IN ('pending', 'approved', 'rejected'));

-- Add password requirements info (metadata only, password stored in auth.users)
ALTER TABLE public.profiles 
ADD COLUMN registration_date timestamp with time zone DEFAULT now();

-- Update existing profiles to be approved by default
UPDATE public.profiles SET approval_status = 'approved' WHERE approval_status = 'pending';