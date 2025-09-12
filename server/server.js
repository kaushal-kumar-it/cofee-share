// WebRTC File Sharing Server like Toffee Share
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });   
const PORT = process.env.PORT || 8000;
const clients = new Map(); // To store connected clients
const rooms = new Map(); // To store rooms and their members

// CORS Configuration - MUST be first
app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:8080'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        activeRooms: rooms.size,
        connectedClients: clients.size,
        uptime: process.uptime()
    });
});

// Get server stats
app.get('/stats', (req, res) => {
    const roomStats = Array.from(rooms.entries()).map(([roomId, members]) => ({
        roomId,
        memberCount: members.size,
        members: Array.from(members)
    }));

    res.json({
        totalRooms: rooms.size,
        totalClients: clients.size,
        rooms: roomStats
    });
});

// Endpoint to create a new room    
app.post('/create-room', (req, res) => {
    try {
        // Create simple 6-digit room ID
        const roomId = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Initialize room with metadata
        rooms.set(roomId, {
            members: new Set(),
            createdAt: Date.now(),
            lastActivity: Date.now()
        });
        
        console.log(`Room created: ${roomId}`);
        res.json({ 
            success: true,
            roomId: roomId,
            message: 'Room created successfully'
        });
    } catch (error) {
        console.error('Error creating room:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to create room' 
        });
    }
});

// Endpoint to join an existing room
app.post('/join-room', (req, res) => {
    try {
        const { roomId } = req.body;
        
        if (!roomId) {
            return res.status(400).json({ 
                success: false, 
                message: 'Room ID is required' 
            });
        }

        if (rooms.has(roomId)) {
            const room = rooms.get(roomId);
            if (room.members.size >= 2) {
                res.status(403).json({ 
                    success: false, 
                    message: 'Room is full (maximum 2 users allowed)' 
                });
            } else {
                // Update room activity
                room.lastActivity = Date.now();
                
                res.json({ 
                    success: true,
                    message: 'Room is available',
                    memberCount: room.members.size
                });
            }
        } else {
            res.status(404).json({ 
                success: false, 
                message: 'Room not found' 
            });
        }
    } catch (error) {
        console.error('Error joining room:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to join room' 
        });
    }
});

// Endpoint to check room status
app.get('/room/:roomId', (req, res) => {
    try {
        const { roomId } = req.params;
        
        if (rooms.has(roomId)) {
            const room = rooms.get(roomId);
            res.json({
                success: true,
                roomId,
                memberCount: room.members.size,
                maxMembers: 2,
                available: room.members.size < 2,
                createdAt: room.createdAt,
                lastActivity: room.lastActivity
            });
        } else {
            res.status(404).json({ 
                success: false, 
                message: 'Room not found' 
            });
        }
    } catch (error) {
        console.error('Error getting room info:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get room information' 
        });
    }
});

// WebSocket connection handling
wss.on('connection', (ws, req) => {
    const clientId = uuidv4();
    const clientInfo = {
        ws: ws,
        roomId: null,
        connectedAt: Date.now(),
        lastSeen: Date.now()
    };
    
    clients.set(clientId, clientInfo);
    
    // Send connection confirmation
    ws.send(JSON.stringify({ 
        type: 'connection', 
        clientId: clientId,
        timestamp: Date.now()
    }));
    
    console.log(`Client connected: ${clientId} (Total: ${clients.size})`);

    // Handle incoming messages
    ws.on('message', (message) => {
        try {
            const parsedMessage = JSON.parse(message);
            handleWebSocketMessage(clientId, parsedMessage);
        } catch (e) {
            console.error(`Invalid JSON from ${clientId}:`, message.toString());
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Invalid message format'
            }));
        }
    });

    // Handle connection close
    ws.on('close', (code, reason) => {
        console.log(`Client disconnected: ${clientId} (Code: ${code}, Reason: ${reason})`);
        handleClientDisconnect(clientId);
    });

    // Handle WebSocket errors
    ws.on('error', (error) => {
        console.error(`WebSocket error for client ${clientId}:`, error);
        handleClientDisconnect(clientId);
    });

    // Heartbeat to keep connection alive
    ws.isAlive = true;
    ws.on('pong', () => {
        ws.isAlive = true;
        if (clients.has(clientId)) {
            clients.get(clientId).lastSeen = Date.now();
        }
    });
});

// Handle WebSocket messages
function handleWebSocketMessage(clientId, message) {
    const { type, roomId, targetId, data } = message;
    const client = clients.get(clientId);
    
    if (!client) {
        console.error(`Client ${clientId} not found`);
        return;
    }

    switch (type) {
        case 'join':
            handleJoinRoom(clientId, roomId);
            break;
        case 'signal':
            handleSignaling(clientId, targetId, data);
            break;
        case 'leave':
            handleLeaveRoom(clientId, roomId);
            break;
        case 'ping':
            // Respond to ping
            client.ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            break;
        default:
            console.error(`Unknown message type from ${clientId}: ${type}`);
            client.ws.send(JSON.stringify({
                type: 'error',
                message: `Unknown message type: ${type}`
            }));
    }
}

// Handle room joining
function handleJoinRoom(clientId, roomId) {
    const client = clients.get(clientId);
    
    if (!client) return;

    if (!roomId) {
        client.ws.send(JSON.stringify({
            type: 'error',
            message: 'Room ID is required'
        }));
        return;
    }

    if (rooms.has(roomId)) {
        const room = rooms.get(roomId);
        
        if (room.members.size >= 2) {
            client.ws.send(JSON.stringify({ 
                type: 'error', 
                message: 'Room is full (maximum 2 users allowed)' 
            }));
            return;
        }

        // Add client to room
        room.members.add(clientId);
        room.lastActivity = Date.now();
        client.roomId = roomId;
        
        const userRole = room.members.size === 1 ? 'sender' : 'receiver';
        
        // Notify the joining user of their role
        client.ws.send(JSON.stringify({ 
            type: 'role-assigned', 
            role: userRole,
            roomSize: room.members.size,
            roomId: roomId
        }));
        
        // Notify other users in the room
        broadcastToRoom(roomId, { 
            type: 'user-joined', 
            clientId: clientId, 
            role: userRole,
            roomSize: room.members.size 
        }, clientId);
        
        console.log(`Client ${clientId} joined room ${roomId} as ${userRole} (${room.members.size}/2)`);
        
    } else {
        client.ws.send(JSON.stringify({ 
            type: 'error', 
            message: 'Room not found. Please check the room ID.' 
        }));
    }
}

// Handle WebRTC signaling
function handleSignaling(fromClientId, targetId, data) {
    if (!targetId || !clients.has(targetId)) {
        const client = clients.get(fromClientId);
        if (client) {
            client.ws.send(JSON.stringify({
                type: 'error',
                message: 'Target client not found'
            }));
        }
        return;
    }

    const targetClient = clients.get(targetId);
    targetClient.ws.send(JSON.stringify({ 
        type: 'signal', 
        clientId: fromClientId, 
        data: data 
    }));
    
    console.log(`Signal relayed from ${fromClientId} to ${targetId}: ${data.type}`);
}

// Handle room leaving
function handleLeaveRoom(clientId, roomId) {
    const client = clients.get(clientId);
    
    if (!client) return;

    if (roomId && rooms.has(roomId)) {
        const room = rooms.get(roomId);
        room.members.delete(clientId);
        room.lastActivity = Date.now();
        
        // Notify other room members
        broadcastToRoom(roomId, { 
            type: 'user-left', 
            clientId: clientId,
            roomSize: room.members.size 
        }, clientId);
        
        // Clean up empty room
        if (room.members.size === 0) {
            rooms.delete(roomId);
            console.log(`Room ${roomId} deleted (empty)`);
        }
        
        console.log(`Client ${clientId} left room ${roomId}`);
    }
    
    // Update client info
    client.roomId = null;
}

// Handle client disconnect
function handleClientDisconnect(clientId) {
    const client = clients.get(clientId);
    
    if (client && client.roomId) {
        handleLeaveRoom(clientId, client.roomId);
    }
    
    clients.delete(clientId);
    console.log(`Client ${clientId} fully disconnected (Remaining: ${clients.size})`);
}

// Broadcast message to all room members except sender
function broadcastToRoom(roomId, message, excludeClientId) {
    if (!rooms.has(roomId)) return;
    
    const room = rooms.get(roomId);
    let sentCount = 0;
    
    room.members.forEach((memberId) => {
        if (memberId !== excludeClientId && clients.has(memberId)) {
            const client = clients.get(memberId);
            try {
                client.ws.send(JSON.stringify(message));
                sentCount++;
            } catch (error) {
                console.error(`Failed to send message to ${memberId}:`, error);
                // Remove client if send fails
                handleClientDisconnect(memberId);
            }
        }
    });
    
    console.log(`Broadcast to room ${roomId}: ${sentCount} recipients`);
}

// Heartbeat mechanism to detect broken connections
const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (!ws.isAlive) {
            console.log('Terminating dead connection');
            return ws.terminate();
        }
        
        ws.isAlive = false;
        ws.ping();
    });
}, 30000); // 30 seconds

// Clean up old empty rooms
const cleanupInterval = setInterval(() => {
    const now = Date.now();
    const maxIdleTime = 30 * 60 * 1000; // 30 minutes
    
    rooms.forEach((room, roomId) => {
        if (room.members.size === 0 && (now - room.lastActivity) > maxIdleTime) {
            rooms.delete(roomId);
            console.log(`Cleaned up idle room: ${roomId}`);
        }
    });
}, 5 * 60 * 1000); // Every 5 minutes

// Graceful shutdown handling
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

function gracefulShutdown(signal) {
    console.log(`Received ${signal}. Shutting down gracefully...`);
    
    // Clear intervals
    clearInterval(heartbeatInterval);
    clearInterval(cleanupInterval);
    
    // Notify all clients
    clients.forEach((client, clientId) => {
        try {
            client.ws.send(JSON.stringify({
                type: 'server-shutdown',
                message: 'Server is shutting down'
            }));
            client.ws.close(1001, 'Server shutdown');
        } catch (error) {
            console.error(`Error closing connection for ${clientId}:`, error);
        }
    });
    
    // Close WebSocket server
    wss.close(() => {
        console.log('WebSocket server closed');
        
        // Close HTTP server
        server.close(() => {
            console.log('HTTP server closed');
            process.exit(0);
        });
    });
    
    // Force exit after 10 seconds
    setTimeout(() => {
        console.log('Force shutdown');
        process.exit(1);
    }, 10000);
}

// Start the server
server.listen(PORT, () => {
    console.log(`🚀 WebRTC File Sharing Server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`📈 Stats: http://localhost:${PORT}/stats`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Export for testing
module.exports = { app, server, wss };