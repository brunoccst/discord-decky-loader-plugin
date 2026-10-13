import { addEventListener, removeEventListener } from "@decky/api";
import { attach, DiscordState, getState } from "./backend";
import { createDiscordView } from "./discordView";
import { isFamilyViewLocked } from "./familyView";
import { getStartupPhase, setStartupPhase } from "./startup";

// If Discord hasn't finished loading by then, restart it once automatically,
// and show an error with a Try again button if the second attempt also stalls.
const LOAD_TIMEOUT_MS = 45000;

export async function startDiscord(retried = false) {
  try {
    setStartupPhase({ kind: "creating" });
    createDiscordView();
    setStartupPhase({ kind: "connecting" });
    await attach();
    setStartupPhase({ kind: "loading", since: Date.now(), retried });
  } catch (e) {
    console.error("[discord-deck] failed to start Discord", e);
    setStartupPhase({ kind: "error", message: `Couldn't start Discord: ${e}` });
  }
}

let handlingStall = false;

// Called on a timer and from the panel; restarts or errors out a stalled load.
export async function checkLoadStall() {
  const phase = getStartupPhase();
  // A load blocked by Family View isn't a stall; unlocking restarts Discord.
  if (phase.kind !== "loading" || handlingStall || isFamilyViewLocked()) return;
  handlingStall = true;
  try {
    const state = await getState().catch(() => undefined);
    if (state?.ready) {
      setStartupPhase({ kind: "ready" });
    } else if (Date.now() - phase.since < LOAD_TIMEOUT_MS) {
      return;
    } else if (!phase.retried) {
      await startDiscord(true);
    } else {
      setStartupPhase({
        kind: "error",
        message: "Discord didn't finish loading. Check that the Deck is online, then try again.",
      });
    }
  } finally {
    handlingStall = false;
  }
}

// Watches startup until Discord reports in; returns a cleanup function.
export function startLifecycleWatch() {
  const onState = (state: DiscordState) => {
    if (state.ready && getStartupPhase().kind === "loading") setStartupPhase({ kind: "ready" });
  };
  addEventListener<[DiscordState]>("state", onState);
  const timer = setInterval(checkLoadStall, 5000);
  return () => {
    clearInterval(timer);
    removeEventListener("state", onState);
  };
}
