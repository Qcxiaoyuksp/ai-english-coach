// ============================================================
// TranscriptPanel — Real-time Conversation Transcript
// ============================================================
// Displays the conversation history as chat bubbles with
// auto-scrolling and time stamps.
// ============================================================

'use client';

import { useRef, useEffect } from 'react';
import { Message } from '@/types';

interface TranscriptPanelProps {
  messages: Message[];
  className?: string;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function TranscriptPanel({
  messages,
  className = '',
}: TranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isUserScrolledRef = useRef(false);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (!isUserScrolledRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Detect manual scroll
  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    // If user scrolls up more than 50px from bottom, lock manual scroll
    isUserScrolledRef.current = scrollHeight - scrollTop - clientHeight > 50;
  };

  if (messages.length === 0) return null;

  return (
    <div className={`practice-transcript ${className}`}>
      <div className="practice-transcript-title">
        💬 对话记录
      </div>
      <div
        ref={scrollRef}
        className="practice-transcript-messages"
        onScroll={handleScroll}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`practice-message ${msg.role === 'user' ? 'user' : 'ai'}`}
          >
            <div className="practice-message-role">
              {msg.role === 'user' ? '🧑 You' : '🤖 AI Coach'}{' '}
              <span style={{ marginLeft: '0.5rem', opacity: 0.5 }}>
                {formatTime(msg.timestamp)}
              </span>
            </div>
            <div className="practice-message-content">{msg.content}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
