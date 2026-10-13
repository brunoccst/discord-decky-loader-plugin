import { addEventListener, removeEventListener } from "@decky/api";
import { command } from "./backend";

// The Discord tab can't open the microphone itself, so the Steam UI captures it
// and streams it to the tab over a local WebRTC connection (see bridge.js).
let peer: RTCPeerConnection | undefined;
let micStream: MediaStream | undefined;

const waitForIce = (pc: RTCPeerConnection) =>
  new Promise<void>((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    pc.addEventListener("icegatheringstatechange", () => {
      if (pc.iceGatheringState === "complete") resolve();
    });
    setTimeout(resolve, 2000);
  });

async function answerOffer(offer: RTCSessionDescriptionInit) {
  try {
    peer?.close();
    micStream?.getTracks().forEach((t) => t.stop());

    const pc = new RTCPeerConnection();
    peer = pc;
    // Discord applies its own echo cancellation and noise suppression.
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      video: false,
    });
    micStream.getTracks().forEach((t) => pc.addTrack(t, micStream!));

    await pc.setRemoteDescription(offer);
    await pc.setLocalDescription(await pc.createAnswer());
    await waitForIce(pc);
    await command("micAnswer", { sdp: pc.localDescription!.toJSON() });
  } catch (e) {
    console.error("[discord-deck] microphone relay failed", e);
    // Tell the page right away so Discord doesn't sit waiting for the mic.
    await command("micAnswer", { error: String(e) }).catch(() => {});
  }
}

export function startMicRelay() {
  const listener = (offer: RTCSessionDescriptionInit) => void answerOffer(offer);
  addEventListener<[RTCSessionDescriptionInit]>("mic_offer", listener);
  return () => {
    removeEventListener("mic_offer", listener);
    peer?.close();
    micStream?.getTracks().forEach((t) => t.stop());
    peer = undefined;
    micStream = undefined;
  };
}
