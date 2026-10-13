import { useEffect, useState } from "react";

// Where the plugin is in bringing Discord up, for the panel's status messages.
export type StartupPhase =
  | { kind: "creating" }
  | { kind: "connecting" }
  | { kind: "loading"; since: number; retried: boolean }
  | { kind: "error"; message: string };

let phase: StartupPhase = { kind: "creating" };
const listeners = new Set<(p: StartupPhase) => void>();

export const getStartupPhase = () => phase;

export function setStartupPhase(next: StartupPhase) {
  phase = next;
  listeners.forEach((l) => l(phase));
}

export function useStartupPhase() {
  const [value, setValue] = useState(phase);
  useEffect(() => {
    setValue(phase);
    listeners.add(setValue);
    return () => void listeners.delete(setValue);
  }, []);
  return value;
}

// Re-renders every second while mounted, for elapsed-time text.
export function useSecondsSince(since: number | undefined) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (since === undefined) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [since]);
  return since === undefined ? 0 : Math.max(0, Math.round((now - since) / 1000));
}
