import { Router } from "@decky/ui";

const BOOT_URL = "data:text/plain,discord-deck-boot";
// Same default size Deckcord uses for the Deck's built-in screen.
const DEFAULT_WIDTH = 860;
const DEFAULT_HEIGHT = 495;

let view: any;
let width = DEFAULT_WIDTH;
let height = DEFAULT_HEIGHT;
let keyboardCallbacks: any[] | undefined;

const mainWindow = () => Router.WindowStore?.GamepadUIMainWindowInstance as any;

// Shrinks the view while the on-screen keyboard is up so the text box stays visible.
const onKeyboardVisibility = (showing: boolean) => {
  view?.m_browserView?.SetBounds(0, 0, width, showing ? Math.round(height * 0.6) : height);
};

export function createDiscordView() {
  destroyDiscordView();
  const win = mainWindow();
  if (!win?.CreateBrowserView) throw new Error("Steam's browser view API is unavailable");

  view = win.CreateBrowserView("discord-deck");
  view.m_browserView.SetBounds(0, 0, width, height);
  view.m_browserView.SetVisible(false);
  view.m_browserView.LoadURL(BOOT_URL);

  keyboardCallbacks =
    win.m_VirtualKeyboardManager?.IsShowingVirtualKeyboard?.m_callbacks?.m_vecCallbacks;
  keyboardCallbacks?.push(onKeyboardVisibility);
}

export function destroyDiscordView() {
  if (keyboardCallbacks) {
    const i = keyboardCallbacks.indexOf(onKeyboardVisibility);
    if (i >= 0) keyboardCallbacks.splice(i, 1);
    keyboardCallbacks = undefined;
  }
  if (!view) return;
  try {
    view.m_browserView.SetVisible(false);
    view.Destroy();
  } catch (e) {
    console.warn("[discord-deck] failed to destroy view", e);
  }
  view = undefined;
}

export const hasDiscordView = () => !!view;

export function showDiscordView(visible: boolean) {
  view?.m_browserView?.SetVisible(visible);
  view?.m_browserView?.SetFocus(visible);
}

export function setDiscordViewSize(w: number, h: number) {
  width = w;
  height = h;
  view?.m_browserView?.SetBounds(0, 0, width, height);
}

export function resetDiscordViewSize() {
  setDiscordViewSize(DEFAULT_WIDTH, DEFAULT_HEIGHT);
}

export function showKeyboard() {
  view?.m_virtualKeyboardHost?.m_showKeyboard?.();
}
