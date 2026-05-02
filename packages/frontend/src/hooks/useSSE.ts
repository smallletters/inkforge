import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuthStore } from '../lib/store';

export type SseEventType = 'pipeline.start' | 'agent.start' | 'agent.complete' | 'agent.error' | 'audit.complete' | 'audit.revision' | 'pipeline.complete' | 'pipeline.fail' | 'pipeline.progress';

export interface SseEventData {
  pipeline_id: string;
  novel_id?: string;
  chapter_number?: number;
  agent_name?: string;
  duration_ms?: number;
  output_summary?: string;
  error_type?: string;
  retry_count?: number;
  passed?: boolean;
  issues_found?: number;
  revision_count?: number;
  issues_remaining?: number;
  chapter_id?: string;
  word_count?: number;
  failed_agent?: string;
  error?: string;
  percentage?: number;
  current_agent?: string;
}

export interface PipelineStatus {
  pipelineId: string;
  status: 'running' | 'completed' | 'failed';
  currentAgent: string | null;
  progress: number;
  agents: Array<{ name: string; status: 'pending' | 'running' | 'completed' | 'failed'; duration?: number }>;
  estimatedTime?: number;
  startTime?: Date;
}

const PIPELINE_AGENTS = ['radar', 'planner', 'composer', 'architect', 'writer', 'observer', 'reflector', 'normalizer', 'auditor', 'reviser'] as const;

export function useSSE(novelId?: string) {
  const token = useAuthStore((s) => s.token);
  const esRef = useRef<EventSource | null>(null);
  const listenersRef = useRef<Array<{ event: SseEventType; handler: (e: MessageEvent) => void }>>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(null);
  const [recentEvents, setRecentEvents] = useState<Array<{ type: SseEventType; data: SseEventData; timestamp: Date }>>([]);

  const resetPipeline = useCallback(() => {
    setPipelineStatus({
      pipelineId: '',
      status: 'running',
      currentAgent: null,
      progress: 0,
      agents: PIPELINE_AGENTS.map(name => ({ name, status: 'pending' })),
      startTime: new Date(),
    });
  }, []);

  useEffect(() => {
    if (!token) return;

    const events: SseEventType[] = ['pipeline.start', 'agent.start', 'agent.complete', 'agent.error', 'audit.complete', 'audit.revision', 'pipeline.complete', 'pipeline.fail', 'pipeline.progress'];
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 3;

    const connect = () => {
      const encodedToken = encodeURIComponent(token);
      const es = new EventSource(`/events?token=${encodedToken}`);
      esRef.current = es;

      es.onopen = () => {
        console.log('SSE connected');
        setIsConnected(true);
        reconnectAttempts = 0;
      };

      es.onerror = (e) => {
        console.error('SSE connection error:', e);
        setIsConnected(false);
        
        es.close();
        
        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          console.log(`SSE reconnecting... attempt ${reconnectAttempts}/${maxReconnectAttempts}`);
          setTimeout(connect, 2000 * reconnectAttempts);
        } else {
          console.error('SSE max reconnect attempts reached');
        }
      };

      const handleEvent = (eventType: SseEventType) => {
        return (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data) as SseEventData;
            
            if (novelId && data.novel_id !== novelId) return;

            setRecentEvents(prev => [{ type: eventType, data, timestamp: new Date() }, ...prev].slice(0, 50));

            switch (eventType) {
              case 'pipeline.start':
                setPipelineStatus({
                  pipelineId: data.pipeline_id,
                  status: 'running',
                  currentAgent: null,
                  progress: 0,
                  agents: PIPELINE_AGENTS.map(name => ({ name, status: 'pending' })),
                  startTime: new Date(),
                });
                break;

              case 'agent.start':
                setPipelineStatus(prev => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    currentAgent: data.agent_name ?? null,
                    agents: prev.agents.map(a => 
                      a.name === data.agent_name ? { ...a, status: 'running' } : a
                    ),
                  };
                });
                break;

              case 'agent.complete':
                setPipelineStatus(prev => {
                  if (!prev) return prev;
                  const completedCount = prev.agents.filter(a => a.status === 'completed').length + 1;
                  const progress = Math.round((completedCount / prev.agents.length) * 100);
                  
                  return {
                    ...prev,
                    progress,
                    agents: prev.agents.map(a => 
                      a.name === data.agent_name ? { ...a, status: 'completed', duration: data.duration_ms } : a
                    ),
                  };
                });
                break;

              case 'agent.error':
                setPipelineStatus(prev => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    status: 'failed',
                    agents: prev.agents.map(a => 
                      a.name === data.agent_name ? { ...a, status: 'failed' } : a
                    ),
                  };
                });
                break;

              case 'pipeline.complete':
                setPipelineStatus(prev => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    status: 'completed',
                    currentAgent: null,
                    progress: 100,
                    agents: prev.agents.map(a => a.status === 'pending' ? { ...a, status: 'completed' } : a),
                  };
                });
                break;

              case 'pipeline.fail':
                setPipelineStatus(prev => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    status: 'failed',
                    currentAgent: null,
                  };
                });
                break;

              case 'pipeline.progress':
                setPipelineStatus(prev => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    progress: data.percentage ?? prev.progress,
                    currentAgent: data.current_agent ?? prev.currentAgent,
                  };
                });
                break;
            }
          } catch (err) {
            console.error('Failed to parse SSE event:', err);
          }
        };
      };

      listenersRef.current = [];
      events.forEach(event => {
        const handler = handleEvent(event);
        listenersRef.current.push({ event, handler });
        es.addEventListener(event, handler);
      });
    };

    connect();

    return () => {
      if (esRef.current) {
        listenersRef.current.forEach(({ event, handler }) => {
          esRef.current?.removeEventListener(event, handler);
        });
        esRef.current.close();
        esRef.current = null;
        listenersRef.current = [];
      }
      setIsConnected(false);
    };
  }, [token, novelId]);

  return {
    isConnected,
    pipelineStatus,
    recentEvents,
    resetPipeline,
  };
}