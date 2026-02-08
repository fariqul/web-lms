const { createServer } = require('http');
const { Server } = require('socket.io');

const PORT = process.env.SOCKET_PORT || 6001;
const INTERNAL_SECRET = process.env.SOCKET_INTERNAL_SECRET || 'lms-socket-secret-key-2026';
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'https://web-lms-rowr.vercel.app,http://localhost:3000').split(',');

const httpServer = createServer((req, res) => {
  // Health check endpoint
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', connections: io.engine.clientsCount }));
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
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Track rooms and connections
const roomMembers = new Map();

io.on('connection', (socket) => {
  const token = socket.handshake.auth?.token;
  console.log(`[connect] ${socket.id} (token: ${token ? 'yes' : 'no'})`);

  // Join exam monitoring room (for teachers)
  socket.on('join-exam', ({ examId }) => {
    const room = `exam.${examId}`;
    socket.join(room);
    console.log(`[room] ${socket.id} joined ${room}`);

    // Track room membership
    if (!roomMembers.has(room)) roomMembers.set(room, new Set());
    roomMembers.get(room).add(socket.id);

    socket.emit('room-joined', { room, members: roomMembers.get(room).size });
  });

  socket.on('leave-exam', ({ examId }) => {
    const room = `exam.${examId}`;
    socket.leave(room);
    if (roomMembers.has(room)) roomMembers.get(room).delete(socket.id);
    console.log(`[room] ${socket.id} left ${room}`);
  });

  // Join attendance session room (for teachers)
  socket.on('join-attendance', ({ sessionId }) => {
    const room = `attendance.${sessionId}`;
    socket.join(room);
    console.log(`[room] ${socket.id} joined ${room}`);

    if (!roomMembers.has(room)) roomMembers.set(room, new Set());
    roomMembers.get(room).add(socket.id);

    socket.emit('room-joined', { room, members: roomMembers.get(room).size });
  });

  socket.on('leave-attendance', ({ sessionId }) => {
    const room = `attendance.${sessionId}`;
    socket.leave(room);
    if (roomMembers.has(room)) roomMembers.get(room).delete(socket.id);
    console.log(`[room] ${socket.id} left ${room}`);
  });

  // Join notification room (per user)
  socket.on('join-user', ({ userId }) => {
    const room = `user.${userId}`;
    socket.join(room);
    console.log(`[room] ${socket.id} joined ${room}`);
  });

  socket.on('disconnect', (reason) => {
    // Clean up room membership
    for (const [room, members] of roomMembers) {
      members.delete(socket.id);
      if (members.size === 0) roomMembers.delete(room);
    }
    console.log(`[disconnect] ${socket.id} (${reason})`);
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 LMS Socket.io server running on port ${PORT}`);
  console.log(`   CORS origins: ${CORS_ORIGINS.join(', ')}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
});
