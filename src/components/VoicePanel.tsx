import {
  ButtonItem,
  Navigation,
  PanelSection,
  PanelSectionRow,
  ToggleField,
} from "@decky/ui";
import { toaster } from "@decky/api";
import { useEffect, useState } from "react";
import {
  FaArrowLeft,
  FaHeadphones,
  FaMicrophone,
  FaMicrophoneSlash,
  FaPhoneSlash,
  FaVolumeMute,
  FaVolumeUp,
} from "react-icons/fa";
import { command, DiscordState, Guild, VoiceChannel } from "../backend";
import { DISCORD_ROUTE } from "./DiscordPage";
import { useFamilyViewLocked } from "../familyView";
import { startDiscord } from "../lifecycle";
import { useSecondsSince, useStartupPhase } from "../startup";
import { applyPttSettings, loadPttSettings, PTT_BUTTONS, PttSettings } from "../pushToTalk";

// Runs a bridge command; on failure shows the error and returns undefined.
const run = async (name: string, args: Record<string, unknown> = {}) => {
  try {
    return await command(name, args);
  } catch (e) {
    toaster.toast({ title: "Discord", body: String(e) });
    return undefined;
  }
};

// Waits for Discord to report the voice channel we asked for. Polled from here
// because timers inside the hidden Discord page are throttled.
async function confirmVoiceChannel(channelId: string | null) {
  for (let i = 0; i < 16; i++) {
    const state = await command<DiscordState>("state").catch(() => null);
    if ((state?.voice?.channelId ?? null) === channelId) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function joinVoice(channelId: string) {
  if ((await run("join", { channelId })) === undefined) return;
  if (!(await confirmVoiceChannel(channelId))) {
    toaster.toast({
      title: "Discord",
      body: "Discord didn't join the voice channel. Open full Discord to see why.",
    });
  }
}

async function leaveVoice() {
  if ((await run("disconnect")) === undefined) return;
  if (!(await confirmVoiceChannel(null))) {
    toaster.toast({ title: "Discord", body: "Discord didn't leave the call. Try again." });
  }
}

const openDiscord = () => {
  Navigation.Navigate(DISCORD_ROUTE);
  Navigation.CloseSideMenus();
};

function OpenDiscordButton({ label = "Open Discord" }: { label?: string }) {
  return (
    <PanelSectionRow>
      <ButtonItem layout="below" onClick={openDiscord}>
        {label}
      </ButtonItem>
    </PanelSectionRow>
  );
}

function CurrentCall({ state }: { state: DiscordState }) {
  const voice = state.voice;
  if (!voice) {
    return (
      <PanelSection title="Voice">
        <PanelSectionRow>
          <div>Not in a voice channel.</div>
        </PanelSectionRow>
      </PanelSection>
    );
  }

  return (
    <PanelSection title={voice.guildName ? `${voice.channelName} · ${voice.guildName}` : voice.channelName}>
      <PanelSectionRow>
        <ButtonItem layout="below" onClick={() => run("toggleMute")}>
          {state.muted ? <><FaMicrophoneSlash /> Unmute</> : <><FaMicrophone /> Mute</>}
        </ButtonItem>
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem layout="below" onClick={() => run("toggleDeafen")}>
          {state.deafened ? <><FaVolumeMute /> Undeafen</> : <><FaHeadphones /> Deafen</>}
        </ButtonItem>
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem layout="below" onClick={leaveVoice}>
          <FaPhoneSlash /> Leave call
        </ButtonItem>
      </PanelSectionRow>
      {voice.members.map((m) => (
        <PanelSectionRow key={m.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{m.name}</span>
            <span>
              {m.deafened ? <FaVolumeMute /> : m.muted ? <FaMicrophoneSlash /> : <FaVolumeUp />}
            </span>
          </div>
        </PanelSectionRow>
      ))}
    </PanelSection>
  );
}

const LAST_GUILD_KEY = "discord-deck:last-guild";

function JoinVoice({ currentChannelId }: { currentChannelId?: string }) {
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [guildId, setGuildId] = useState<string | null>(localStorage.getItem(LAST_GUILD_KEY));
  const [channels, setChannels] = useState<VoiceChannel[]>([]);

  useEffect(() => {
    run("guilds").then((g) => setGuilds((g as Guild[] | null) ?? []));
  }, []);

  useEffect(() => {
    if (!guildId) {
      localStorage.removeItem(LAST_GUILD_KEY);
      setChannels([]);
      return;
    }
    localStorage.setItem(LAST_GUILD_KEY, guildId);
    run("voiceChannels", { guildId }).then((c) => setChannels((c as VoiceChannel[] | null) ?? []));
  }, [guildId, currentChannelId]);

  const guild = guilds.find((g) => g.id === guildId);

  // A plain list of buttons instead of a dropdown: it's easier to drive with the
  // D-pad, and Steam's dropdown didn't register selections inside this panel.
  if (!guildId) {
    return (
      <PanelSection title="Join a voice channel">
        {guilds.length === 0 && (
          <PanelSectionRow>
            <div>Loading servers…</div>
          </PanelSectionRow>
        )}
        {guilds.map((g) => (
          <PanelSectionRow key={g.id}>
            <ButtonItem layout="below" onClick={() => setGuildId(g.id)}>
              {g.name}
            </ButtonItem>
          </PanelSectionRow>
        ))}
      </PanelSection>
    );
  }

  return (
    <PanelSection title={guild ? `Voice channels · ${guild.name}` : "Voice channels"}>
      <PanelSectionRow>
        <ButtonItem layout="below" onClick={() => setGuildId(null)}>
          <FaArrowLeft /> Pick another server
        </ButtonItem>
      </PanelSectionRow>
      {channels.length === 0 && (
        <PanelSectionRow>
          <div>No voice channels you can see here.</div>
        </PanelSectionRow>
      )}
      {channels.map((c) => (
        <PanelSectionRow key={c.id}>
          <ButtonItem
            layout="below"
            disabled={c.id === currentChannelId}
            onClick={() => joinVoice(c.id)}
          >
            <FaVolumeUp /> {c.name}
            {c.memberCount > 0 ? ` (${c.memberCount})` : ""}
          </ButtonItem>
        </PanelSectionRow>
      ))}
    </PanelSection>
  );
}

function PushToTalk() {
  const [settings, setSettings] = useState<PttSettings>(loadPttSettings);

  const update = (next: PttSettings) => {
    setSettings(next);
    applyPttSettings(next).catch((e) => toaster.toast({ title: "Discord", body: String(e) }));
  };

  // Cycles R4 → R5 → L4 → L5 on each press.
  const nextButton = () => {
    const i = PTT_BUTTONS.findIndex((b) => b.data === settings.button);
    update({ ...settings, button: PTT_BUTTONS[(i + 1) % PTT_BUTTONS.length].data });
  };

  return (
    <PanelSection title="Push to talk">
      <PanelSectionRow>
        <ToggleField
          label="Push to talk"
          description="Hold a back button to talk."
          checked={settings.enabled}
          onChange={(enabled) => update({ ...settings, enabled })}
        />
      </PanelSectionRow>
      {settings.enabled && (
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={nextButton}>
            Talk button: {PTT_BUTTONS.find((b) => b.data === settings.button)?.label ?? "R5"}
          </ButtonItem>
        </PanelSectionRow>
      )}
    </PanelSection>
  );
}

// If Discord never reports ready (e.g. its page changed), let the user open it anyway.
function StatusLine({ step, text }: { step: string; text: string }) {
  return (
    <PanelSectionRow>
      <div>
        <div style={{ fontWeight: "bold" }}>{step}</div>
        <div style={{ opacity: 0.8 }}>{text}</div>
      </div>
    </PanelSectionRow>
  );
}

// Startup progress, one clear step at a time. Discord restarts itself once if
// loading stalls, so the user only has to act if that also fails.
function Starting({ state }: { state: DiscordState }) {
  const phase = useStartupPhase();
  const seconds = useSecondsSince(phase.kind === "loading" ? phase.since : undefined);

  if (phase.kind === "error") {
    return (
      <PanelSection title="Discord">
        <StatusLine step="Something went wrong" text={phase.message} />
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => startDiscord()}>
            Try again
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>
    );
  }

  let step = "Step 1 of 3: Preparing";
  let text = "Setting up a hidden window for Discord.";
  if (phase.kind === "connecting") {
    step = "Step 2 of 3: Connecting";
    text = "Hooking the plugin up to the Discord window.";
  } else if (phase.kind === "loading" || state.attached) {
    step = "Step 3 of 3: Loading Discord";
    text = phase.kind === "loading" && phase.retried
      ? `That took too long, so Discord was restarted. Loading again… ${seconds}s`
      : `Downloading and starting Discord. This can take up to a minute. ${seconds}s`;
  }

  return (
    <PanelSection title="Discord">
      <StatusLine step={step} text={text} />
    </PanelSection>
  );
}

function FamilyViewNotice() {
  return (
    <PanelSection title="Family View is on">
      <PanelSectionRow>
        <div>
          Discord can't open while Steam Family View is on. Unlock Family View with your PIN,
          then come back here.
        </div>
      </PanelSectionRow>
    </PanelSection>
  );
}

export function VoicePanel({ state }: { state: DiscordState }) {
  const familyViewLocked = useFamilyViewLocked();
  if (familyViewLocked) return <FamilyViewNotice />;

  if (!state.attached || !state.ready) {
    return <Starting state={state} />;
  }

  if (!state.loggedIn) {
    return (
      <PanelSection title="Discord">
        <StatusLine
          step="Sign in needed"
          text="Discord is ready but you're not signed in. Tap below, then scan the QR code with the Discord app on your phone. You only need to do this once."
        />
        <OpenDiscordButton label="Sign in to Discord" />
      </PanelSection>
    );
  }

  return (
    <>
      <CurrentCall state={state} />
      <JoinVoice currentChannelId={state.voice?.channelId} />
      <PushToTalk />
      <PanelSection title={`Signed in as ${state.user?.name ?? ""}`}>
        <PanelSectionRow>
          <div style={{ opacity: 0.8 }}>
            For anything this panel can't do yet, like text chat, open the full Discord app.
          </div>
        </PanelSectionRow>
        <OpenDiscordButton label="Open full Discord" />
      </PanelSection>
    </>
  );
}
