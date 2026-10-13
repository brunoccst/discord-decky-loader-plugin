import { attach, getState } from "./backend";
import { createDiscordView } from "./discordView";
import { setStartupPhase } from "./startup";

// If Discord hasn't finished loading by then, restart it once automatically,
// and show an error with a Retry button if the second attempt also stalls.
const LOAD_TIMEOUT_MS = 45000;
let loadWatchdog: ReturnType<typeof setTimeout> | undefined;

export async function startDiscord(retried = false) {
  clearTimeout(loadWatchdog);
  try {
    setStartupPhase({ kind: "creating" });
    createDiscordView();
    setStartupPhase({ kind: "connecting" });
    await attach();
    setStartupPhase({ kind: "loading", since: Date.now(), retried });
    loadWatchdog = setTimeout(async () => {
      const state = await getState().catch(() => undefined);
      if (state?.ready) return;
      if (!retried) {
        startDiscord(true);
      } else {
        setStartupPhase({
          kind: "error",
          message: "Discord didn't finish loading. Check that the Deck is online, then try again.",
        });
      }
    }, LOAD_TIMEOUT_MS);
  } catch (e) {
    console.error("[discord-deck] failed to start Discord", e);
    setStartupPhase({ kind: "error", message: `Couldn't start Discord: ${e}` });
  }
}

export function stopLoadWatchdog() {
  clearTimeout(loadWatchdog);
}
