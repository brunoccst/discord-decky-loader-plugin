import {
  ButtonItem,
  DropdownItem,
  Navigation,
  PanelSection,
  PanelSectionRow,
  ToggleField,
} from "@decky/ui";
import { toaster } from "@decky/api";
import { useEffect, useState } from "react";
import {
  FaHeadphones,
  FaMicrophone,
  FaMicrophoneSlash,
  FaPhoneSlash,
  FaVolumeMute,
  FaVolumeUp,
} from "react-icons/fa";
import { command, DiscordState, Guild, VoiceChannel } from "../backend";
import { DISCORD_ROUTE } from "./DiscordPage";
import { applyPttSettings, loadPttSettings, PTT_BUTTONS, PttSettings } from "../pushToTalk";

const run = async (name: string, args: Record<string, unknown> = {}) => {
  try {
    return await command(name, args);
  } catch (e) {
    toaster.toast({ title: "Discord", body: String(e) });
    return null;
  }
};

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
        <ButtonItem layout="below" onClick={() => run("disconnect")}>
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
    if (!guildId) return setChannels([]);
    localStorage.setItem(LAST_GUILD_KEY, guildId);
    run("voiceChannels", { guildId }).then((c) => setChannels((c as VoiceChannel[] | null) ?? []));
  }, [guildId, currentChannelId]);

  return (
    <PanelSection title="Join a voice channel">
      <PanelSectionRow>
        <DropdownItem
          label="Server"
          strDefaultLabel="Pick a server"
          rgOptions={guilds.map((g) => ({ data: g.id, label: g.name }))}
          selectedOption={guildId}
          onChange={(opt) => setGuildId(opt.data)}
        />
      </PanelSectionRow>
      {guildId && channels.length === 0 && (
        <PanelSectionRow>
          <div>No voice channels you can see here.</div>
        </PanelSectionRow>
      )}
      {channels.map((c) => (
        <PanelSectionRow key={c.id}>
          <ButtonItem
            layout="below"
            disabled={c.id === currentChannelId}
            onClick={() => run("join", { channelId: c.id })}
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
          <DropdownItem
            label="Button"
            rgOptions={PTT_BUTTONS}
            selectedOption={settings.button}
            onChange={(opt) => update({ ...settings, button: opt.data })}
          />
        </PanelSectionRow>
      )}
    </PanelSection>
  );
}

// If Discord never reports ready (e.g. its page changed), let the user open it anyway.
function Starting() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 15000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <PanelSection>
      <PanelSectionRow>
        <div>Starting Discord…</div>
      </PanelSectionRow>
      {slow && <OpenDiscordButton />}
    </PanelSection>
  );
}

export function VoicePanel({ state }: { state: DiscordState }) {
  if (!state.attached || !state.ready) {
    return <Starting />;
  }

  if (!state.loggedIn) {
    return (
      <PanelSection title="Sign in">
        <PanelSectionRow>
          <div>
            Open Discord once to sign in. The quickest way is to scan the QR code with the
            Discord app on your phone.
          </div>
        </PanelSectionRow>
        <OpenDiscordButton label="Open Discord to sign in" />
      </PanelSection>
    );
  }

  return (
    <>
      <CurrentCall state={state} />
      <JoinVoice currentChannelId={state.voice?.channelId} />
      <PushToTalk />
      <PanelSection title={`Signed in as ${state.user?.name ?? ""}`}>
        <OpenDiscordButton />
      </PanelSection>
    </>
  );
}
