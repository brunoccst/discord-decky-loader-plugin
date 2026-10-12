// Injected into the hidden Discord web client tab before Discord's own scripts run.
// It reads Discord's internal stores, dispatches voice actions, relays the
// microphone from the Steam UI, and reports state back to the plugin backend
// through the `discordDeckEmit` DevTools binding. No third-party client mod is used.
(() => {
  if (window.top !== window || window.__discordDeck) return;

  if (!Object.hasOwn) {
    Object.hasOwn = (obj, prop) => Object.prototype.hasOwnProperty.call(obj, prop);
  }

  const emit = (msg) => {
    try {
      window.discordDeckEmit(JSON.stringify(msg));
    } catch (e) {
      console.warn("[discord-deck] emit failed", e);
    }
  };

  // --- Webpack module access -------------------------------------------------

  // Discord runs several webpack runtimes on the same chunk array and each one
  // calls our callback, so keep the one with the most loaded modules (the app).
  // Not cached: early on only the small login runtime exists.
  let currentWreq;
  const getWreq = () => {
    const chunk = window.webpackChunkdiscord_app;
    if (!chunk || typeof chunk.push !== "function") return undefined;
    let best;
    chunk.push([[Symbol("discord-deck")], {}, (r) => {
      if (r?.c && (!best || Object.keys(r.c).length > Object.keys(best.c).length)) best = r;
    }]);
    chunk.pop();
    if (best && best !== currentWreq) {
      // A bigger runtime appeared (e.g. after signing in): drop lookups made
      // against the old one so stores and the dispatcher come from the app.
      currentWreq = best;
      resetLookups();
    }
    return best;
  };

  function* allExports() {
    const cache = getWreq()?.c;
    if (!cache) return;
    for (const id in cache) {
      const exp = cache[id]?.exports;
      if (!exp || exp === window) continue;
      yield exp;
      if (typeof exp !== "object") continue;
      for (const key in exp) {
        let value;
        try { value = exp[key]; } catch { continue; }
        if (value && value !== window) yield value;
      }
    }
  }

  const find = (filter) => {
    for (const exp of allExports()) {
      try { if (filter(exp)) return exp; } catch { /* ignore odd modules */ }
    }
    return undefined;
  };

  let stores = {};
  const store = (name) =>
    (stores[name] ??= find((e) => typeof e === "object" &&
      (e.getName?.() === name || e.constructor?.displayName === name)));

  let flux;
  const getFlux = () =>
    (flux ??= find((e) => typeof e === "object" &&
      typeof e.dispatch === "function" &&
      typeof e.subscribe === "function" &&
      typeof e.unsubscribe === "function" &&
      typeof e.register === "function"));

  function resetLookups() {
    stores = {};
    flux = undefined;
    subscribed = false;
  }

  const dispatch = (action) => {
    const f = getFlux();
    if (!f) throw new Error("Discord is not ready yet");
    return f.dispatch(action);
  };

  // --- State snapshot --------------------------------------------------------

  const displayName = (u, fallback) => u?.globalName ?? u?.global_name ?? u?.username ?? fallback;

  const snapshot = () => {
    const users = store("UserStore");
    const me = users?.getCurrentUser?.();
    if (!me) {
      // The login/QR page only loads a small bundle without UserStore, so treat it as ready.
      const onAuthPage = /^\/(login|register)\b/.test(location.pathname);
      return { ready: onAuthPage || !!users, loggedIn: false };
    }

    const selected = store("SelectedChannelStore");
    const channels = store("ChannelStore");
    const guilds = store("GuildStore");
    const voiceStates = store("VoiceStateStore");
    const media = store("MediaEngineStore");

    const voiceChannelId = selected?.getVoiceChannelId?.() ?? null;
    let voice = null;
    if (voiceChannelId) {
      const channel = channels?.getChannel?.(voiceChannelId);
      const guild = channel?.guild_id ? guilds?.getGuild?.(channel.guild_id) : null;
      const states = voiceStates?.getVoiceStatesForChannel?.(voiceChannelId) ?? {};
      voice = {
        channelId: voiceChannelId,
        channelName: channel?.name || "Call",
        guildName: guild?.name ?? null,
        members: Object.values(states).map((s) => ({
          id: s.userId,
          name: displayName(users.getUser?.(s.userId), s.userId),
          muted: !!(s.selfMute || s.mute),
          deafened: !!(s.selfDeaf || s.deaf),
        })),
      };
    }

    return {
      ready: true,
      loggedIn: true,
      user: { id: me.id, name: displayName(me, me.id), avatar: me.avatar ?? null },
      muted: !!media?.isSelfMute?.(),
      deafened: !!media?.isSelfDeaf?.(),
      voice,
      screen: { width: window.screen.width, height: window.screen.height },
    };
  };

  let lastSent = "";
  const pushState = () => {
    let state;
    try { state = snapshot(); } catch (e) { state = { ready: false, loggedIn: false, error: String(e) }; }
    const json = JSON.stringify(state);
    if (json === lastSent) return;
    lastSent = json;
    emit({ type: "state", state });
  };

  let pushTimer;
  const schedulePush = () => {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushState, 150);
  };

  const WATCHED_EVENTS = [
    "CONNECTION_OPEN",
    "LOGOUT",
    "VOICE_STATE_UPDATES",
    "VOICE_CHANNEL_SELECT",
    "AUDIO_TOGGLE_SELF_MUTE",
    "AUDIO_TOGGLE_SELF_DEAF",
    "RTC_CONNECTION_STATE",
  ];

  let subscribed = false;
  const trySubscribe = () => {
    if (subscribed) return;
    const f = getFlux();
    if (!f) return;
    for (const type of WATCHED_EVENTS) f.subscribe(type, schedulePush);
    subscribed = true;
  };

  // Event subscriptions keep the panel live; the interval is a cheap safety net
  // (pushState only emits when something actually changed).
  setInterval(() => {
    trySubscribe();
    pushState();
  }, 3000);

  // --- Microphone relay ------------------------------------------------------
  // Steam's embedded browser views can't open the mic themselves, so the Steam UI
  // (which can) captures it and streams it here over a local WebRTC connection.

  const originalGetUserMedia = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
  let micStream = null;
  let micPending = null;
  let resolveMicAnswer = null;

  const waitForIce = (pc) => new Promise((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    pc.addEventListener("icegatheringstatechange", () => {
      if (pc.iceGatheringState === "complete") resolve();
    });
    setTimeout(resolve, 2000);
  });

  const relayedMic = () => {
    if (micStream && micStream.getAudioTracks().some((t) => t.readyState === "live")) {
      return Promise.resolve(micStream);
    }
    if (micPending) return micPending;

    micPending = (async () => {
      const pc = new RTCPeerConnection();
      pc.addTransceiver("audio", { direction: "recvonly" });
      const gotStream = new Promise((resolve) => {
        pc.ontrack = (e) => resolve(e.streams[0] ?? new MediaStream([e.track]));
      });
      const answer = new Promise((resolve, reject) => {
        resolveMicAnswer = resolve;
        setTimeout(() => reject(new Error("Microphone relay timed out")), 15000);
      });

      await pc.setLocalDescription(await pc.createOffer());
      await waitForIce(pc);
      emit({ type: "micOffer", sdp: pc.localDescription.toJSON() });
      await pc.setRemoteDescription(await answer);

      const stream = await gotStream;
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") micStream = null;
      };
      micStream = stream;
      return stream;
    })().finally(() => {
      micPending = null;
      resolveMicAnswer = null;
    });
    return micPending;
  };

  if (navigator.mediaDevices) {
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      if (constraints?.audio && !constraints?.video) {
        const stream = await relayedMic();
        // Hand out clones so Discord stopping a track doesn't kill the relay.
        return new MediaStream(stream.getAudioTracks().map((t) => t.clone()));
      }
      return originalGetUserMedia(constraints);
    };
  }

  // --- On-screen keyboard ----------------------------------------------------

  document.addEventListener("focusin", (e) => {
    const el = e.target;
    if (!(el instanceof HTMLElement)) return;
    if (el.matches("input, textarea, [contenteditable=true], [role=textbox]")) {
      emit({ type: "keyboard" });
    }
  }, true);

  // --- Commands from the plugin ------------------------------------------------

  const voiceChannelSelect = (guildId, channelId) => dispatch({
    type: "VOICE_CHANNEL_SELECT",
    guildId,
    channelId,
    currentVoiceChannelId: store("SelectedChannelStore")?.getVoiceChannelId?.() ?? null,
    video: false,
    stream: false,
  });

  const commands = {
    state: () => snapshot(),

    toggleMute: () => dispatch({ type: "AUDIO_TOGGLE_SELF_MUTE", context: "default", syncRemote: true }),

    toggleDeafen: () => dispatch({ type: "AUDIO_TOGGLE_SELF_DEAF", context: "default", syncRemote: true }),

    disconnect: () => voiceChannelSelect(null, null),

    join: ({ channelId }) => {
      const channel = store("ChannelStore")?.getChannel?.(channelId);
      if (!channel) throw new Error("Unknown channel");
      voiceChannelSelect(channel.guild_id ?? null, channel.id);
    },

    guilds: () => {
      const all = store("GuildStore")?.getGuilds?.() ?? {};
      return Object.values(all)
        .map((g) => ({ id: g.id, name: g.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },

    voiceChannels: ({ guildId }) => {
      const grouped = store("GuildChannelStore")?.getChannels?.(guildId);
      const voiceStates = store("VoiceStateStore");
      return (grouped?.VOCAL ?? [])
        .map((entry) => entry.channel ?? entry)
        .filter((c) => c?.id)
        .map((c) => ({
          id: c.id,
          name: c.name,
          memberCount: Object.keys(voiceStates?.getVoiceStatesForChannel?.(c.id) ?? {}).length,
        }));
    },

    setPushToTalk: ({ enabled }) => {
      const media = store("MediaEngineStore");
      dispatch({
        type: "AUDIO_SET_MODE",
        context: "default",
        mode: enabled ? "PUSH_TO_TALK" : "VOICE_ACTIVITY",
        options: media?.getSettings?.()?.modeOptions ?? {},
      });
    },

    pushToTalk: ({ pressed }) => {
      const connections = store("MediaEngineStore")?.getMediaEngine?.()?.connections;
      if (!connections) return;
      for (const conn of connections.values ? connections.values() : connections) {
        conn?.setForceAudioInput?.(!!pressed);
      }
    },

    micAnswer: ({ sdp }) => {
      if (resolveMicAnswer) resolveMicAnswer(sdp);
    },
  };

  window.__discordDeck = {
    run: async (name, args) => {
      const command = commands[name];
      if (!command) throw new Error(`Unknown command: ${name}`);
      const result = await command(args ?? {});
      schedulePush();
      return result ?? null;
    },
  };
})();
