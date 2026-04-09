const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const cors = require('cors');
const rateLimit = require("express-rate-limit");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({
  server,
  maxPayload: 100 * 1024 * 1024
});

const PORT = process.env.PORT || 8000;
const clients = new Map();
const rooms = new Map();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: "Too many requests from this IP, please try again later."
});

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    activeRooms: rooms.size,
    connectedClients: clients.size,
    uptime: process.uptime()
  });
});

app.get('/stats', (req, res) => {
  const roomStats = Array.from(rooms.entries()).map(([roomId, room]) => ({
    roomId,
    memberCount: room.members.size,
    members: Array.from(room.members)
  }));

  res.json({
    totalRooms: rooms.size,
    totalClients: clients.size,
    rooms: roomStats
  });
});

app.post('/create-room', limiter, (req, res) => {
  try {
    const roomId = Math.floor(100000 + Math.random() * 900000).toString();

    rooms.set(roomId, {
      members: new Set(),
      createdAt: Date.now(),
      lastActivity: Date.now()
    });

    res.json({ success: true, roomId, message: 'Room created successfully' });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to create room' });
  }
});

app.post('/join-room', (req, res) => {
  try {
    const { roomId } = req.body;

    if (!roomId) {
      return res.status(400).json({ success: false, message: 'Room ID is required' });
    }

    if (!rooms.has(roomId)) {
      return res.status(404).json({ success: false, message: 'Room not found' });
    }

    const room = rooms.get(roomId);

    if (room.members.size >= 2) {
      return res.status(403).json({ success: false, message: 'Room is full' });
    }

    room.lastActivity = Date.now();

    res.json({
      success: true,
      message: 'Room is available',
      memberCount: room.members.size
    });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to join room' });
  }
});

app.get('/room/:roomId', (req, res) => {
  try {
    const { roomId } = req.params;

    if (!rooms.has(roomId)) {
      return res.status(404).json({ success: false, message: 'Room not found' });
    }

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
  } catch {
    res.status(500).json({ success: false, message: 'Failed to get room information' });
  }
});

wss.on('connection', (ws) => {
  if (clients.size > 1000) {
    ws.close(1013, "Server overloaded");
    return;
  }

  const clientId = uuidv4();

  clients.set(clientId, {
    ws,
    roomId: null,
    connectedAt: Date.now(),
    lastSeen: Date.now()
  });

  ws.send(JSON.stringify({ type: 'connection', clientId, timestamp: Date.now() }));

  ws.on('message', (message, isBinary) => {
    if (isBinary) {
      handleBinaryData(clientId, message);
      return;
    }

    try {
      const parsed = JSON.parse(message.toString());
      handleWebSocketMessage(clientId, parsed);
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  });

  ws.on('close', () => handleClientDisconnect(clientId));
  ws.on('error', () => handleClientDisconnect(clientId));

  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
    if (clients.has(clientId)) {
      clients.get(clientId).lastSeen = Date.now();
    }
  });
});

function handleWebSocketMessage(clientId, message) {
  const { type, roomId, targetId, data } = message;
  const client = clients.get(clientId);
  if (!client) return;

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
      client.ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      break;
    default:
      client.ws.send(JSON.stringify({ type: 'error', message: `Unknown type: ${type}` }));
  }
}

function handleJoinRoom(clientId, roomId) {
  const client = clients.get(clientId);
  if (!client || !roomId || !rooms.has(roomId)) return;

  const room = rooms.get(roomId);

  if (room.members.size >= 2) {
    client.ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
    return;
  }

  room.members.add(clientId);
  room.lastActivity = Date.now();
  client.roomId = roomId;

  const role = room.members.size === 1 ? 'sender' : 'receiver';

  client.ws.send(JSON.stringify({ type: 'role-assigned', role, roomSize: room.members.size, roomId }));

  broadcastToRoom(roomId, {
    type: 'user-joined',
    clientId,
    role,
    roomSize: room.members.size
  }, clientId);
}

function handleSignaling(fromClientId, targetId, data) {
  if (!targetId || !clients.has(targetId)) {
    const client = clients.get(fromClientId);
    if (client) {
      client.ws.send(JSON.stringify({ type: 'error', message: 'Target client not found' }));
    }
    return;
  }

  clients.get(targetId).ws.send(JSON.stringify({
    type: 'signal',
    clientId: fromClientId,
    data
  }));
}

function handleBinaryData(clientId, buffer) {
  const client = clients.get(clientId);
  if (!client?.roomId || !rooms.has(client.roomId)) return;

  const room = rooms.get(client.roomId);

  room.members.forEach((memberId) => {
    if (memberId === clientId || !clients.has(memberId)) return;

    const targetClient = clients.get(memberId);
    if (!targetClient?.ws || targetClient.ws.readyState !== WebSocket.OPEN) return;

    try {
      targetClient.ws.send(buffer, { binary: true });
    } catch {
      handleClientDisconnect(memberId);
    }
  });
}

function handleLeaveRoom(clientId, roomId) {
  const client = clients.get(clientId);
  if (!client || !roomId || !rooms.has(roomId)) return;

  const room = rooms.get(roomId);

  room.members.delete(clientId);
  room.lastActivity = Date.now();

  broadcastToRoom(roomId, {
    type: 'user-left',
    clientId,
    roomSize: room.members.size
  }, clientId);

  if (room.members.size === 0) rooms.delete(roomId);

  client.roomId = null;
}

function handleClientDisconnect(clientId) {
  const client = clients.get(clientId);
  if (client?.roomId) handleLeaveRoom(clientId, client.roomId);
  clients.delete(clientId);
}

function broadcastToRoom(roomId, message, excludeClientId) {
  if (!rooms.has(roomId)) return;

  rooms.get(roomId).members.forEach((memberId) => {
    if (memberId !== excludeClientId && clients.has(memberId)) {
      try {
        clients.get(memberId).ws.send(JSON.stringify(message));
      } catch {
        handleClientDisconnect(memberId);
      }
    }
  });
}

const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

const cleanupInterval = setInterval(() => {
  const now = Date.now();
  const maxIdleTime = 30 * 60 * 1000;

  rooms.forEach((room, roomId) => {
    if (room.members.size === 0 && now - room.lastActivity > maxIdleTime) {
      rooms.delete(roomId);
    }
  });
}, 5 * 60 * 1000);

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

function gracefulShutdown() {
  clearInterval(heartbeatInterval);
  clearInterval(cleanupInterval);

  clients.forEach((client) => {
    try {
      client.ws.send(JSON.stringify({ type: 'server-shutdown' }));
      client.ws.close(1001);
    } catch {}
  });

  wss.close(() => {
    server.close(() => process.exit(0));
  });

  setTimeout(() => process.exit(1), 10000);
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { app, server, wss };
