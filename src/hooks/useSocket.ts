'use client';

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
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
  url = process.env.NEXT_PUBLIC_SOCKET_URL || 'https://sma15lms.duckdns.org',
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

  return useMemo(() => ({
    socket: socketRef.current,
    isConnected,
    emit,
    on,
    off,
    connect,
    disconnect,
  }), [isConnected, emit, on, off, connect, disconnect]);
}

// Specialized hook for exam monitoring
export function useExamSocket(examId: number) {
  const { on, off, emit, isConnected, connect, disconnect } = useSocket();

  const joinExamRoom = useCallback(() => {
    emit('join-exam', { examId });
  }, [emit, examId]);

  const leaveExamRoom = useCallback(() => {
    emit('leave-exam', { examId });
  }, [emit, examId]);

  const onStudentJoined = useCallback((callback: (data: unknown) => void) => {
    on(`exam.${examId}.student-joined`, callback);
  }, [on, examId]);

  const onStudentSubmitted = useCallback((callback: (data: unknown) => void) => {
    on(`exam.${examId}.student-submitted`, callback);
  }, [on, examId]);

  const onViolationReported = useCallback((callback: (data: unknown) => void) => {
    on(`exam.${examId}.violation`, callback);
  }, [on, examId]);

  const onAnswerProgress = useCallback((callback: (data: unknown) => void) => {
    on(`exam.${examId}.answer-progress`, callback);
  }, [on, examId]);

  const onSnapshot = useCallback((callback: (data: unknown) => void) => {
    on(`exam.${examId}.snapshot`, callback);
  }, [on, examId]);

  const onExamEnded = useCallback((callback: (data: unknown) => void) => {
    on(`exam.${examId}.ended`, callback);
  }, [on, examId]);

  useEffect(() => {
    if (examId > 0) {
      joinExamRoom();
    }
    return () => {
      if (examId > 0) {
        leaveExamRoom();
      }
    };
  }, [examId, joinExamRoom, leaveExamRoom]);

  return useMemo(() => ({
    isConnected,
    emit,
    on,
    off,
    connect,
    disconnect,
    joinExamRoom,
    leaveExamRoom,
    onStudentJoined,
    onStudentSubmitted,
    onViolationReported,
    onAnswerProgress,
    onSnapshot,
    onExamEnded,
  }), [isConnected, emit, on, off, connect, disconnect, joinExamRoom, leaveExamRoom, onStudentJoined, onStudentSubmitted, onViolationReported, onAnswerProgress, onSnapshot, onExamEnded]);
}

// Specialized hook for attendance monitoring
export function useAttendanceSocket(sessionId: number) {
  const { on, off, emit, isConnected, connect, disconnect } = useSocket();

  const joinSessionRoom = useCallback(() => {
    emit('join-attendance', { sessionId });
  }, [emit, sessionId]);

  const leaveSessionRoom = useCallback(() => {
    emit('leave-attendance', { sessionId });
  }, [emit, sessionId]);

  const onStudentScanned = useCallback((callback: (data: unknown) => void) => {
    on(`attendance.${sessionId}.scanned`, callback);
  }, [on, sessionId]);

  const onQRRefreshed = useCallback((callback: (data: unknown) => void) => {
    on(`attendance.${sessionId}.qr-refreshed`, callback);
  }, [on, sessionId]);

  const onDeviceSwitchRequested = useCallback((callback: (data: unknown) => void) => {
    on(`attendance.${sessionId}.device-switch-requested`, callback);
  }, [on, sessionId]);

  const onDeviceSwitchHandled = useCallback((callback: (data: unknown) => void) => {
    on(`attendance.${sessionId}.device-switch-handled`, callback);
  }, [on, sessionId]);

  useEffect(() => {
    if (sessionId > 0) {
      joinSessionRoom();
    }
    return () => {
      if (sessionId > 0) {
        leaveSessionRoom();
      }
    };
  }, [sessionId, joinSessionRoom, leaveSessionRoom]);

  return useMemo(() => ({
    isConnected,
    emit,
    on,
    off,
    connect,
    disconnect,
    joinSessionRoom,
    leaveSessionRoom,
    onStudentScanned,
    onQRRefreshed,
    onDeviceSwitchRequested,
    onDeviceSwitchHandled,
  }), [isConnected, emit, on, off, connect, disconnect, joinSessionRoom, leaveSessionRoom, onStudentScanned, onQRRefreshed, onDeviceSwitchRequested, onDeviceSwitchHandled]);
}

// Hook for listening to device switch events across multiple attendance sessions
export function useDeviceSwitchSocket(sessionIds: number[]) {
  const { on, off, emit, isConnected, connect, disconnect } = useSocket();

  useEffect(() => {
    // Join all attendance session rooms
    for (const sessionId of sessionIds) {
      emit('join-attendance', { sessionId });
    }

    return () => {
      for (const sessionId of sessionIds) {
        emit('leave-attendance', { sessionId });
      }
    };
  }, [emit, sessionIds]);

  const onDeviceSwitchRequested = useCallback((callback: (data: unknown) => void) => {
    for (const sessionId of sessionIds) {
      on(`attendance.${sessionId}.device-switch-requested`, callback);
    }
    return () => {
      for (const sessionId of sessionIds) {
        off(`attendance.${sessionId}.device-switch-requested`);
      }
    };
  }, [on, off, sessionIds]);

  return useMemo(() => ({
    isConnected,
    emit,
    on,
    off,
    connect,
    disconnect,
    onDeviceSwitchRequested,
  }), [isConnected, emit, on, off, connect, disconnect, onDeviceSwitchRequested]);
}
