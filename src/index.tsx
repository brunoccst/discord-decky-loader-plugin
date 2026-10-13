import { addEventListener, definePlugin, removeEventListener, routerHook, toaster } from "@decky/api";
import { staticClasses } from "@decky/ui";
import { FaDiscord } from "react-icons/fa";
import { attach, useDiscordState } from "./backend";
import { DiscordPage, DISCORD_ROUTE } from "./components/DiscordPage";
import { UpdateSection } from "./components/UpdateSection";
import { VoicePanel } from "./components/VoicePanel";
import {
  createDiscordView,
  destroyDiscordView,
  resetDiscordViewSize,
  setDiscordViewSize,
  showKeyboard,
} from "./discordView";
import { startMicRelay } from "./mic";
import { restorePttListener, stopPttListener } from "./pushToTalk";
import { checkForUpdate } from "./updater";

function Content() {
  const state = useDiscordState();
  return (
    <>
      <VoicePanel state={state} />
      <UpdateSection />
    </>
  );
}

async function startDiscord() {
  try {
    createDiscordView();
    await attach();
  } catch (e) {
    console.error("[discord-deck] failed to start Discord", e);
    toaster.toast({ title: "Discord", body: `Couldn't start Discord: ${e}` });
  }
}

export default definePlugin(() => {
  routerHook.addRoute(DISCORD_ROUTE, DiscordPage, { exact: true });

  const stopMicRelay = startMicRelay();
  restorePttListener();

  const onKeyboard = () => showKeyboard();
  addEventListener("show_keyboard", onKeyboard);

  // If the tab dies (Steam reloads it, Discord crashes), start a fresh one.
  let restartTimer: ReturnType<typeof setTimeout> | undefined;
  const onTabLost = () => {
    clearTimeout(restartTimer);
    restartTimer = setTimeout(startDiscord, 2000);
  };
  addEventListener("tab_lost", onTabLost);

  // Fit the view to an external display when docked, and back to the Deck screen.
  let lastExternal = false;
  const settingsReg = SteamClient.Settings.RegisterForSettingsChanges((settings: any) => {
    const external = !!settings?.bDisplayIsExternal;
    if (external === lastExternal) return;
    lastExternal = external;
    if (external) setDiscordViewSize(window.screen.width, window.screen.height);
    else resetDiscordViewSize();
  });

  startDiscord();

  // Let the user know about a new release once per boot; the panel has the button.
  checkForUpdate()
    .then((update) => {
      if (update) {
        toaster.toast({
          title: "Discord",
          body: `Version ${update.latest} is available. Update it from the Discord panel.`,
        });
      }
    })
    .catch(() => {});

  return {
    name: "Discord",
    titleView: <div className={staticClasses.Title}>Discord</div>,
    content: <Content />,
    icon: <FaDiscord />,
    onDismount() {
      clearTimeout(restartTimer);
      removeEventListener("show_keyboard", onKeyboard);
      removeEventListener("tab_lost", onTabLost);
      settingsReg.unregister();
      stopPttListener();
      stopMicRelay();
      destroyDiscordView();
      routerHook.removeRoute(DISCORD_ROUTE);
    },
  };
});
