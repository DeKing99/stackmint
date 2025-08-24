// app/providers/supabase-provider.tsx
'use client';

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { useSession } from '@clerk/nextjs';
import { createContext, useContext, useEffect, useState } from 'react';

type SupabaseContextType = {
  supabase: SupabaseClient | null;
  isLoaded: boolean;
};

const SupabaseContext = createContext<SupabaseContextType>({
  supabase: null,
  isLoaded: false,
});

export function SupabaseProvider({ children }: { children: React.ReactNode }) {
  const { session } = useSession();
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const createSupabase = async () => {
      const token = await session?.getToken();
      const client = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        }
      );

      setSupabase(client);
      setIsLoaded(true);
    };

    if (session) {
      createSupabase();
    }
  }, [session]);

  return (
    <SupabaseContext.Provider value={{ supabase, isLoaded }}>
      {children}
    </SupabaseContext.Provider>
  );
}

export const useSupabase = () => {
  const ctx = useContext(SupabaseContext);
  if (!ctx) throw new Error('useSupabase must be used within SupabaseProvider');
  return ctx;
};
