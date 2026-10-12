# Discord Deck

A [Decky Loader](https://decky.xyz) plugin that puts Discord in the Steam Deck's Game Mode, built to be used with the controller instead of a mouse.

## What it does (so far)

- Runs Discord's web client in a hidden Steam browser view, so it stays connected while you play.
- **Quick Access Menu** (`...` button):
  - See the call you're in and who's in it.
  - Mute, deafen and leave the call.
  - Pick a server and join one of its voice channels.
  - Push to talk on a back button (R4, R5, L4 or L5).
- Your microphone is captured by the Steam UI and relayed to the Discord tab, because Steam's embedded browser views can't open the mic on their own.
- **Open Discord** shows the full Discord page, used to sign in once (scan the QR code with the Discord phone app) or for anything the menu doesn't cover yet.

## Roadmap

1. ~~Voice controls in the Quick Access Menu~~
2. Controller-friendly browser for servers, channels and DMs.
3. Read and reply to messages with the on-screen keyboard.

## How it works

| Piece | File | Role |
|---|---|---|
| Frontend | `src/` | React UI in the Steam client (Quick Access Menu, `/discord-deck` route), creates the hidden browser view, relays the mic, listens for the push-to-talk button. |
| Backend | `main.py` | Connects to the browser view over Steam's local DevTools endpoint (`127.0.0.1:8080`), injects the bridge, loads `discord.com/app`, and forwards commands and events. |
| Bridge | `defaults/bridge.js` | Runs inside the Discord page. Reads Discord's internal stores (user, voice state, channels) and dispatches voice actions. No third-party client mod is downloaded or injected. |

## Development

Requires Node.js 16.14+ and pnpm.

```bash
pnpm i
pnpm run build      # outputs dist/index.js
pnpm run typecheck
```

Deploy to a Deck with the VS Code tasks in `.vscode/` (`setup`, `build`, `deploy`), configured through `.vscode/settings.json`. See the [Decky plugin template](https://github.com/SteamDeckHomebrew/decky-plugin-template) for details.

## Notes

- Driving Discord's web client like this is an unofficial integration. It uses your own logged-in session and Discord's own client actions, but Discord could change its internals at any time and break things.
- The approach (hidden browser view, mic relay) is based on [Deckcord](https://github.com/marios8543/Deckcord) by marios8543.
