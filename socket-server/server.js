const { createServer } = require('http');
const { Server } = require('socket.io');

const PORT = process.env.SOCKET_PORT || 6001;
const INTERNAL_SECRET = process.env.SOCKET_INTERNAL_SECRET || 'lms-socket-secret-key-2026';
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'https://www.libelslms.my.id,https://libelslms.my.id,https://web-lms-rowr.vercel.app,http://localhost:3000').split(',');
const BACKEND_API_URL = process.env.BACKEND_API_URL || 'http://backend:8000/api';

// Performance tuning for 600-800 concurrent users (Intel i5 Gen 13 + 64GB RAM)
const MAX_CONNECTIONS = 2000; // Higher headroom for 64GB server
const RATE_LIMIT_WINDOW = 1000; // 1 second window
const RATE_LIMIT_MAX = 30; // max events per window per socket
const CONNECTION_TIMEOUT = 45000; // 45 seconds for slow connections
const ALLOWED_SYSTEM_ROOMS = new Set(['system.snapshot-monitor']);

const httpServer = createServer((req, res) => {
  // Health check endpoint with detailed stats
  if (req.url === '/health' && req.method === 'GET') {
    const examSocketIds = new Set();
    let examRooms = 0;
    let examMembersTotal = 0;

    for (const [room, members] of roomMembers) {
      if (!room.startsWith('exam.')) continue;
      examRooms += 1;
      examMembersTotal += members.size;
      for (const socketId of members) {
        examSocketIds.add(socketId);
      }
    }

    const stats = {
      status: 'ok',
      connections: io.engine.clientsCount,
      rooms: roomMembers.size,
      exam_connections: examSocketIds.size,
      exam_rooms: examRooms,
      exam_members_total: examMembersTotal,
      maxConnections: MAX_CONNECTIONS,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(stats));
    return;
  }

  // Internal broadcast endpoint (called by Laravel backend)
  if (req.url === '/broadcast' && req.method === 'POST') {
    const authHeader = req.headers['authorization'];
    if (authHeader !== `Bearer ${INTERNAL_SECRET}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { event, room, data } = JSON.parse(body);

        if (room) {
          io.to(room).emit(event, data);
          console.log(`[broadcast] ${event} -> room:${room}`, JSON.stringify(data).substring(0, 100));
        } else {
          io.emit(event, data);
          console.log(`[broadcast] ${event} -> all`, JSON.stringify(data).substring(0, 100));
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        console.error('[broadcast] Parse error:', err.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  // Prefer WebSocket for better performance, fallback to polling
  transports: ['websocket', 'polling'],
  // Connection settings optimized for 300-500 users
  pingTimeout: 30000, // Reduced for faster disconnect detection
  pingInterval: 15000, // More frequent pings for better connection health
  upgradeTimeout: 10000, // Faster upgrade timeout
  maxHttpBufferSize: 1e6, // 1MB max message size
  // Performance optimizations
  perMessageDeflate: {
    threshold: 1024, // Only compress messages > 1KB
  },
  // Connection limits
  connectTimeout: CONNECTION_TIMEOUT,
  allowEIO3: false, // Disable legacy Engine.IO v3
});

// Track rooms and connections
const roomMembers = new Map();
// Rate limiting map: socketId -> { count, resetTime }
const rateLimits = new Map();

// Connection limiting middleware
io.use((socket, next) => {
  if (io.engine.clientsCount >= MAX_CONNECTIONS) {
    console.log(`[reject] Connection limit reached (${io.engine.clientsCount}/${MAX_CONNECTIONS})`);
    return next(new Error('Server at capacity. Please try again later.'));
  }
  next();
});

// Rate limiting helper
function checkRateLimit(socketId) {
  const now = Date.now();
  let limit = rateLimits.get(socketId);
  
  if (!limit || now > limit.resetTime) {
    limit = { count: 1, resetTime: now + RATE_LIMIT_WINDOW };
    rateLimits.set(socketId, limit);
    return true;
  }
  
  if (limit.count >= RATE_LIMIT_MAX) {
    return false;
  }
  
  limit.count++;
  return true;
}

async function resolveUserIdFromToken(token) {
  if (!token || typeof token !== 'string') {
    return null;
  }

  try {
    const response = await fetch(`${BACKEND_API_URL}/me`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const userId = Number(data?.data?.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return null;
    }

    return userId;
  } catch (err) {
    console.error('[auth] Failed to verify socket token:', err?.message || err);
    return null;
  }
}

io.on('connection', (socket) => {
  const token = socket.handshake.auth?.token;
  console.log(`[connect] ${socket.id} (total: ${io.engine.clientsCount})`);
  socket.data.authChecked = false;
  socket.data.authUserId = null;

  const resolveAuthenticatedUserId = async () => {
    if (socket.data.authChecked) {
      return socket.data.authUserId;
    }

    socket.data.authChecked = true;
    socket.data.authUserId = await resolveUserIdFromToken(token);
    return socket.data.authUserId;
  };

  // Helper to join room with rate limiting
  const joinRoom = (room) => {
    if (!checkRateLimit(socket.id)) {
      socket.emit('error', { message: 'Rate limit exceeded' });
      return false;
    }
    socket.join(room);
    if (!roomMembers.has(room)) roomMembers.set(room, new Set());
    roomMembers.get(room).add(socket.id);
    return true;
  };

  // Helper to leave room
  const leaveRoom = (room) => {
    socket.leave(room);
    if (roomMembers.has(room)) {
      roomMembers.get(room).delete(socket.id);
      if (roomMembers.get(room).size === 0) roomMembers.delete(room);
    }
  };

  // Join exam monitoring room (for teachers)
  socket.on('join-exam', ({ examId }) => {
    if (!examId) return;
    const room = `exam.${examId}`;
    if (joinRoom(room)) {
      console.log(`[room] ${socket.id} joined ${room}`);
      socket.emit('room-joined', { room, members: roomMembers.get(room)?.size || 0 });
    }
  });

  socket.on('leave-exam', ({ examId }) => {
    if (!examId) return;
    const room = `exam.${examId}`;
    leaveRoom(room);
    console.log(`[room] ${socket.id} left ${room}`);
  });

  // Join attendance session room (for teachers)
  socket.on('join-attendance', ({ sessionId }) => {
    if (!sessionId) return;
    const room = `attendance.${sessionId}`;
    if (joinRoom(room)) {
      console.log(`[room] ${socket.id} joined ${room}`);
      socket.emit('room-joined', { room, members: roomMembers.get(room)?.size || 0 });
    }
  });

  socket.on('leave-attendance', ({ sessionId }) => {
    if (!sessionId) return;
    const room = `attendance.${sessionId}`;
    leaveRoom(room);
    console.log(`[room] ${socket.id} left ${room}`);
  });

  socket.on('join-system', async (payload = {}) => {
    const safePayload = payload && typeof payload === 'object' ? payload : {};
    const { room } = safePayload;
    if (!room || !ALLOWED_SYSTEM_ROOMS.has(room)) return;
    const authenticatedUserId = await resolveAuthenticatedUserId();
    if (!authenticatedUserId) {
      socket.emit('error', { message: 'Unauthorized join-system request' });
      console.warn(`[auth] join-system rejected for socket ${socket.id}: room=${room}`);
      return;
    }

    if (joinRoom(room)) {
      console.log(`[room] ${socket.id} joined ${room}`);
    }
  });

  socket.on('leave-system', async (payload = {}) => {
    const safePayload = payload && typeof payload === 'object' ? payload : {};
    const { room } = safePayload;
    if (!room || !ALLOWED_SYSTEM_ROOMS.has(room)) return;
    const authenticatedUserId = await resolveAuthenticatedUserId();
    if (!authenticatedUserId) {
      socket.emit('error', { message: 'Unauthorized leave-system request' });
      console.warn(`[auth] leave-system rejected for socket ${socket.id}: room=${room}`);
      return;
    }

    leaveRoom(room);
    console.log(`[room] ${socket.id} left ${room}`);
  });

  // Join notification room (per user)
  socket.on('join-user', async ({ userId }) => {
    const requestedUserId = Number(userId);
    if (!Number.isInteger(requestedUserId) || requestedUserId <= 0) return;

    const authenticatedUserId = await resolveAuthenticatedUserId();
    if (!authenticatedUserId || authenticatedUserId !== requestedUserId) {
      socket.emit('error', { message: 'Unauthorized join-user request' });
      console.warn(`[auth] join-user rejected for socket ${socket.id}: requested=${requestedUserId}, authenticated=${authenticatedUserId}`);
      return;
    }

    const room = `user.${requestedUserId}`;
    if (joinRoom(room)) {
      console.log(`[room] ${socket.id} joined ${room}`);
    }
  });

  socket.on('disconnect', (reason) => {
    // Clean up room membership efficiently
    for (const [room, members] of roomMembers) {
      if (members.has(socket.id)) {
        members.delete(socket.id);
        if (members.size === 0) roomMembers.delete(room);
      }
    }
    // Clean up rate limit entry
    rateLimits.delete(socket.id);
    console.log(`[disconnect] ${socket.id} (${reason}, total: ${io.engine.clientsCount})`);
  });

  // Handle errors gracefully
  socket.on('error', (err) => {
    console.error(`[error] ${socket.id}:`, err.message);
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 LMS Socket.io server running on port ${PORT}`);
  console.log(`   Max connections: ${MAX_CONNECTIONS}`);
  console.log(`   CORS origins: ${CORS_ORIGINS.join(', ')}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
});

// Periodic cleanup of stale rate limit entries (every 30 seconds)
setInterval(() => {
  const now = Date.now();
  for (const [socketId, limit] of rateLimits) {
    if (now > limit.resetTime + 60000) { // Clean entries older than 1 minute
      rateLimits.delete(socketId);
    }
  }
}, 30000);

// Graceful shutdown
const shutdown = (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  
  // Notify all clients
  io.emit('server-shutdown', { message: 'Server is restarting' });
  
  // Close all connections
  io.close(() => {
    console.log('All connections closed');
    httpServer.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
  });
  
  // Force exit after 10 seconds
  setTimeout(() => {
    console.log('Forcing shutdown...');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
