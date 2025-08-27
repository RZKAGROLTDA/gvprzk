import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://wuvbrkbhunifudaewhng.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1dmJya2JodW5pZnVkYWV3aG5nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzODY5MTksImV4cCI6MjA2ODk2MjkxOX0.e8E9SJYB0KQ7CXgo0RTRCZ-NaEfiJgrKZUSyraOrYoI';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);