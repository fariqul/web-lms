'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface UseSocketOptions {
  url?: string;
  autoConnect?: boolean;
  auth?: Record<string, string>;
}

interface UseSocketReturn {
  socket: Socket | null;
  isConnected: boolean;
  emit: (event: string, data?: unknown) => void;
  on: (event: string, callback: (data: unknown) => void) => void;
  off: (event: string) => void;
  connect: () => void;
  disconnect: () => void;
}

export function useSocket({
  url = process.env.NEXT_PUBLIC_SOCKET_URL || 'https://52.63.72.178',
  autoConnect = true,
  auth,
}: UseSocketOptions = {}): UseSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const connect = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (socketRef.current?.connected) return;

    const token = localStorage.getItem('token');

    socketRef.current = io(url, {
      autoConnect: true,
      path: '/socket.io/',
      auth: {
        ...auth,
        token,
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    socketRef.current.on('connect', () => {
      setIsConnected(true);
    });

    socketRef.current.on('disconnect', () => {
      setIsConnected(false);
    });

    socketRef.current.on('connect_error', () => {
      // Silently handle connection errors
      setIsConnected(false);
    });
  }, [url, auth]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    }
  }, []);

  const emit = useCallback((event: string, data?: unknown) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    }
  }, []);

  const on = useCallback((event: string, callback: (data: unknown) => void) => {
    socketRef.current?.on(event, callback);
  }, []);

  const off = useCallback((event: string) => {
    socketRef.current?.off(event);
  }, []);

  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    socket: socketRef.current,
    isConnected,
    emit,
    on,
    off,
    connect,
    disconnect,
  };
}

// Specialized hook for exam monitoring
export function useExamSocket(examId: number) {
  const socket = useSocket();

  const joinExamRoom = useCallback(() => {
    socket.emit('join-exam', { examId });
  }, [socket, examId]);

  const leaveExamRoom = useCallback(() => {
    socket.emit('leave-exam', { examId });
  }, [socket, examId]);

  const onStudentJoined = useCallback((callback: (data: unknown) => void) => {
    socket.on(`exam.${examId}.student-joined`, callback);
  }, [socket, examId]);

  const onStudentSubmitted = useCallback((callback: (data: unknown) => void) => {
    socket.on(`exam.${examId}.student-submitted`, callback);
  }, [socket, examId]);

  const onViolationReported = useCallback((callback: (data: unknown) => void) => {
    socket.on(`exam.${examId}.violation`, callback);
  }, [socket, examId]);

  const onAnswerProgress = useCallback((callback: (data: unknown) => void) => {
    socket.on(`exam.${examId}.answer-progress`, callback);
  }, [socket, examId]);

  const onSnapshot = useCallback((callback: (data: unknown) => void) => {
    socket.on(`exam.${examId}.snapshot`, callback);
  }, [socket, examId]);

  useEffect(() => {
    joinExamRoom();
    return () => {
      leaveExamRoom();
    };
  }, [joinExamRoom, leaveExamRoom]);

  return {
    ...socket,
    joinExamRoom,
    leaveExamRoom,
    onStudentJoined,
    onStudentSubmitted,
    onViolationReported,
    onAnswerProgress,
    onSnapshot,
  };
}

// Specialized hook for attendance monitoring
export function useAttendanceSocket(sessionId: number) {
  const socket = useSocket();

  const joinSessionRoom = useCallback(() => {
    socket.emit('join-attendance', { sessionId });
  }, [socket, sessionId]);

  const leaveSessionRoom = useCallback(() => {
    socket.emit('leave-attendance', { sessionId });
  }, [socket, sessionId]);

  const onStudentScanned = useCallback((callback: (data: unknown) => void) => {
    socket.on(`attendance.${sessionId}.scanned`, callback);
  }, [socket, sessionId]);

  const onQRRefreshed = useCallback((callback: (data: unknown) => void) => {
    socket.on(`attendance.${sessionId}.qr-refreshed`, callback);
  }, [socket, sessionId]);

  useEffect(() => {
    joinSessionRoom();
    return () => {
      leaveSessionRoom();
    };
  }, [joinSessionRoom, leaveSessionRoom]);

  return {
    ...socket,
    joinSessionRoom,
    leaveSessionRoom,
    onStudentScanned,
    onQRRefreshed,
  };
}
