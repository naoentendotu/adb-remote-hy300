import { useCallback, useEffect, useState } from 'react';

import { useAdbConnection } from '@/hooks/useAdbConnection';
import { AdbError } from '@/services/adb/AdbErrors';

/** The projector's sleep timer, re-read on connect and after each change; counts down locally in between. */
export function useSleepTimer() {
  const { client, state } = useAdbConnection();
  const [timer, setTimer] = useState<{ dueAt: number; total: number | null } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(
    () =>
      client
        .sleepStatus()
        .then((s) => setTimer(s && { dueAt: Date.now() + s.remaining * 1000, total: s.total }))
        .catch(() => {}),
    [client],
  );
  useEffect(() => {
    if (state.status === 'connected') void refresh();
  }, [state.status, refresh]);
  useEffect(() => {
    if (!timer) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timer]);

  const left = timer ? Math.round((timer.dueAt - now) / 1000) : 0;
  return {
    /** Seconds left, or null when no timer is running. */
    remaining: left > 0 ? left : null,
    total: timer?.total ?? null,
    dueAt: left > 0 ? timer!.dueAt : null,
    schedule: async (minutes: number) => {
      await client.scheduleSleep(minutes);
      const s = await client.sleepStatus();
      // Without this the sheet silently stays on the picker when the timer process did not survive.
      if (!s) throw new AdbError('COMMAND_FAILED', 'o temporizador não ficou ativo.');
      setTimer({ dueAt: Date.now() + s.remaining * 1000, total: s.total });
    },
    cancel: () => client.cancelSleep().then(refresh),
  };
}

export type SleepTimer = ReturnType<typeof useSleepTimer>;
