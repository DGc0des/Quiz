import { useEffect, useState } from 'react';

export function useTimer(durationSeconds: number, startedAt: number | null): number {
  const [remaining, setRemaining] = useState(durationSeconds);

  useEffect(() => {
    if (startedAt === null) {
      setRemaining(durationSeconds);
      return;
    }

    const tick = () => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setRemaining(Math.max(0, durationSeconds - elapsed));
    };

    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [startedAt, durationSeconds]);

  return remaining;
}
