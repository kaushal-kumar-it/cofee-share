import React, { useState, useRef, useEffect } from 'react';
import { Header } from '@/components/Header';

const SERVER_URL = import.meta.env.VITE_WS_SERVER_URL || 'ws://localhost:8000';
const API_URL = import.meta.env.VITE_API_SERVER_URL || 'http://localhost:8000';

const Upload = () => {
    // State management
    const [clientId, setClientId] = useState(null);
    const [roomId, setRoomId] = useState('');
    const [inputRoomId, setInputRoomId] = useState('');
    const [isConnected, setIsConnected] = useState(false);
    const [role, setRole] = useState(null);
    const [roomSize, setRoomSize] = useState(0);
    const [connectionState, setConnectionState] = useState('disconnected');
    const [messages, setMessages] = useState([]);
    const [selectedFile, setSelectedFile] = useState(null);
    const [sendProgress, setSendProgress] = useState(0);
    const [receiveProgress, setReceiveProgress] = useState(0);
    const [receivedFiles, setReceivedFiles] = useState([]);
    const [isTransferring, setIsTransferring] = useState(false);
    const [transferSpeed, setTransferSpeed] = useState(0);

    // Refs
    const ws = useRef(null);
    const peerConnection = useRef(null);
    const dataChannel = useRef(null);
    const remoteClientId = useRef(null);
    
    // Enhanced file transfer refs
    const receivedBuffers = useRef([]);
    const receivedBytes = useRef(0);
    const fileSize = useRef(0);
    const fileMeta = useRef(null);
    const sendOffset = useRef(0);
    
    // Enhanced slicing management
    const transferStartTime = useRef(null);
    const lastProgressUpdate = useRef(0);
    const chunkQueue = useRef([]);
    const isProcessingChunk = useRef(false);
    const maxRetries = useRef(3);
    const currentRetries = useRef(0);
    const activeTransfer = useRef(false);

    // WebRTC configuration
    const rtcConfig = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    };

    // Initialize WebSocket connection
    useEffect(() => {
        connectWebSocket();
        return () => {
            cleanupTransfer();
            if (ws.current) {
                ws.current.close();
            }
            if (peerConnection.current) {
                peerConnection.current.close();
            }
        };
    }, []);

    const connectWebSocket = () => {
        ws.current = new WebSocket(SERVER_URL);

        ws.current.onopen = () => {
            console.log('WebSocket connected');
            addMessage('Connected to Brew Beautiful Share', 'system');
        };

        ws.current.onmessage = async (event) => {
            const message = JSON.parse(event.data);
            console.log('Received message:', message);
            await handleWebSocketMessage(message);
        };

        ws.current.onclose = () => {
            console.log('WebSocket disconnected');
            addMessage('Disconnected from service', 'system');
            setConnectionState('disconnected');
        };

        ws.current.onerror = (error) => {
            console.error('WebSocket error:', error);
            addMessage('Connection error', 'error');
        };
    };

    const handleWebSocketMessage = async (message) => {
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
                setRoomSize(msgRoomSize);
                addMessage(`User joined as ${msgRole}`, 'system');
                if (role === 'sender' && msgRoomSize === 2) {
                    console.log('Second user joined, ready to create offer...');
                }
                break;

            case 'signal':
                remoteClientId.current = msgClientId;
                await handleSignalingData(data);
                break;

            case 'user-left':
                addMessage('User left the room', 'system');
                setRoomSize(msgRoomSize);
                setConnectionState('disconnected');
                cleanupTransfer();
                if (peerConnection.current) {
                    peerConnection.current.close();
                    peerConnection.current = null;
                }
                remoteClientId.current = null;
                break;

            case 'error':
                addMessage(message.message, 'error');
                break;

            default:
                console.warn('Unknown message type:', type);
        }
    };

    const initializePeerConnection = async (userRole) => {
        console.log('Initializing peer connection for role:', userRole);
        
        if (peerConnection.current) {
            peerConnection.current.close();
        }

        peerConnection.current = new RTCPeerConnection(rtcConfig);

        peerConnection.current.onicecandidate = (event) => {
            console.log('ICE candidate generated:', event.candidate);
            if (event.candidate) {
                sendSignal({
                    type: 'ice-candidate',
                    candidate: event.candidate
                });
            }
        };

        peerConnection.current.onconnectionstatechange = () => {
            const state = peerConnection.current.connectionState;
            console.log('Connection state changed to:', state);
            setConnectionState(state);
            addMessage(`Connection state: ${state}`, 'system');
            
            if (state === 'connected') {
                addMessage('WebRTC connection established!', 'success');
            } else if (state === 'failed' || state === 'disconnected') {
                addMessage('WebRTC connection failed', 'error');
                cleanupTransfer();
            }
        };

        peerConnection.current.ondatachannel = (event) => {
            console.log('Data channel received:', event.channel);
            setupDataChannel(event.channel);
        };

        if (userRole === 'sender') {
            console.log('Creating data channel for sender');
            const channel = peerConnection.current.createDataChannel('fileChannel', {
                ordered: true,  // Use ordered delivery for reliability
                maxRetransmits: 3  // Allow some retransmissions for reliability
            });
            setupDataChannel(channel);
        }
    };

    const setupDataChannel = (channel) => {
        console.log('Setting up data channel:', channel.label);
        dataChannel.current = channel;

        channel.onopen = () => {
            console.log('Data channel opened');
            addMessage('Data channel opened - ready for file transfer!', 'success');
        };

        channel.onmessage = (event) => {
            handleDataChannelMessage(event.data);
        };

        channel.onclose = () => {
            console.log('Data channel closed');
            addMessage('Data channel closed', 'system');
            cleanupTransfer();
        };

        channel.onerror = (error) => {
            console.error('Data channel error:', error);
            addMessage(`Data channel error: ${error.error || 'Unknown error'}`, 'error');
            
            // Stop any active transfer on error
            if (activeTransfer.current) {
                activeTransfer.current = false;
                cleanupTransfer();
                addMessage('File transfer stopped due to data channel error', 'error');
            }
        };

        if (channel.addEventListener) {
            channel.addEventListener('bufferedamountlow', () => {
                console.log('Buffer amount low - ready for more data');
            });
        }
    };

    const handleDataChannelMessage = async (data) => {
        if (typeof data === 'string') {
            if (data.startsWith('META:')) {
                fileMeta.current = JSON.parse(data.substring(5));
                fileSize.current = fileMeta.current.size;
                receivedBytes.current = 0;
                receivedBuffers.current = [];
                chunkQueue.current = [];
                setReceiveProgress(0);
                transferStartTime.current = Date.now();
                
                addMessage(`Receiving file: ${fileMeta.current.name} (${formatFileSize(fileMeta.current.size)})`, 'info');
                console.log('Starting enhanced file reception:', fileMeta.current);
                
            } else if (data === 'EOF') {
                try {
                    await processRemainingChunks();
                    
                    const blob = new Blob(receivedBuffers.current, { type: fileMeta.current.type });
                    const file = {
                        name: fileMeta.current.name,
                        size: fileMeta.current.size,
                        type: fileMeta.current.type,
                        blob: blob,
                        url: URL.createObjectURL(blob),
                        receivedAt: new Date()
                    };
                    
                    setReceivedFiles(prev => [...prev, file]);
                    addMessage(`File received successfully: ${fileMeta.current.name}`, 'success');
                    console.log('File transfer completed successfully!');
                    
                    receivedBuffers.current = [];
                    receivedBytes.current = 0;
                    chunkQueue.current = [];
                    setReceiveProgress(100);
                    
                    setTimeout(() => {
                        setReceiveProgress(0);
                        setTransferSpeed(0);
                    }, 3000);
                    
                } catch (error) {
                    console.error('Error completing file transfer:', error);
                    addMessage('Error completing file transfer', 'error');
                }
                
            } else {
                addMessage(`Received: ${data}`, 'message');
            }
        } else {
            // Handle binary chunk data
            chunkQueue.current.push(data);
            processChunkQueue();
        }
    };

    const processChunkQueue = async () => {
        if (isProcessingChunk.current) return;
        
        isProcessingChunk.current = true;
        
        while (chunkQueue.current.length > 0) {
            const chunk = chunkQueue.current.shift();
            receivedBuffers.current.push(chunk);
            receivedBytes.current += chunk.byteLength;
            
            if (fileSize.current > 0) {
                const progress = (receivedBytes.current / fileSize.current) * 100;
                setReceiveProgress(progress);
                
                if (transferStartTime.current) {
                    const elapsed = (Date.now() - transferStartTime.current) / 1000;
                    const speed = receivedBytes.current / elapsed;
                    setTransferSpeed(speed);
                }
            }
        }
        
        isProcessingChunk.current = false;
    };

    const processRemainingChunks = async () => {
        return new Promise<void>((resolve) => {
            const checkComplete = () => {
                if (chunkQueue.current.length === 0 && !isProcessingChunk.current) {
                    resolve();
                } else {
                    setTimeout(checkComplete, 10);
                }
            };
            checkComplete();
        });
    };

    const sendSignal = (data) => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN && remoteClientId.current) {
            ws.current.send(JSON.stringify({
                type: 'signal',
                targetId: remoteClientId.current,
                data: data
            }));
        }
    };

    const handleSignalingData = async (data) => {
        try {
            if (data.type === 'offer') {
                await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data));
                const answer = await peerConnection.current.createAnswer();
                await peerConnection.current.setLocalDescription(answer);
                sendSignal(answer);
            } else if (data.type === 'answer') {
                await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data));
            } else if (data.type === 'ice-candidate') {
                await peerConnection.current.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
        } catch (error) {
            console.error('Error handling signaling data:', error);
            addMessage('Signaling error', 'error');
        }
    };

    const createRoom = async () => {
        try {
            const response = await fetch(`${API_URL}/create-room`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            const data = await response.json();
            
            if (data.success) {
                joinRoom(data.roomId);
            } else {
                addMessage('Failed to create room', 'error');
            }
        } catch (error) {
            console.error('Error creating room:', error);
            addMessage('Error creating room', 'error');
        }
    };

    const joinRoom = (id = null) => {
        const targetRoomId = id || inputRoomId;
        if (!targetRoomId) return;

        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({
                type: 'join',
                roomId: targetRoomId
            }));
            setRoomId(targetRoomId);
            setIsConnected(true);
            addMessage(`Joined room: ${targetRoomId}`, 'system');
        }
    };

    const leaveRoom = () => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({
                type: 'leave',
                roomId: roomId
            }));
        }
        setIsConnected(false);
        setRoomId('');
        setConnectionState('disconnected');
        addMessage('Left room', 'system');
        
        if (peerConnection.current) {
            peerConnection.current.close();
            peerConnection.current = null;
        }
    };

    const createOffer = async () => {
        if (role !== 'sender') {
            addMessage('Only sender can create offer', 'error');
            return;
        }
        
        try {
            console.log('Creating offer...');
            const offer = await peerConnection.current.createOffer();
            await peerConnection.current.setLocalDescription(offer);
            sendSignal(offer);
            addMessage('Offer created and sent', 'success');
        } catch (error) {
            console.error('Error creating offer:', error);
            addMessage('Error creating offer', 'error');
        }
    };

    const handleFileSelect = (event) => {
        const file = event.target.files[0];
        if (file) {
            setSelectedFile(file);
            addMessage(`File selected: ${file.name} (${formatFileSize(file.size)})`, 'info');
        }
    };

    const sendFile = async () => {
        if (!selectedFile) {
            addMessage('No file selected', 'error');
            return;
        }
        
        if (!dataChannel.current) {
            addMessage('Data channel not available', 'error');
            return;
        }
        
        if (dataChannel.current.readyState !== 'open') {
            addMessage(`Data channel not ready (state: ${dataChannel.current.readyState})`, 'error');
            return;
        }

        // Check if there's already an active transfer
        if (activeTransfer.current) {
            addMessage('A file transfer is already in progress', 'error');
            return;
        }

        setIsTransferring(true);
        activeTransfer.current = true;
        setSendProgress(0);
        sendOffset.current = 0;
        transferStartTime.current = Date.now();

        const metadata = {
            name: selectedFile.name,
            size: selectedFile.size,
            type: selectedFile.type,
            lastModified: selectedFile.lastModified
        };

        dataChannel.current.send(`META:${JSON.stringify(metadata)}`);
        addMessage(`Starting file transfer: ${selectedFile.name}`, 'info');

        // Conservative chunk size for stability
        const CHUNK_SIZE = 16384; // 16KB chunks for maximum compatibility
        const MAX_BUFFER_SIZE = 65536; // 64KB buffer limit for stability
        const totalChunks = Math.ceil(selectedFile.size / CHUNK_SIZE);
        let chunkIndex = 0;

        const sendChunk = async () => {
            if (!activeTransfer.current || chunkIndex >= totalChunks) return;

            // Check if data channel is still open
            if (!dataChannel.current || dataChannel.current.readyState !== 'open') {
                console.error('Data channel is not open');
                cleanupTransfer();
                return;
            }

            // Wait if buffer is too full
            if (dataChannel.current.bufferedAmount > MAX_BUFFER_SIZE) {
                setTimeout(sendChunk, 10);
                return;
            }

            const start = chunkIndex * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, selectedFile.size);
            const slice = selectedFile.slice(start, end);

            const reader = new FileReader();
            reader.onload = async (e) => {
                if (!activeTransfer.current) return;

                const arrayBuffer = e.target?.result as ArrayBuffer;
                if (!arrayBuffer) return;
                
                try {
                    dataChannel.current.send(arrayBuffer);
                    chunkIndex++;
                    sendOffset.current = end;

                    const progress = (sendOffset.current / selectedFile.size) * 100;
                    setSendProgress(progress);

                    if (transferStartTime.current) {
                        const elapsed = (Date.now() - transferStartTime.current) / 1000;
                        const speed = sendOffset.current / elapsed;
                        setTransferSpeed(speed);
                    }

                    if (chunkIndex < totalChunks) {
                        setTimeout(sendChunk, 1);
                    } else {
                        dataChannel.current.send('EOF');
                        addMessage(`File sent successfully: ${selectedFile.name}`, 'success');
                        setIsTransferring(false);
                        activeTransfer.current = false;
                        setTimeout(() => {
                            setSendProgress(0);
                            setTransferSpeed(0);
                        }, 3000);
                    }
                } catch (error) {
                    console.error('Error sending chunk:', error);
                    addMessage('Error sending file chunk', 'error');
                    cleanupTransfer();
                }
            };

            reader.readAsArrayBuffer(slice);
        };

        await sendChunk();
    };

    const cleanupTransfer = () => {
        activeTransfer.current = false;
        setIsTransferring(false);
        setSendProgress(0);
        setReceiveProgress(0);
        setTransferSpeed(0);
        
        chunkQueue.current = [];
        isProcessingChunk.current = false;
        currentRetries.current = 0;
        sendOffset.current = 0;
        receivedBytes.current = 0;
        
        console.log('Transfer cleanup completed');
    };

    const addMessage = (text, type = 'info') => {
        setMessages(prev => [...prev, {
            text,
            type,
            timestamp: new Date().toLocaleTimeString()
        }]);
    };

    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const downloadFile = (file) => {
        const a = document.createElement('a');
        a.href = file.url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        addMessage(`Downloaded: ${file.name}`, 'success');
    };

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
                            Secure P2P file sharing with WebRTC technology
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
                            {/* Room Info */}
                            <div className="bg-card rounded-lg border border-border p-6 shadow-lg">
                                <div className="flex justify-between items-center mb-4">
                                    <div>
                                        <h2 className="text-xl font-semibold">Room {roomId}</h2>
                                        <div className="flex gap-4 text-sm text-muted-foreground mt-1">
                                            <span>Role: <span className="font-medium text-foreground">{role}</span></span>
                                            <span>Users: <span className="font-medium text-foreground">{roomSize}/2</span></span>
                                            <span>Status: <span className={`font-medium ${connectionState === 'connected' ? 'text-green-600' : 'text-red-600'}`}>{connectionState}</span></span>
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
                            </div>

                            {/* File Transfer */}
                            {connectionState === 'connected' && dataChannel.current?.readyState === 'open' && (
                                <div className="bg-card rounded-lg border border-border p-6 shadow-lg">
                                    <h3 className="text-lg font-semibold mb-4">File Transfer</h3>
                                    
                                    <div className="border-2 border-dashed border-border rounded-lg p-6 text-center mb-4">
                                        <input
                                            type="file"
                                            onChange={handleFileSelect}
                                            disabled={isTransferring}
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
                                        disabled={!selectedFile || isTransferring}
                                        className="w-full bg-gradient-coffee text-primary-foreground px-6 py-3 rounded-lg shadow-md hover:opacity-90 transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isTransferring ? 'Sending...' : 'Send File'}
                                    </button>

                                    {/* Progress Bars */}
                                    {sendProgress > 0 && (
                                        <div className="mt-4">
                                            <div className="flex justify-between text-sm mb-1">
                                                <span className="font-medium">Sending</span>
                                                <span>{Math.round(sendProgress)}%{transferSpeed > 0 && ` • ${formatFileSize(transferSpeed)}/s`}</span>
                                            </div>
                                            <div className="w-full bg-muted rounded-full h-2">
                                                <div className="bg-gradient-coffee h-2 rounded-full transition-all duration-300" style={{width: `${sendProgress}%`}}></div>
                                            </div>
                                        </div>
                                    )}

                                    {receiveProgress > 0 && (
                                        <div className="mt-4">
                                            <div className="flex justify-between text-sm mb-1">
                                                <span className="font-medium">Receiving</span>
                                                <span>{Math.round(receiveProgress)}%{transferSpeed > 0 && ` • ${formatFileSize(transferSpeed)}/s`}</span>
                                            </div>
                                            <div className="w-full bg-muted rounded-full h-2">
                                                <div className="bg-green-600 h-2 rounded-full transition-all duration-300" style={{width: `${receiveProgress}%`}}></div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Received Files */}
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

                            {/* Activity Log */}
                            <div className="bg-card rounded-lg border border-border p-6 shadow-lg">
                                <h4 className="font-semibold mb-3">Activity Log</h4>
                                <div className="bg-muted rounded-lg p-4 max-h-40 overflow-y-auto text-sm font-mono">
                                    {messages.slice(-10).map((msg, index) => (
                                        <div key={index} className="mb-1">
                                            <span className="text-muted-foreground">[{msg.timestamp}]</span>{' '}
                                            <span className={
                                                msg.type === 'error' ? 'text-red-600' : 
                                                msg.type === 'success' ? 'text-green-600' : 
                                                'text-foreground'
                                            }>
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
        </div>
    );
};

export default Upload;