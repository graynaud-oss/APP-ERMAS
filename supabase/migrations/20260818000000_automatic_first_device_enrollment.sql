-- Allow the first device of a new profile to enroll automatically.
-- initialize_own_device_token closes enrollment after success; existing profiles are unchanged.
ALTER TABLE public.profiles
ALTER COLUMN device_enrollment_allowed SET DEFAULT true;
