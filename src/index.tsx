import { addEventListener, definePlugin, removeEventListener, routerHook, toaster } from "@decky/api";
import { staticClasses } from "@decky/ui";
import { FaDiscord } from "react-icons/fa";
import { getState, useDiscordState } from "./backend";
import { DiscordPage, DISCORD_ROUTE } from "./components/DiscordPage";
import { UpdateSection } from "./components/UpdateSection";
import { VoicePanel } from "./components/VoicePanel";
import {
  destroyDiscordView,
  resetDiscordViewSize,
  setDiscordViewSize,
  showKeyboard,
} from "./discordView";
import {
  isFamilyViewLocked,
  onFamilyViewChange,
  startFamilyViewWatch,
  stopFamilyViewWatch,
} from "./familyView";
import { startMicRelay } from "./mic";
import { restorePttListener, stopPttListener } from "./pushToTalk";
import { startDiscord, startLifecycleWatch } from "./lifecycle";
import { checkForUpdate, getVersion, takeFinishedUpdate } from "./updater";

function Content() {
  const state = useDiscordState();
  return (
    <>
      <VoicePanel state={state} />
      <UpdateSection />
    </>
  );
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
    restartTimer = setTimeout(() => startDiscord(), 2000);
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

  // Discord can't load while Family View is locked, so wait for it to be
  // unlocked, then start Discord fresh unless it's already up.
  startFamilyViewWatch();
  onFamilyViewChange(async (locked) => {
    if (locked) return;
    const state = await getState().catch(() => undefined);
    if (!state?.attached || !state.ready) startDiscord();
  });

  const stopLifecycleWatch = startLifecycleWatch();
  if (!isFamilyViewLocked()) startDiscord();

  // Right after an update Decky reloads the plugin, so this is a fresh start:
  // confirm it, and don't offer the update that was just installed.
  const updatingTo = takeFinishedUpdate();
  getVersion()
    .then((version) => {
      if (updatingTo && updatingTo === version) {
        toaster.toast({ title: "Discord", body: `Updated to ${version}. Discord is restarting.` });
        return null;
      }
      // Otherwise let the user know about a new release once per boot.
      return checkForUpdate();
    })
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
    // Discord's brand color ("blurple").
    icon: <FaDiscord color="#5865F2" />,
    onDismount() {
      clearTimeout(restartTimer);
      stopLifecycleWatch();
      removeEventListener("show_keyboard", onKeyboard);
      removeEventListener("tab_lost", onTabLost);
      settingsReg.unregister();
      stopPttListener();
      stopFamilyViewWatch();
      stopMicRelay();
      destroyDiscordView();
      routerHook.removeRoute(DISCORD_ROUTE);
    },
  };
});
