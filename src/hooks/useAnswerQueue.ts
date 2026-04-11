'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import api from '@/services/api';

/**
 * Answer save status for visual feedback
 */
export type AnswerSaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

interface QueuedAnswer {
  questionId: number;
  answer: string;
  timestamp: number;
  retries: number;
}

interface UseAnswerQueueOptions {
  examId: number;
  /** Debounce interval in ms (default: 2000) */
  debounceMs?: number;
  /** Max retries per answer (default: 5) */
  maxRetries?: number;
  /** Callback when an answer permanently fails */
  onPermanentFailure?: (questionId: number) => void;
}

interface UseAnswerQueueReturn {
  /** Queue an answer for saving (debounced) */
  queueAnswer: (questionId: number, answer: string) => void;
  /** Force flush all pending answers immediately */
  flushAll: () => Promise<void>;
  /** Per-question save status for UI feedback */
  saveStatuses: Record<number, AnswerSaveStatus>;
  /** Overall queue health */
  pendingCount: number;
  /** Number of answers that failed to save */
  errorCount: number;
  /** Whether any save is currently in flight */
  isSaving: boolean;
}

const STORAGE_KEY_PREFIX = 'exam_answer_queue_';

/**
 * useAnswerQueue — Reliable answer saving with retry, debounce, and offline queue.
 * 
 * Features:
 * - Debounces rapid answer changes (2s window → 1 batch API call)
 * - Retries failed saves with exponential backoff (up to 5 retries)
 * - Persists pending answers in localStorage (survives page refresh)
 * - Provides per-question save status for visual feedback
 * - Batch API endpoint for efficiency (reduces 70% of API calls)
 */
export function useAnswerQueue({
  examId,
  debounceMs = 2000,
  maxRetries = 5,
  onPermanentFailure,
}: UseAnswerQueueOptions): UseAnswerQueueReturn {
  const [saveStatuses, setSaveStatuses] = useState<Record<number, AnswerSaveStatus>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Refs for the queue (avoid re-renders on every queue change)
  const queueRef = useRef<Map<number, QueuedAnswer>>(new Map());
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const flushingRef = useRef(false);

  // Storage key for this exam
  const storageKey = `${STORAGE_KEY_PREFIX}${examId}`;

  // Restore pending answers from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed: [number, QueuedAnswer][] = JSON.parse(stored);
        const map = new Map(parsed);
        queueRef.current = map;

        // Mark restored items as pending
        const statuses: Record<number, AnswerSaveStatus> = {};
        map.forEach((_, qId) => {
          statuses[qId] = 'pending';
        });
        setSaveStatuses(prev => ({ ...prev, ...statuses }));

        // Auto-flush restored items after 1s
        setTimeout(() => {
          if (mountedRef.current) flushQueue();
        }, 1000);
      }
    } catch {
      // Ignore localStorage errors
    }

    return () => {
      mountedRef.current = false;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  // Persist queue to localStorage whenever it changes
  const persistQueue = useCallback(() => {
    try {
      const entries = Array.from(queueRef.current.entries());
      if (entries.length > 0) {
        localStorage.setItem(storageKey, JSON.stringify(entries));
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [storageKey]);

  // Flush the queue — send batch to server  
  const flushQueue = useCallback(async () => {
    if (flushingRef.current) return;
    if (queueRef.current.size === 0) return;

    flushingRef.current = true;
    setIsSaving(true);

    // Snapshot the current queue
    const batch = new Map(queueRef.current);
    const questionIds = Array.from(batch.keys());

    // Mark all as 'saving'
    const savingStatuses: Record<number, AnswerSaveStatus> = {};
    questionIds.forEach(qId => { savingStatuses[qId] = 'saving'; });
    setSaveStatuses(prev => ({ ...prev, ...savingStatuses }));

    try {
      // Build batch payload
      const answersPayload = Array.from(batch.entries()).map(([questionId, item]) => ({
        question_id: questionId,
        answer: item.answer,
      }));

      await api.post(`/exams/${examId}/answers/batch`, {
        answers: answersPayload,
      });

      // Success — remove from queue, mark as saved
      const successStatuses: Record<number, AnswerSaveStatus> = {};
      questionIds.forEach(qId => {
        // Only remove if the queue still has the same timestamp (hasn't been updated)
        const current = queueRef.current.get(qId);
        const original = batch.get(qId);
        if (current && original && current.timestamp === original.timestamp) {
          queueRef.current.delete(qId);
        }
        successStatuses[qId] = 'saved';
      });

      if (mountedRef.current) {
        setSaveStatuses(prev => ({ ...prev, ...successStatuses }));
      }
      persistQueue();

      // Clear 'saved' status after 3s
      setTimeout(() => {
        if (mountedRef.current) {
          setSaveStatuses(prev => {
            const updated = { ...prev };
            questionIds.forEach(qId => {
              if (updated[qId] === 'saved') {
                updated[qId] = 'idle';
              }
            });
            return updated;
          });
        }
      }, 3000);
    } catch (error) {
      console.warn('[AnswerQueue] Batch save failed, will retry:', error);

      // Mark as error, increment retry count
      const errorStatuses: Record<number, AnswerSaveStatus> = {};
      const permanentFails: number[] = [];

      questionIds.forEach(qId => {
        const item = queueRef.current.get(qId);
        if (item) {
          item.retries += 1;
          if (item.retries >= maxRetries) {
            // Permanent failure
            errorStatuses[qId] = 'error';
            permanentFails.push(qId);
          } else {
            errorStatuses[qId] = 'pending';
          }
        }
      });

      if (mountedRef.current) {
        setSaveStatuses(prev => ({ ...prev, ...errorStatuses }));
      }
      persistQueue();

      // Notify permanent failures
      permanentFails.forEach(qId => {
        onPermanentFailure?.(qId);
      });

      // Schedule retry with exponential backoff
      const minRetries = Math.min(...Array.from(batch.values()).map(v => v.retries));
      const backoffMs = Math.min(30000, 2000 * Math.pow(2, minRetries));

      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = setTimeout(() => {
        if (mountedRef.current && queueRef.current.size > 0) {
          flushQueue();
        }
      }, backoffMs);
    } finally {
      flushingRef.current = false;
      if (mountedRef.current) {
        setIsSaving(queueRef.current.size > 0);
      }
    }
  }, [examId, maxRetries, onPermanentFailure, persistQueue]);

  // Queue an answer (with debounce)
  const queueAnswer = useCallback((questionId: number, answer: string) => {
    queueRef.current.set(questionId, {
      questionId,
      answer,
      timestamp: Date.now(),
      retries: 0,
    });

    setSaveStatuses(prev => ({ ...prev, [questionId]: 'pending' }));
    persistQueue();

    // Debounce: wait for more answers before flushing
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      if (mountedRef.current) flushQueue();
    }, debounceMs);
  }, [debounceMs, flushQueue, persistQueue]);

  // Force flush all pending answers (used before submit)
  const flushAll = useCallback(async () => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    
    // Try up to 3 times to flush everything
    for (let attempt = 0; attempt < 3; attempt++) {
      if (queueRef.current.size === 0) break;
      await flushQueue();
      if (queueRef.current.size === 0) break;
      // Small delay between retries
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }, [flushQueue]);

  // Cleanup localStorage when exam finishes
  const cleanup = useCallback(() => {
    localStorage.removeItem(storageKey);
    queueRef.current.clear();
  }, [storageKey]);

  // Expose cleanup via window for finish handlers  
  useEffect(() => {
    (window as unknown as Record<string, () => void>)[`cleanupAnswerQueue_${examId}`] = cleanup;
    return () => {
      delete (window as unknown as Record<string, () => void>)[`cleanupAnswerQueue_${examId}`];
    };
  }, [examId, cleanup]);

  const pendingCount = queueRef.current.size;
  const errorCount = Object.values(saveStatuses).filter(s => s === 'error').length;

  return {
    queueAnswer,
    flushAll,
    saveStatuses,
    pendingCount,
    errorCount,
    isSaving,
  };
}
