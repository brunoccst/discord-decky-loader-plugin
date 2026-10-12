import { command } from "./backend";

export interface PttSettings {
  enabled: boolean;
  button: number;
}

// Values from Steam's ControllerInputGamepadButton enum.
export const PTT_BUTTONS = [
  { label: "R4", data: 45 },
  { label: "R5", data: 33 },
  { label: "L4", data: 44 },
  { label: "L5", data: 32 },
];

const STORAGE_KEY = "discord-deck:ptt";
let unregister: (() => void) | undefined;

export function loadPttSettings(): PttSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return { enabled: !!saved.enabled, button: saved.button ?? 33 };
  } catch {
    return { enabled: false, button: 33 };
  }
}

function listen(button: number) {
  let pressed = false;
  const handle = (btn: number, down: boolean) => {
    if (btn !== button || down === pressed) return;
    pressed = down;
    command("pushToTalk", { pressed: down }).catch(() => {});
  };
  // Steam has passed both (index, button, pressed) and an array of {nA, bS}
  // events to this callback across client versions, so accept either.
  const reg = SteamClient.Input.RegisterForControllerInputMessages((...args: any[]) => {
    if (Array.isArray(args[0])) {
      for (const ev of args[0]) handle(ev.nA, !!ev.bS);
    } else {
      handle(args[1], !!args[2]);
    }
  });
  return () => reg.unregister();
}

export async function applyPttSettings(settings: PttSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  unregister?.();
  unregister = undefined;
  if (settings.enabled) unregister = listen(settings.button);
  await command("setPushToTalk", { enabled: settings.enabled });
}

// Re-registers the button listener on startup without touching Discord's mode.
export function restorePttListener() {
  const settings = loadPttSettings();
  if (settings.enabled) unregister = listen(settings.button);
}

export function stopPttListener() {
  unregister?.();
  unregister = undefined;
}
