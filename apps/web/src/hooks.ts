import { useEffect, useState } from 'react';

import { useApp } from './sync/store';

export interface QueryState<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
}

/**
 * Run an async database read and re-run it when `deps` change or a sync
 * brings new data. Stale responses (from an older run) are ignored.
 */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[]): QueryState<T> {
  const { dbReady, dataVersion } = useApp();
  const [state, setState] = useState<QueryState<T>>({ data: undefined, loading: true, error: null });

  useEffect(() => {
    if (!dbReady) return;
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    fn().then(
      (data) => alive && setState({ data, loading: false, error: null }),
      (error: unknown) =>
        alive && setState({ data: undefined, loading: false, error: error instanceof Error ? error.message : String(error) }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbReady, dataVersion, ...deps]);

  return state;
}

/** Per-device preferences (font, size, theme). Safe when storage is blocked. */
export function usePref<T extends string>(key: string, fallback: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => readPref(key, fallback));
  const update = (v: T) => {
    setValue(v);
    try {
      localStorage.setItem(`tq.${key}`, v);
    } catch {
      // storage unavailable: keep it for this session only
    }
    applyPrefs();
  };
  return [value, update];
}

export function readPref<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(`tq.${key}`) as T | null) ?? fallback;
  } catch {
    return fallback;
  }
}

/** Reflect preferences on <html> so CSS can follow them. */
export function applyPrefs() {
  const root = document.documentElement;
  root.dataset.font = readPref('font', 'mehr');
  root.dataset.size = readPref('size', 'm');
  const theme = readPref('theme', 'system');
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
}
