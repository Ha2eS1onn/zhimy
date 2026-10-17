"use client";

import { create } from "zustand";
import { newId, nowIso } from "@/lib/ids";
import { getRepo } from "@/lib/repo";
import type { ChatMessage, MessagePayload, Suggestion } from "@/types";

interface ChatState {
  messages: ChatMessage[];
  loading: boolean;
  loadedFor: string | null;
  error: string | null;
  load: (userId: string) => Promise<void>;
  ensureLoaded: () => Promise<void>;
  append: (input: {
    role: ChatMessage["role"];
    content: string;
    imageName?: string | null;
    payload?: MessagePayload;
  }) => Promise<ChatMessage>;
  updateSuggestion: (
    messageId: string,
    suggestionId: string,
    patch: Partial<Suggestion>,
  ) => Promise<void>;
  clear: () => Promise<void>;
}

export const useChatStore = create<ChatState>()((set, get) => ({
  messages: [],
  loading: false,
  loadedFor: null,
  error: null,

  load: async (userId) => {
    set({ loading: true, error: null });
    try {
      const messages = await getRepo().loadMessages(userId);
      set({ messages, loading: false, loadedFor: userId });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : "对话加载失败",
      });
    }
  },

  ensureLoaded: async () => {
    const userId = get().loadedFor;
    if (userId) return;
    const { useSessionStore } = await import("./sessionStore");
    const user = useSessionStore.getState().user;
    if (!user) return;
    await get().load(user.id);
  },

  append: async ({ role, content, imageName = null, payload = {} }) => {
    const { useSessionStore } = await import("./sessionStore");
    const user = useSessionStore.getState().user;
    if (!user) throw new Error("账号尚未就绪");
    const message: ChatMessage = {
      id: newId(),
      role,
      content,
      imageName,
      payload,
      createdAt: nowIso(),
    };
    await getRepo().insertMessage(user.id, message);
    set((state) => ({ messages: [...state.messages, message] }));
    return message;
  },

  updateSuggestion: async (messageId, suggestionId, patch) => {
    const { useSessionStore } = await import("./sessionStore");
    const user = useSessionStore.getState().user;
    if (!user) throw new Error("账号尚未就绪");
    const message = get().messages.find((item) => item.id === messageId);
    if (!message) return;
    const suggestions = (message.payload.suggestions ?? []).map((suggestion) =>
      suggestion.id === suggestionId ? { ...suggestion, ...patch } : suggestion,
    );
    const payload: MessagePayload = { ...message.payload, suggestions };
    await getRepo().updateMessagePayload(user.id, messageId, payload);
    set((state) => ({
      messages: state.messages.map((item) =>
        item.id === messageId ? { ...item, payload } : item,
      ),
    }));
  },

  clear: async () => {
    const { useSessionStore } = await import("./sessionStore");
    const user = useSessionStore.getState().user;
    if (!user) return;
    await getRepo().clearMessages(user.id);
    set({ messages: [] });
  },
}));
