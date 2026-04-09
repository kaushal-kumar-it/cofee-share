import React, { useEffect, useRef, useState } from 'react';
import { Header } from '@/components/Header';
import QRCode from 'qrcode';

const SERVER_URL = import.meta.env.VITE_WS_SERVER_URL || 'ws://localhost:8000';
const API_URL = import.meta.env.VITE_API_SERVER_URL || 'http://localhost:8000';

const CHUNK_SIZE = 16 * 1024;
const ACK_TIMEOUT_MS = 5000;
const MAX_RETRIES = 3;
const PACKET_MAGIC = 0x43465348;

type ActivityType = 'system' | 'error' | 'success' | 'info' | 'message';

type ActivityMessage = {
  text: string;
  type: ActivityType;
  timestamp: string;
};

type TransferControlMessage =
  | {
      kind: 'meta';
      fileId: string;
      name: string;
      size: number;
      mimeType: string;
      totalChunks: number;
      chunkSize: number;
      transport: 'webrtc' | 'websocket';
    }
  | {
      kind: 'ack';
      fileId: string;
      chunkIndex: number;
    }
  | {
      kind: 'complete';
      fileId: string;
    }
  | {
      kind: 'error';
      fileId: string;
      reason: string;
    };

type OutgoingTransfer = {
  file: File;
  fileId: string;
  totalChunks: number;
  nextChunkIndex: number;
  pendingAckIndex: number | null;
  retries: number;
  lastPacket: ArrayBuffer | null;
  startedAt: number;
  transport: 'webrtc' | 'websocket';
};

type IncomingTransfer = {
  fileId: string;
  name: string;
  size: number;
  mimeType: string;
  totalChunks: number;
  chunks: Array<Uint8Array | undefined>;
  receivedCount: number;
  receivedBytes: number;
  startedAt: number;
};

type ReceivedFile = {
  name: string;
  size: number;
  type: string;
  blob: Blob;
  url: string;
  receivedAt: Date;
};

const rtcConfig: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: [
        'turn:global.turn.metered.ca:80',
        'turn:global.turn.metered.ca:80?transport=tcp',
        'turn:global.turn.metered.ca:443',
        'turns:global.turn.metered.ca:443?transport=tcp'
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ]
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const createChunkPacket = (
  fileId: string,
  chunkIndex: number,
  totalChunks: number,
  payload: ArrayBuffer
): ArrayBuffer => {
  const fileIdBytes = textEncoder.encode(fileId);
  const payloadBytes = new Uint8Array(payload);

  const headerLength = 14 + fileIdBytes.length;
  const packet = new Uint8Array(headerLength + payloadBytes.length);
  const view = new DataView(packet.buffer);

  view.setUint32(0, PACKET_MAGIC);
  view.setUint32(4, chunkIndex);
  view.setUint32(8, totalChunks);
  view.setUint16(12, fileIdBytes.length);

  packet.set(fileIdBytes, 14);
  packet.set(payloadBytes, headerLength);

  return packet.buffer;
};

const parseChunkPacket = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  if (bytes.byteLength < 14) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = view.getUint32(0);
  if (magic !== PACKET_MAGIC) return null;

  const chunkIndex = view.getUint32(4);
  const totalChunks = view.getUint32(8);
  const fileIdLength = view.getUint16(12);
  const headerLength = 14 + fileIdLength;

  if (bytes.byteLength < headerLength) return null;

  const fileId = textDecoder.decode(bytes.subarray(14, headerLength));
  const payload = bytes.subarray(headerLength);

  return { fileId, chunkIndex, totalChunks, payload };
};

const toArrayBuffer = async (value: unknown): Promise<ArrayBuffer | null> => {
  if (value instanceof ArrayBuffer) return value;
  if (value instanceof Blob) return value.arrayBuffer();
  if (ArrayBuffer.isView(value)) {
    const copy = new Uint8Array(value.byteLength);
    copy.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    return copy.buffer;
  }
  return null;
};

const generateFileId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `file-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const UploadReliable = () => {
  const [clientId, setClientId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState('');
  const [inputRoomId, setInputRoomId] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isWsReady, setIsWsReady] = useState(false);
  const [role, setRole] = useState<'sender' | 'receiver' | null>(null);
  const [roomSize, setRoomSize] = useState(0);
  const [connectionState, setConnectionState] = useState('disconnected');
  const [messages, setMessages] = useState<ActivityMessage[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sendProgress, setSendProgress] = useState(0);
  const [receiveProgress, setReceiveProgress] = useState(0);
  const [receivedFiles, setReceivedFiles] = useState<ReceivedFile[]>([]);
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferSpeed, setTransferSpeed] = useState(0);
  const [dataChannelReady, setDataChannelReady] = useState(false);
  const [hasPeer, setHasPeer] = useState(false);
  const [pendingRoomId, setPendingRoomId] = useState<string | null>(null);
  const [joinLink, setJoinLink] = useState('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');

  const ws = useRef<WebSocket | null>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const dataChannel = useRef<RTCDataChannel | null>(null);
  const remoteClientId = useRef<string | null>(null);

  const outgoingTransferRef = useRef<OutgoingTransfer | null>(null);
  const incomingTransferRef = useRef<IncomingTransfer | null>(null);
  const ackTimerRef = useRef<number | null>(null);

  const addMessage = (text: string, type: ActivityType = 'info') => {
    setMessages((prev) => [
      ...prev,
      {
        text,
        type,
        timestamp: new Date().toLocaleTimeString()
      }
    ]);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const clearAckTimer = () => {
    if (ackTimerRef.current !== null) {
      window.clearTimeout(ackTimerRef.current);
      ackTimerRef.current = null;
    }
  };

  const cleanupTransfer = () => {
    clearAckTimer();
    outgoingTransferRef.current = null;
    incomingTransferRef.current = null;
    setIsTransferring(false);
    setSendProgress(0);
    setReceiveProgress(0);
    setTransferSpeed(0);
  };

  const getActiveTransport = (): 'webrtc' | 'websocket' | null => {
    if (dataChannel.current?.readyState === 'open') {
      return 'webrtc';
    }

    if (ws.current?.readyState === WebSocket.OPEN && remoteClientId.current) {
      return 'websocket';
    }

    return null;
  };

  const sendSignal = (data: unknown) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN && remoteClientId.current) {
      ws.current.send(
        JSON.stringify({
          type: 'signal',
          targetId: remoteClientId.current,
          data
        })
      );
    }
  };

  const sendControlMessage = (message: TransferControlMessage) => {
    const transport = getActiveTransport();
    if (!transport) {
      throw new Error('No available transport for control message');
    }

    if (transport === 'webrtc') {
      dataChannel.current?.send(JSON.stringify({ __fileControl: true, ...message }));
      return;
    }

    sendSignal({ type: 'file-control', payload: message });
  };

  const sendBinaryPacket = (packet: ArrayBuffer, transport: 'webrtc' | 'websocket') => {
    if (transport === 'webrtc') {
      dataChannel.current?.send(packet);
      return;
    }

    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    ws.current.send(packet);
  };

  const finalizeIncomingTransfer = (fileId: string) => {
    const transfer = incomingTransferRef.current;

    if (!transfer || transfer.fileId !== fileId) {
      return;
    }

    const hasMissingChunks = transfer.chunks.some((chunk) => !chunk);
    if (hasMissingChunks) {
      addMessage('File completion received with missing chunks', 'error');
      incomingTransferRef.current = null;
      setReceiveProgress(0);
      return;
    }

    const blob = new Blob(transfer.chunks as BlobPart[], { type: transfer.mimeType });

    const file: ReceivedFile = {
      name: transfer.name,
      size: transfer.size,
      type: transfer.mimeType,
      blob,
      url: URL.createObjectURL(blob),
      receivedAt: new Date()
    };

    setReceivedFiles((prev) => [...prev, file]);
    addMessage(`File received successfully: ${file.name}`, 'success');
    setReceiveProgress(100);

    setTimeout(() => {
      setReceiveProgress(0);
      setTransferSpeed(0);
    }, 2500);

    incomingTransferRef.current = null;
  };

  const scheduleAckTimeout = () => {
    clearAckTimer();

    ackTimerRef.current = window.setTimeout(() => {
      const transfer = outgoingTransferRef.current;
      if (!transfer || transfer.pendingAckIndex === null) {
        return;
      }

      if (transfer.retries < MAX_RETRIES && transfer.lastPacket) {
        transfer.retries += 1;

        try {
          sendBinaryPacket(transfer.lastPacket, transfer.transport);
          addMessage(
            `Retrying chunk ${transfer.pendingAckIndex + 1}/${transfer.totalChunks} (attempt ${transfer.retries + 1})`,
            'info'
          );
          scheduleAckTimeout();
        } catch {
          addMessage('Failed to resend chunk after ACK timeout', 'error');
          cleanupTransfer();
        }

        return;
      }

      addMessage('Transfer failed: missing ACK timeout', 'error');
      cleanupTransfer();
    }, ACK_TIMEOUT_MS);
  };

  const sendNextChunk = async () => {
    const transfer = outgoingTransferRef.current;
    if (!transfer || transfer.pendingAckIndex !== null) {
      return;
    }

    if (transfer.nextChunkIndex >= transfer.totalChunks) {
      try {
        sendControlMessage({ kind: 'complete', fileId: transfer.fileId });
      } catch {
        addMessage('Failed to send completion message', 'error');
      }

      setIsTransferring(false);
      addMessage(`File sent successfully: ${transfer.file.name}`, 'success');
      outgoingTransferRef.current = null;

      setTimeout(() => {
        setSendProgress(0);
        setTransferSpeed(0);
      }, 2500);
      return;
    }

    const chunkIndex = transfer.nextChunkIndex;
    const start = chunkIndex * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, transfer.file.size);

    try {
      const payload = await transfer.file.slice(start, end).arrayBuffer();
      const packet = createChunkPacket(transfer.fileId, chunkIndex, transfer.totalChunks, payload);

      transfer.lastPacket = packet;
      transfer.pendingAckIndex = chunkIndex;

      sendBinaryPacket(packet, transfer.transport);
      scheduleAckTimeout();
    } catch {
      addMessage('Error sending file chunk', 'error');
      cleanupTransfer();
    }
  };

  const handleControlMessage = async (message: TransferControlMessage) => {
    if (message.kind === 'meta') {
      incomingTransferRef.current = {
        fileId: message.fileId,
        name: message.name,
        size: message.size,
        mimeType: message.mimeType,
        totalChunks: message.totalChunks,
        chunks: new Array(message.totalChunks),
        receivedCount: 0,
        receivedBytes: 0,
        startedAt: Date.now()
      };

      setReceiveProgress(0);
      addMessage(
        `Receiving file: ${message.name} (${formatFileSize(message.size)}) via ${message.transport.toUpperCase()}`,
        'info'
      );
      return;
    }

    if (message.kind === 'ack') {
      const transfer = outgoingTransferRef.current;
      if (!transfer || transfer.fileId !== message.fileId) return;
      if (transfer.pendingAckIndex !== message.chunkIndex) return;

      clearAckTimer();
      transfer.pendingAckIndex = null;
      transfer.retries = 0;
      transfer.nextChunkIndex = message.chunkIndex + 1;

      const sentBytes = Math.min(transfer.nextChunkIndex * CHUNK_SIZE, transfer.file.size);
      const progress = (sentBytes / transfer.file.size) * 100;
      setSendProgress(progress);

      const elapsedSeconds = (Date.now() - transfer.startedAt) / 1000;
      if (elapsedSeconds > 0) {
        setTransferSpeed(sentBytes / elapsedSeconds);
      }

      await sendNextChunk();
      return;
    }

    if (message.kind === 'complete') {
      finalizeIncomingTransfer(message.fileId);
      return;
    }

    if (message.kind === 'error') {
      addMessage(`Peer transfer error: ${message.reason}`, 'error');
    }
  };

  const handleIncomingBinaryPacket = async (input: unknown) => {
    const buffer = await toArrayBuffer(input);
    if (!buffer) return;

    const parsed = parseChunkPacket(buffer);
    if (!parsed) {
      addMessage('Received invalid binary packet', 'error');
      return;
    }

    let transfer = incomingTransferRef.current;

    if (!transfer || transfer.fileId !== parsed.fileId) {
      transfer = {
        fileId: parsed.fileId,
        name: `incoming-${parsed.fileId}`,
        size: 0,
        mimeType: 'application/octet-stream',
        totalChunks: parsed.totalChunks,
        chunks: new Array(parsed.totalChunks),
        receivedCount: 0,
        receivedBytes: 0,
        startedAt: Date.now()
      };
      incomingTransferRef.current = transfer;
    }

    if (parsed.chunkIndex >= transfer.totalChunks) {
      return;
    }

    if (!transfer.chunks[parsed.chunkIndex]) {
      const payloadCopy = new Uint8Array(parsed.payload.byteLength);
      payloadCopy.set(parsed.payload);

      transfer.chunks[parsed.chunkIndex] = payloadCopy;
      transfer.receivedCount += 1;
      transfer.receivedBytes += payloadCopy.byteLength;

      const denominator = transfer.size > 0 ? transfer.size : transfer.totalChunks * CHUNK_SIZE;
      const progress = Math.min(100, (transfer.receivedBytes / denominator) * 100);
      setReceiveProgress(progress);

      const elapsedSeconds = (Date.now() - transfer.startedAt) / 1000;
      if (elapsedSeconds > 0) {
        setTransferSpeed(transfer.receivedBytes / elapsedSeconds);
      }
    }

    try {
      sendControlMessage({
        kind: 'ack',
        fileId: parsed.fileId,
        chunkIndex: parsed.chunkIndex
      });
    } catch {
      addMessage('Failed to send chunk ACK', 'error');
    }
  };

  const connectWebSocket = () => {
    ws.current = new WebSocket(SERVER_URL);
    ws.current.binaryType = 'arraybuffer';

    ws.current.onopen = () => {
      setIsWsReady(true);
      addMessage('Connected to Brew Beautiful Share', 'system');
    };

    ws.current.onmessage = async (event) => {
      if (typeof event.data === 'string') {
        try {
          const message = JSON.parse(event.data);
          await handleWebSocketMessage(message);
        } catch {
          addMessage('Invalid JSON message received', 'error');
        }
        return;
      }

      await handleIncomingBinaryPacket(event.data);
    };

    ws.current.onclose = () => {
      setIsWsReady(false);
      addMessage('Disconnected from service', 'system');
      setConnectionState('disconnected');
      setDataChannelReady(false);
    };

    ws.current.onerror = () => {
      addMessage('Connection error', 'error');
    };
  };

  const setupDataChannel = (channel: RTCDataChannel) => {
    dataChannel.current = channel;

    channel.onopen = () => {
      setDataChannelReady(true);
      addMessage('Data channel opened - ready for file transfer!', 'success');
    };

    channel.onclose = () => {
      setDataChannelReady(false);
      addMessage('Data channel closed, using WebSocket fallback if available', 'system');
    };

    channel.onerror = () => {
      setDataChannelReady(false);
      addMessage('Data channel error, using WebSocket fallback if available', 'error');
      cleanupTransfer();
    };

    channel.onmessage = async (event) => {
      const payload = event.data;

      if (typeof payload === 'string') {
        try {
          const parsed = JSON.parse(payload);
          if (parsed?.__fileControl) {
            await handleControlMessage(parsed as TransferControlMessage & { __fileControl: true });
            return;
          }

          addMessage(`Received: ${payload}`, 'message');
        } catch {
          addMessage(`Received: ${payload}`, 'message');
        }
        return;
      }

      await handleIncomingBinaryPacket(payload);
    };
  };

  const initializePeerConnection = async (userRole: 'sender' | 'receiver') => {
    if (peerConnection.current) {
      peerConnection.current.close();
    }

    peerConnection.current = new RTCPeerConnection(rtcConfig);

    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal({
          type: 'ice-candidate',
          candidate: event.candidate
        });
      }
    };

    peerConnection.current.onconnectionstatechange = () => {
      const state = peerConnection.current?.connectionState || 'disconnected';
      setConnectionState(state);

      if (state === 'connected') {
        addMessage('WebRTC connection established!', 'success');
      } else if (state === 'failed' || state === 'disconnected') {
        addMessage('WebRTC unavailable, falling back to WebSocket if peer is online', 'system');
      }
    };

    peerConnection.current.ondatachannel = (event) => {
      setupDataChannel(event.channel);
    };

    if (userRole === 'sender') {
      const channel = peerConnection.current.createDataChannel('fileChannel', {
        ordered: true
      });
      setupDataChannel(channel);
    }
  };

  const handleSignalingData = async (data: any) => {
    try {
      if (data.type === 'file-control') {
        await handleControlMessage(data.payload as TransferControlMessage);
        return;
      }

      if (data.type === 'offer') {
        await peerConnection.current?.setRemoteDescription(new RTCSessionDescription(data));
        const answer = await peerConnection.current?.createAnswer();
        if (!answer) return;
        await peerConnection.current?.setLocalDescription(answer);
        sendSignal(answer);
      } else if (data.type === 'answer') {
        await peerConnection.current?.setRemoteDescription(new RTCSessionDescription(data));
      } else if (data.type === 'ice-candidate') {
        await peerConnection.current?.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    } catch {
      addMessage('Signaling error', 'error');
    }
  };

  const handleWebSocketMessage = async (message: any) => {
    const { type, clientId: msgClientId, role: msgRole, roomSize: msgRoomSize, data } = message;

    switch (type) {
      case 'connection':
        setClientId(msgClientId);
        addMessage(`Connected with ID: ${msgClientId}`, 'system');
        break;
      case 'role-assigned':
        setRole(msgRole);
        setRoomSize(msgRoomSize);
        addMessage(`Role assigned: ${msgRole}`, 'system');
        await initializePeerConnection(msgRole);
        break;
      case 'user-joined':
        remoteClientId.current = msgClientId;
        setHasPeer(true);
        setRoomSize(msgRoomSize);
        addMessage(`User joined as ${msgRole}`, 'system');
        break;
      case 'signal':
        remoteClientId.current = msgClientId;
        setHasPeer(true);
        await handleSignalingData(data);
        break;
      case 'user-left':
        addMessage('User left the room', 'system');
        setRoomSize(msgRoomSize);
        setHasPeer(false);
        cleanupTransfer();
        if (peerConnection.current) {
          peerConnection.current.close();
          peerConnection.current = null;
        }
        remoteClientId.current = null;
        setConnectionState('disconnected');
        setDataChannelReady(false);
        break;
      case 'error':
        addMessage(message.message, 'error');
        break;
      default:
        break;
    }
  };

  const createRoom = async () => {
    try {
      const response = await fetch(`${API_URL}/create-room`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      const data = await response.json();

      if (data.success) {
        joinRoom(data.roomId);
      } else {
        addMessage('Failed to create room', 'error');
      }
    } catch {
      addMessage('Error creating room', 'error');
    }
  };

  const joinRoom = (id: string | null = null) => {
    const targetRoomId = id || inputRoomId;
    if (!targetRoomId) return;

    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(
        JSON.stringify({
          type: 'join',
          roomId: targetRoomId
        })
      );
      setRoomId(targetRoomId);
      setIsConnected(true);
      addMessage(`Joined room: ${targetRoomId}`, 'system');
    }
  };

  const copyJoinLink = async () => {
    if (!joinLink) return;

    try {
      await navigator.clipboard.writeText(joinLink);
      addMessage('Join link copied to clipboard', 'success');
    } catch {
      addMessage('Could not copy join link', 'error');
    }
  };

  const leaveRoom = () => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(
        JSON.stringify({
          type: 'leave',
          roomId
        })
      );
    }

    cleanupTransfer();
    setIsConnected(false);
    setRoomId('');
    setHasPeer(false);
    setRole(null);
    setRoomSize(0);
    setConnectionState('disconnected');
    setDataChannelReady(false);

    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }

    remoteClientId.current = null;
    addMessage('Left room', 'system');
  };

  const createOffer = async () => {
    if (role !== 'sender') {
      addMessage('Only sender can create offer', 'error');
      return;
    }

    try {
      const offer = await peerConnection.current?.createOffer();
      if (!offer) return;
      await peerConnection.current?.setLocalDescription(offer);
      sendSignal(offer);
      addMessage('Offer created and sent', 'success');
    } catch {
      addMessage('Error creating offer', 'error');
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    addMessage(`File selected: ${file.name} (${formatFileSize(file.size)})`, 'info');
  };

  const sendFile = async () => {
    if (!selectedFile) {
      addMessage('No file selected', 'error');
      return;
    }

    if (outgoingTransferRef.current) {
      addMessage('A file transfer is already in progress', 'error');
      return;
    }

    const transport = getActiveTransport();
    if (!transport) {
      addMessage('No active transport. Connect peer first.', 'error');
      return;
    }

    const fileId = generateFileId();
    const totalChunks = Math.ceil(selectedFile.size / CHUNK_SIZE);

    outgoingTransferRef.current = {
      file: selectedFile,
      fileId,
      totalChunks,
      nextChunkIndex: 0,
      pendingAckIndex: null,
      retries: 0,
      lastPacket: null,
      startedAt: Date.now(),
      transport
    };

    setIsTransferring(true);
    setSendProgress(0);
    setTransferSpeed(0);

    try {
      sendControlMessage({
        kind: 'meta',
        fileId,
        name: selectedFile.name,
        size: selectedFile.size,
        mimeType: selectedFile.type || 'application/octet-stream',
        totalChunks,
        chunkSize: CHUNK_SIZE,
        transport
      });

      addMessage(`Starting transfer: ${selectedFile.name} via ${transport.toUpperCase()}`, 'info');
      await sendNextChunk();
    } catch {
      addMessage('Failed to initialize transfer', 'error');
      cleanupTransfer();
    }
  };

  const downloadFile = (file: ReceivedFile) => {
    const a = document.createElement('a');
    a.href = file.url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    addMessage(`Downloaded: ${file.name}`, 'success');
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get('room')?.trim();

    if (roomFromUrl) {
      setInputRoomId(roomFromUrl);
      setPendingRoomId(roomFromUrl);
    }

    connectWebSocket();

    return () => {
      cleanupTransfer();

      for (const file of receivedFiles) {
        URL.revokeObjectURL(file.url);
      }

      if (ws.current) {
        ws.current.close();
      }

      if (peerConnection.current) {
        peerConnection.current.close();
      }
    };
  }, []);

  useEffect(() => {
    if (!roomId) {
      setJoinLink('');
      return;
    }

    setJoinLink(`${window.location.origin}/upload?room=${encodeURIComponent(roomId)}`);
  }, [roomId]);

  useEffect(() => {
    if (!joinLink) {
      setQrCodeDataUrl('');
      return;
    }

    let isCancelled = false;

    QRCode.toDataURL(joinLink, {
      width: 220,
      margin: 1,
      errorCorrectionLevel: 'M'
    })
      .then((dataUrl) => {
        if (!isCancelled) {
          setQrCodeDataUrl(dataUrl);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setQrCodeDataUrl('');
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [joinLink]);

  useEffect(() => {
    if (!isWsReady || !pendingRoomId || isConnected) {
      return;
    }

    joinRoom(pendingRoomId);
    setPendingRoomId(null);
  }, [isWsReady, pendingRoomId, isConnected]);

  const canTransfer = hasPeer && (dataChannelReady || isWsReady);
  const transportLabel = dataChannelReady
    ? 'WebRTC DataChannel'
    : hasPeer && isWsReady
      ? 'WebSocket fallback'
      : 'Waiting for peer';

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold bg-gradient-coffee bg-clip-text text-transparent mb-4">
              Share Your Files
            </h1>
            <p className="text-muted-foreground text-lg">
              Secure file sharing with WebRTC + reliable WebSocket fallback
            </p>
          </div>

          {!isConnected ? (
            <div className="bg-card rounded-lg border border-border p-8 text-center shadow-lg">
              <h2 className="text-2xl font-semibold mb-4">Join or Create Room</h2>
              <p className="text-muted-foreground mb-6">
                Create a secure room to share files or join an existing one
              </p>

              <div className="space-y-4">
                <button
                  onClick={createRoom}
                  className="w-full bg-gradient-coffee text-primary-foreground px-6 py-3 rounded-lg shadow-md hover:opacity-90 transition font-semibold"
                >
                  Create New Room
                </button>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Enter Room ID"
                    value={inputRoomId}
                    onChange={(e) => setInputRoomId(e.target.value)}
                    className="flex-1 px-4 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    onClick={() => joinRoom()}
                    className="px-6 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition font-medium"
                  >
                    Join
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-card rounded-lg border border-border p-6 shadow-lg">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h2 className="text-xl font-semibold">Room {roomId}</h2>
                    <div className="flex gap-4 text-sm text-muted-foreground mt-1">
                      <span>
                        Role: <span className="font-medium text-foreground">{role}</span>
                      </span>
                      <span>
                        Users: <span className="font-medium text-foreground">{roomSize}/2</span>
                      </span>
                      <span>
                        Status:{' '}
                        <span className={`font-medium ${connectionState === 'connected' ? 'text-green-600' : 'text-red-600'}`}>
                          {connectionState}
                        </span>
                      </span>
                      <span>
                        Transport: <span className="font-medium text-foreground">{transportLabel}</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {role === 'sender' && roomSize === 2 && connectionState !== 'connected' && (
                      <button
                        onClick={createOffer}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium"
                      >
                        Create Offer
                      </button>
                    )}

                    <button
                      onClick={leaveRoom}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium"
                    >
                      Leave Room
                    </button>
                  </div>
                </div>

                {joinLink && (
                  <div className="mt-4 border border-border rounded-lg p-4">
                    <div className="text-sm font-medium mb-3">Invite with QR</div>
                    <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
                      {qrCodeDataUrl && (
                        <img
                          src={qrCodeDataUrl}
                          alt="Room join QR code"
                          className="w-36 h-36 rounded-md border border-border bg-white p-1"
                        />
                      )}
                      <div className="flex-1 w-full">
                        <input
                          value={joinLink}
                          readOnly
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
                        />
                        <button
                          onClick={copyJoinLink}
                          className="mt-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition text-sm font-medium"
                        >
                          Copy Invite Link
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {canTransfer && (
                <div className="bg-card rounded-lg border border-border p-6 shadow-lg">
                  <h3 className="text-lg font-semibold mb-4">File Transfer</h3>

                  <div className="border-2 border-dashed border-border rounded-lg p-6 text-center mb-4">
                    <input
                      type="file"
                      onChange={handleFileSelect}
                      disabled={isTransferring || role !== 'sender'}
                      className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:font-medium file:bg-gradient-coffee file:text-primary-foreground hover:file:opacity-90"
                    />
                    {selectedFile && (
                      <div className="mt-3 p-3 bg-muted rounded-lg text-sm">
                        Selected: <span className="font-medium">{selectedFile.name}</span> ({formatFileSize(selectedFile.size)})
                      </div>
                    )}
                  </div>

                  <button
                    onClick={sendFile}
                    disabled={!selectedFile || isTransferring || role !== 'sender'}
                    className="w-full bg-gradient-coffee text-primary-foreground px-6 py-3 rounded-lg shadow-md hover:opacity-90 transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isTransferring ? 'Sending...' : 'Send File'}
                  </button>

                  {sendProgress > 0 && (
                    <div className="mt-4">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium">Sending</span>
                        <span>
                          {Math.round(sendProgress)}%
                          {transferSpeed > 0 && ` • ${formatFileSize(transferSpeed)}/s`}
                        </span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className="bg-gradient-coffee h-2 rounded-full transition-all duration-300"
                          style={{ width: `${sendProgress}%` }}
                        ></div>
                      </div>
                    </div>
                  )}

                  {receiveProgress > 0 && (
                    <div className="mt-4">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium">Receiving</span>
                        <span>
                          {Math.round(receiveProgress)}%
                          {transferSpeed > 0 && ` • ${formatFileSize(transferSpeed)}/s`}
                        </span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className="bg-green-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${receiveProgress}%` }}
                        ></div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {receivedFiles.length > 0 && (
                <div className="bg-card rounded-lg border border-border p-6 shadow-lg">
                  <h3 className="text-lg font-semibold mb-4">Received Files</h3>

                  <div className="space-y-3">
                    {receivedFiles.map((file, index) => (
                      <div key={index} className="flex items-center justify-between p-4 bg-muted rounded-lg">
                        <div>
                          <div className="font-medium">{file.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {formatFileSize(file.size)} • Received {file.receivedAt.toLocaleTimeString()}
                          </div>
                        </div>
                        <button
                          onClick={() => downloadFile(file)}
                          className="px-4 py-2 bg-gradient-coffee text-primary-foreground rounded-lg hover:opacity-90 transition font-medium"
                        >
                          Download
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-card rounded-lg border border-border p-6 shadow-lg">
                <h4 className="font-semibold mb-3">Activity Log</h4>
                <div className="bg-muted rounded-lg p-4 max-h-40 overflow-y-auto text-sm font-mono">
                  {messages.slice(-10).map((msg, index) => (
                    <div key={index} className="mb-1">
                      <span className="text-muted-foreground">[{msg.timestamp}]</span>{' '}
                      <span
                        className={
                          msg.type === 'error'
                            ? 'text-red-600'
                            : msg.type === 'success'
                              ? 'text-green-600'
                              : 'text-foreground'
                        }
                      >
                        {msg.text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
      <div className="sr-only">Client ID: {clientId}</div>
    </div>
  );
};

export default UploadReliable;
