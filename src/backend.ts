import { addEventListener, call, callable, removeEventListener } from "@decky/api";
import { useEffect, useState } from "react";

export interface VoiceMember {
  id: string;
  name: string;
  muted: boolean;
  deafened: boolean;
}

export interface DiscordState {
  attached: boolean;
  ready?: boolean;
  loggedIn?: boolean;
  user?: { id: string; name: string; avatar: string | null };
  muted?: boolean;
  deafened?: boolean;
  voice?: {
    channelId: string;
    channelName: string;
    guildName: string | null;
    members: VoiceMember[];
  } | null;
  screen?: { width: number; height: number };
}

export interface Guild {
  id: string;
  name: string;
}

export interface VoiceChannel {
  id: string;
  name: string;
  memberCount: number;
}

export const attach = callable<[], boolean>("attach");
export const getState = callable<[], DiscordState>("get_state");

// Runs a command inside the Discord tab (see defaults/bridge.js).
export const command = <T = null>(name: string, args: Record<string, unknown> = {}) =>
  call<[string, Record<string, unknown>], T>("command", name, args);

export function useDiscordState() {
  const [state, setState] = useState<DiscordState>({ attached: false });

  useEffect(() => {
    getState().then(setState).catch(() => {});
    const onState = (s: DiscordState) => setState(s);
    const onLost = () => setState({ attached: false });
    addEventListener<[DiscordState]>("state", onState);
    addEventListener("tab_lost", onLost);
    return () => {
      removeEventListener("state", onState);
      removeEventListener("tab_lost", onLost);
    };
  }, []);

  return state;
}
