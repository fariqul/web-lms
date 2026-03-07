module.exports = {
  apps: [{
    name: 'lms-socket',
    script: 'server.js',
    // Single instance since Socket.io needs Redis for cluster mode
    // For high concurrency without Redis, one process handles WebSocket efficiently
    instances: 1,
    exec_mode: 'fork',
    // Auto-restart on crash
    autorestart: true,
    watch: false,
    max_memory_restart: '2G',
    // Environment
    env: {
      NODE_ENV: 'production',
    },
    // Logging
    error_file: '/dev/stderr',
    out_file: '/dev/stdout',
    merge_logs: true,
    // Graceful shutdown
    kill_timeout: 10000,
    wait_ready: true,
    listen_timeout: 10000,
  }]
};
