import { createClient } from '@supabase/supabase-js';

// Accounts are off until VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.
// Only the publishable (anon) key belongs in the frontend; never the service-role key.
export const supabase = import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
  ? createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)
  : null;

// Onboarding progress lives in the user's Supabase metadata, so it follows the account.
export const needsOnboarding = user => !user?.user_metadata?.onboarded;
