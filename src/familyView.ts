import { useEffect, useState } from "react";

// Steam Family View (parental lock) blocks the Discord browser view, so we
// track whether it's currently locked and tell the user to unlock it.
let locked = false;
const listeners = new Set<(locked: boolean) => void>();
let unregister: (() => void) | undefined;

export function startFamilyViewWatch() {
  try {
    const reg = SteamClient.Parental.RegisterForParentalSettingsChanges((settings) => {
      const next = !!settings?.locked;
      if (next === locked) return;
      locked = next;
      listeners.forEach((l) => l(locked));
    });
    unregister = () => reg.unregister();
  } catch (e) {
    console.warn("[discord-deck] couldn't watch Family View", e);
  }
}

export function stopFamilyViewWatch() {
  unregister?.();
  unregister = undefined;
  listeners.clear();
}

export const isFamilyViewLocked = () => locked;

export function onFamilyViewChange(listener: (locked: boolean) => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function useFamilyViewLocked() {
  const [value, setValue] = useState(locked);
  useEffect(() => {
    setValue(locked);
    return onFamilyViewChange(setValue);
  }, []);
  return value;
}
