const { createServer } = require('http');
const { Server } = require('socket.io');

const PORT = process.env.SOCKET_PORT || 6001;
const INTERNAL_SECRET = process.env.SOCKET_INTERNAL_SECRET || 'lms-socket-secret-key-2026';
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'https://web-lms-rowr.vercel.app,http://localhost:3000').split(',');

// Performance tuning for 300-500 concurrent users
const MAX_CONNECTIONS = 600; // Allow some headroom
const RATE_LIMIT_WINDOW = 1000; // 1 second window
const RATE_LIMIT_MAX = 20; // max events per window per socket
const CONNECTION_TIMEOUT = 45000; // 45 seconds for slow connections

const httpServer = createServer((req, res) => {
  // Health check endpoint with detailed stats
  if (req.url === '/health' && req.method === 'GET') {
    const stats = {
      status: 'ok',
      connections: io.engine.clientsCount,
      rooms: roomMembers.size,
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

io.on('connection', (socket) => {
  const token = socket.handshake.auth?.token;
  console.log(`[connect] ${socket.id} (total: ${io.engine.clientsCount})`);

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

  // Join notification room (per user)
  socket.on('join-user', ({ userId }) => {
    if (!userId) return;
    const room = `user.${userId}`;
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
