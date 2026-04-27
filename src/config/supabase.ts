import { createClient } from '@supabase/supabase-js';

// Fill in your values from: Supabase Dashboard → Project Settings → API
const supabaseUrl = 'https://idsvbkphomjgdrbazewc.supabase.co';       // e.g. https://xxxx.supabase.co
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkc3Zia3Bob21qZ2RyYmF6ZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMjU3MDcsImV4cCI6MjA5MjgwMTcwN30.6yG7wwTA8r7aqUH12Jyu9I-Mi1fzQzM_Ebk7Xv9KkWs';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
});
