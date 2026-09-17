// Change notification between the imperative app (main.ts mutates `state`) and the React panel.
// main.ts calls notify() after changing state; components subscribe with useStateVersion() and read `state` directly.
import {useSyncExternalStore} from 'react';

let version = 0;
const listeners = new Set<() => void>();

export function notify(): void{
  version++;
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

// Re-renders the calling component on every notify(); the returned number is only useful as a memo key
export const useStateVersion = (): number => useSyncExternalStore(subscribe, () => version);
