import { useCallback, useEffect, useRef, useState } from 'react';

import { streamChat } from '@/lib/api';
import { SessionResponse } from '@/lib/types';

import type { UpdatePageFn } from '@/hooks/useSessionState';

interface UseChatStreamParams {
  session: SessionResponse | null;
  currentPage: number;
  canAsk: boolean;
  updatePage: UpdatePageFn;
}

export function useChatStream({
  session,
  currentPage,
  canAsk,
  updatePage,
}: UseChatStreamParams) {
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatDraftAnswer, setChatDraftAnswer] = useState('');
  const chatAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setChatInput('');
    setChatDraftAnswer('');
    setChatSending(false);
  }, [currentPage]);

  const sendChatMessage = useCallback(async (rawMessage: string) => {
    const message = rawMessage.trim();
    if (!message || !session || !canAsk) return;

    // abort any in-flight request
    chatAbortRef.current?.abort();
    const controller = new AbortController();
    chatAbortRef.current = controller;

    setChatSending(true);

    updatePage(currentPage, (current) => ({
      ...current,
      chat: [...current.chat, { role: 'user', content: message }],
    }));

    let answerBuffer = '';

    try {
      await streamChat(session.sessionId, currentPage, session.model, message, (event) => {
        if (event.type === 'chunk') {
          answerBuffer += event.content;
          setChatDraftAnswer(answerBuffer);
          return;
        }
        if (event.type === 'done') {
          updatePage(currentPage, (current) => ({
            ...current,
            chat: [...current.chat, { role: 'assistant', content: answerBuffer }],
          }));
          setChatDraftAnswer('');
          return;
        }
        if (event.type === 'error') {
          setChatDraftAnswer(`回答失败：${event.content}`);
        }
      }, controller.signal);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setChatDraftAnswer(`回答失败：${err instanceof Error ? err.message : '未知错误'}`);
      }
    } finally {
      setChatSending(false);
      chatAbortRef.current = null;
    }
  }, [canAsk, currentPage, session, updatePage]);

  const sendChat = useCallback(async () => {
    const message = chatInput.trim();
    if (!message) return;
    setChatInput('');
    await sendChatMessage(message);
  }, [chatInput, sendChatMessage]);

  const abortChat = useCallback(() => {
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
    setChatSending(false);
    setChatDraftAnswer('');
  }, []);

  return {
    chatInput,
    setChatInput,
    chatSending,
    chatDraftAnswer,
    sendChat,
    sendChatMessage,
    abortChat,
  };
}
