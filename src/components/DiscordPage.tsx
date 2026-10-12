import { toaster } from "@decky/api";
import { Navigation } from "@decky/ui";
import { useLayoutEffect } from "react";
import { hasDiscordView, showDiscordView } from "../discordView";

export const DISCORD_ROUTE = "/discord-deck";

// Full-screen route that reveals the hidden Discord tab (used to sign in or for
// anything the Quick Access Menu doesn't cover yet).
export function DiscordPage() {
  useLayoutEffect(() => {
    if (!hasDiscordView()) {
      toaster.toast({ title: "Discord", body: "Discord is still starting. Try again in a moment." });
      Navigation.NavigateBack();
      return;
    }
    showDiscordView(true);
    return () => showDiscordView(false);
  }, []);

  return <div />;
}
