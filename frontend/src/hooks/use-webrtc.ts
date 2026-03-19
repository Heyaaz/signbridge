"use client";

import { useEffect, useRef, useState } from "react";
import { Socket } from "socket.io-client";
import { getIceServers } from "@/lib/api";

const FALLBACK_RTC_CONFIGURATION: RTCConfiguration = {
  iceServers: [
    {
      urls: ["stun:stun.l.google.com:19302"]
    }
  ]
};

async function fetchRtcConfiguration(sessionToken: string): Promise<RTCConfiguration> {
  try {
    const { iceServers } = await getIceServers(sessionToken);
    return { iceServers };
  } catch {
    console.warn("[WebRTC] Failed to fetch ICE servers, using STUN fallback");
    return FALLBACK_RTC_CONFIGURATION;
  }
}

interface UseWebRtcOptions {
  roomId: string;
  sessionId: string;
  sessionToken: string;
  socket: Socket | null;
  participantCount: number;
  shouldCreateOffer: boolean;
}

export function useWebRtc({
  roomId,
  sessionId,
  sessionToken,
  socket,
  participantCount,
  shouldCreateOffer
}: UseWebRtcOptions) {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const offerCreatedRef = useRef(false);
  const [mediaStatus, setMediaStatus] = useState("camera not started");
  const [peerReady, setPeerReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    offerCreatedRef.current = false;

    async function prepareMedia() {
      try {
        const [localStream, rtcConfiguration] = await Promise.all([
          navigator.mediaDevices.getUserMedia({ audio: true, video: true }),
          fetchRtcConfiguration(sessionToken)
        ]);

        if (!mounted) {
          localStream.getTracks().forEach((track) => track.stop());
          return;
        }

        localStreamRef.current = localStream;

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStream;
        }

        const peerConnection = new RTCPeerConnection(rtcConfiguration);
        peerConnectionRef.current = peerConnection;
        setPeerReady(true);

        localStream.getTracks().forEach((track) => {
          peerConnection.addTrack(track, localStream);
        });

        peerConnection.ontrack = (event) => {
          const [remoteStream] = event.streams;

          if (remoteVideoRef.current && remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
          }
        };

        peerConnection.onicecandidate = (event) => {
          if (!event.candidate || !socket) {
            return;
          }

          socket.emit("webrtc:ice-candidate", {
            roomId,
            candidate: event.candidate.toJSON()
          });
        };

        peerConnection.onconnectionstatechange = () => {
          setMediaStatus(`webrtc ${peerConnection.connectionState}`);
        };

        setMediaStatus("camera ready");
      } catch (error) {
        const message = error instanceof Error ? error.message : "media error";
        setMediaStatus(`camera error: ${message}`);
      }
    }

    void prepareMedia();

    return () => {
      mounted = false;
      setPeerReady(false);
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      peerConnectionRef.current?.close();
      localStreamRef.current = null;
      peerConnectionRef.current = null;
    };
  }, [roomId, sessionToken, socket]);

  useEffect(() => {
    if (!socket || !peerConnectionRef.current || !peerReady) {
      return;
    }

    const activeSocket = socket;

    async function handleOffer(payload: { sdp: RTCSessionDescriptionInit }) {
      try {
        await peerConnectionRef.current?.setRemoteDescription(payload.sdp);
        const answer = await peerConnectionRef.current?.createAnswer();

        if (!answer) {
          return;
        }

        await peerConnectionRef.current?.setLocalDescription(answer);
        activeSocket.emit("webrtc:answer", { roomId, sdp: answer });
      } catch (error) {
        console.error("[WebRTC] handleOffer failed", error);
      }
    }

    async function handleAnswer(payload: { sdp: RTCSessionDescriptionInit }) {
      try {
        await peerConnectionRef.current?.setRemoteDescription(payload.sdp);
      } catch (error) {
        console.error("[WebRTC] handleAnswer failed", error);
      }
    }

    async function handleIceCandidate(payload: { candidate: RTCIceCandidateInit }) {
      if (!payload.candidate) {
        return;
      }

      try {
        await peerConnectionRef.current?.addIceCandidate(payload.candidate);
      } catch (error) {
        console.error("[WebRTC] handleIceCandidate failed", error);
      }
    }

    activeSocket.on("webrtc:offer", handleOffer);
    activeSocket.on("webrtc:answer", handleAnswer);
    activeSocket.on("webrtc:ice-candidate", handleIceCandidate);

    return () => {
      activeSocket.off("webrtc:offer", handleOffer);
      activeSocket.off("webrtc:answer", handleAnswer);
      activeSocket.off("webrtc:ice-candidate", handleIceCandidate);
    };
  }, [peerReady, roomId, socket, sessionId]);

  useEffect(() => {
    async function createOffer() {
      if (
        !socket ||
        !peerConnectionRef.current ||
        !peerReady ||
        !shouldCreateOffer ||
        participantCount < 2
      ) {
        return;
      }

      if (offerCreatedRef.current) {
        return;
      }

      offerCreatedRef.current = true;

      try {
        const offer = await peerConnectionRef.current.createOffer();
        await peerConnectionRef.current.setLocalDescription(offer);

        socket.emit("webrtc:offer", { roomId, sdp: offer });
      } catch (error) {
        console.error("[WebRTC] createOffer failed", error);
        offerCreatedRef.current = false;
      }
    }

    void createOffer();
  }, [participantCount, peerReady, roomId, shouldCreateOffer, socket]);

  return {
    localVideoRef,
    remoteVideoRef,
    mediaStatus
  };
}
