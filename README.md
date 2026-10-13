# Discord Deck

A small [Decky Loader](https://decky.xyz) plugin that makes it easy to use Discord voice from the Steam Deck's Game Mode with just the controller: open Discord, join a voice channel, and mute or leave without touching a mouse.

It's deliberately simple. It isn't a full Discord client and there are no plans to make it one.

## Features

From the Quick Access Menu (`...` button):

- Join a voice channel: pick a server, then a channel.
- See the call you're in and who's in it.
- Mute, deafen and leave the call.
- Push to talk on a back button (R4, R5, L4 or L5).
- Open the full Discord page when you need it (for example to sign in).
- Check for updates and install them through Decky.

Discord stays connected in the background while you play.

## Install

1. Install [Decky Loader](https://decky.xyz) on your Steam Deck.
2. In Game Mode, open Decky's settings, turn on **Developer mode**, then go to **Developer** › **Install plugin from URL** and enter:

   ```
   https://github.com/brunoccst/discord-decky-loader-plugin/releases/latest/download/discord-deck.zip
   ```

3. Open **Discord Deck** from the Quick Access Menu. The first time, tap **Sign in to Discord** and scan the QR code with the Discord app on your phone. You only need to do this once.

If your Steam account uses **Family View**, unlock it first: Discord can't open while Family View is locked, and the plugin tells you when that's the case.

## Updates

The plugin checks this repository's GitHub releases when it starts, and has a **Check for updates** button at the bottom of its panel. Updates install through Decky's own installer, which asks you to confirm.

To publish a release, bump `version` in `package.json`, then run the **Release** workflow from the Actions tab with a matching tag such as `v1.0.1` (a hyphen, as in `v1.1.0-beta.1`, marks a pre-release). The repository must stay public, since Decky downloads updates without signing in to GitHub.

## How it works

| Piece | File | Role |
|---|---|---|
| Frontend | `src/` | The Quick Access Menu panel. Creates a hidden Steam browser view for Discord, relays the microphone, and listens for the push-to-talk button. |
| Backend | `main.py` | Connects to the hidden view over Steam's local DevTools endpoint (`127.0.0.1:8080`), loads `discord.com/app`, and passes commands and events between the panel and the page. |
| Bridge | `defaults/bridge.js` | Runs inside the Discord page, reads Discord's own state (user, voice, channels) and triggers Discord's own voice actions. No third-party client mod is used. |

Discord runs as its regular web app, loaded from discord.com each time the plugin starts. The microphone is captured by the Steam UI and relayed to the page, because Steam's hidden browser views can't open it themselves.

## Development

Requires Node.js 16.14+ and pnpm.

```bash
pnpm i
pnpm run build      # outputs dist/index.js
pnpm run typecheck
```

See the [Decky plugin template](https://github.com/SteamDeckHomebrew/decky-plugin-template) for deploying a development build to a Deck.

## Notes

- This is an unofficial integration, not affiliated with Discord. It uses your own signed-in session and Discord's own web app, but Discord can change its internals at any time and break things.
- The hidden browser view and microphone relay approach is based on [Deckcord](https://github.com/marios8543/Deckcord) by marios8543.

## License

[MIT](LICENSE): anyone can use, copy, change and share it, and it comes with no warranty. The author isn't responsible for anything that happens from using it.
