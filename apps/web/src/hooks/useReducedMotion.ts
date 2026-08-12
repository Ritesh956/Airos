import { useEffect, useState } from 'react';
import { useStoreSelector } from './useStore';
import { appStore } from '@/state/appStore';

/** True if the user asked for less motion, either via OS preference or the
 *  in-app Settings toggle. Either source alone is enough to disable it. */
export function useReducedMotion(): boolean {
  const settingPreference = useStoreSelector(appStore, (s) => s.settings.reduceMotion);
  const [systemPreference, setSystemPreference] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setSystemPreference(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return settingPreference || systemPreference;
}
