import { useEffect, useState } from 'react';
import { supabase } from '../config/supabase';
import { Game } from '../types';

export function useGame(gameId: string) {
  const [game, setGame] = useState<Game | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!gameId) return;

    // Initial fetch
    supabase
      .from('games')
      .select('data')
      .eq('id', gameId)
      .single()
      .then(({ data: row, error: err }) => {
        if (err) setError(err.message);
        else setGame((row?.data as Game) ?? null);
        setLoading(false);
      });

    // Real-time subscription
    const channel = supabase
      .channel(`game-${gameId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        (payload) => {
          setGame((payload.new as { data: Game }).data);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  return { game, loading, error };
}
