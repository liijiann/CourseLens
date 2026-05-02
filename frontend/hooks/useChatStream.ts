import { useCallback, useEffect, useRef, useState } from 'react';

import { clearChatHistory, streamChat } from '@/lib/api';
import { MODELS } from '@/lib/models';
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
  const [chatImages, setChatImages] = useState<string[]>([]);
  const [chatSending, setChatSending] = useState(false);
  const [chatModel, setChatModel] = useState<string>(MODELS[0]?.value ?? 'qwen3.6-flash');
  const [clearingHistory, setClearingHistory] = useState(false);
  const [chatDraftAnswer, setChatDraftAnswer] = useState('');
  const chatAbortRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
  }, []);

  useEffect(() => {
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
    setChatInput('');
    setChatImages([]);
    setChatDraftAnswer('');
    setChatSending(false);
  }, [currentPage]);

  useEffect(() => {
    if (!session) return;
    setChatModel(session.model);
  }, [session?.model, session?.sessionId]);

  const sendChatMessage = useCallback(async (rawMessage: string, rawImages?: string[]) => {
    const message = rawMessage.trim();
    const images = (rawImages ?? []).slice(0, 3);
    if ((!message && images.length === 0) || !session || !canAsk) return;

    chatAbortRef.current?.abort();
    const controller = new AbortController();
    chatAbortRef.current = controller;

    setChatSending(true);
    setChatDraftAnswer('');

    updatePage(currentPage, (current) => ({
      ...current,
      chat: [...current.chat, { role: 'user', content: message, images }],
    }));

    let answerBuffer = '';

    try {
      await streamChat(session.sessionId, currentPage, chatModel, message, images, (event) => {
        if (chatAbortRef.current !== controller) return;
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
      if (chatAbortRef.current === controller) {
        setChatSending(false);
        chatAbortRef.current = null;
      }
    }
  }, [canAsk, chatModel, currentPage, session, updatePage]);

  const sendChat = useCallback(async () => {
    const message = chatInput.trim();
    const images = chatImages;
    if (!message && images.length === 0) return;
    setChatInput('');
    setChatImages([]);
    await sendChatMessage(message, images);
  }, [chatImages, chatInput, sendChatMessage]);

  const addChatImages = useCallback((nextImages: string[]) => {
    if (!nextImages.length) return;
    setChatImages((current) => {
      const merged = [...current];
      for (const image of nextImages) {
        if (!image) continue;
        merged.push(image);
        if (merged.length >= 3) break;
      }
      return merged.slice(0, 3);
    });
  }, []);

  const removeChatImage = useCallback((index: number) => {
    setChatImages((current) => current.filter((_, i) => i !== index));
  }, []);

  const clearHistory = useCallback(async () => {
    if (!session) return;
    setClearingHistory(true);
    try {
      await clearChatHistory(session.sessionId, currentPage);
      updatePage(currentPage, (current) => ({
        ...current,
        chat: [],
      }));
      setChatDraftAnswer('');
    } finally {
      setClearingHistory(false);
    }
  }, [currentPage, session, updatePage]);

  const abortChat = useCallback(() => {
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
    setChatSending(false);
    setChatDraftAnswer('');
  }, []);

  return {
    chatInput,
    setChatInput,
    chatImages,
    chatSending,
    chatModel,
    setChatModel,
    clearingHistory,
    chatDraftAnswer,
    sendChat,
    sendChatMessage,
    addChatImages,
    removeChatImage,
    clearHistory,
    abortChat,
  };
}
