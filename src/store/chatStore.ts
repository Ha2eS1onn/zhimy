"use client";

import { create } from "zustand";
import {
  NEW_CONVERSATION_TITLE,
  sortConversations,
  titleFromMessage,
} from "@/lib/conversations";
import { newId, nowIso } from "@/lib/ids";
import { clearThumbnails, deleteThumbnail } from "@/lib/media/localThumbnailStore";
import { getRepo } from "@/lib/repo";
import type { ChatMessage, Conversation, MessagePayload, Suggestion } from "@/types";

/** 会话切换时作废旧请求，避免快速点选时旧消息覆盖新会话。 */
let selectionToken = 0;

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: ChatMessage[];
  /** 会话列表加载中。 */
  loading: boolean;
  /** 当前会话消息加载中。 */
  messagesLoading: boolean;
  loadedFor: string | null;
  /** 已经完成「默认新会话 / 恢复 ?c=」初始化的用户，用于避免首帧闪出旧会话。 */
  conversationReadyFor: string | null;
  error: string | null;
  /** 只加载会话列表；默认保持“新对话”，由聊天页决定是否打开某个会话。 */
  load: (userId: string) => Promise<void>;
  ensureLoaded: () => Promise<void>;
  selectConversation: (conversationId: string) => Promise<void>;
  /** 进入新对话草稿：不创建数据库行，发送第一条消息时才建会话。 */
  startNewConversation: () => void;
  deleteConversation: (conversationId: string) => Promise<void>;
  /** 清掉会话加载错误提示。 */
  clearError: () => void;
  append: (input: {
    role: ChatMessage["role"];
    content: string;
    imageName?: string | null;
    payload?: MessagePayload;
    /** 调用方预生成 id（用于先把本地缩略图按同一个 key 写好）。 */
    id?: string;
  }) => Promise<ChatMessage>;
  updateSuggestion: (
    messageId: string,
    suggestionId: string,
    patch: Partial<Suggestion>,
  ) => Promise<void>;
  /** 清空全部会话与消息（设置页入口）。 */
  clear: () => Promise<void>;
  /** 切换账号时清空本地缓存，等待重新加载。 */
  resetLocal: () => void;
}

async function currentUser() {
  const { useSessionStore } = await import("./sessionStore");
  return useSessionStore.getState().user;
}

export const useChatStore = create<ChatState>()((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  loading: false,
  messagesLoading: false,
  loadedFor: null,
  conversationReadyFor: null,
  error: null,

  load: async (userId) => {
    set({ loading: true, error: null });
    try {
      const conversations = await getRepo().loadConversations(userId);
      selectionToken += 1;
      set({
        conversations: sortConversations(conversations),
        activeConversationId: null,
        messages: [],
        messagesLoading: false,
        loading: false,
        loadedFor: userId,
        conversationReadyFor: null,
        error: null,
      });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : "对话列表加载失败",
      });
    }
  },

  ensureLoaded: async () => {
    const userId = get().loadedFor;
    if (userId) return;
    const user = await currentUser();
    if (!user) return;
    await get().load(user.id);
  },

  selectConversation: async (conversationId) => {
    const user = await currentUser();
    if (!user) return;
    const exists = get().conversations.some((conversation) => conversation.id === conversationId);
    if (!exists) {
      get().startNewConversation();
      return;
    }

    const token = (selectionToken += 1);
    set({
      activeConversationId: conversationId,
      messages: [],
      messagesLoading: true,
      conversationReadyFor: get().loadedFor,
      error: null,
    });
    try {
      const messages = await getRepo().loadMessages(user.id, conversationId);
      if (token !== selectionToken) return;
      set({ messages, messagesLoading: false });
    } catch (error) {
      if (token !== selectionToken) return;
      set({
        messagesLoading: false,
        error: error instanceof Error ? error.message : "对话加载失败",
      });
    }
  },

  startNewConversation: () => {
    selectionToken += 1;
    set({
      activeConversationId: null,
      messages: [],
      messagesLoading: false,
      conversationReadyFor: get().loadedFor,
      error: null,
    });
  },

  deleteConversation: async (conversationId) => {
    const user = await currentUser();
    if (!user) return;
    const active = get().activeConversationId === conversationId;
    // 删除会话时顺手清掉这条会话的本地消息缩略图；来源缩略图仍由知识点详情使用。
    const messages = active
      ? get().messages
      : await getRepo().loadMessages(user.id, conversationId).catch(() => []);
    await getRepo().deleteConversation(user.id, conversationId);
    await Promise.all(messages.map((message) => deleteThumbnail(message.id)));
    if (active) selectionToken += 1;
    set((state) => ({
      conversations: state.conversations.filter(
        (conversation) => conversation.id !== conversationId,
      ),
      error: null,
      ...(active
        ? { activeConversationId: null, messages: [], messagesLoading: false }
        : {}),
    }));
  },

  clearError: () => set({ error: null }),

  append: async ({ role, content, imageName = null, payload = {}, id }) => {
    const user = await currentUser();
    if (!user) throw new Error("账号尚未就绪");

    let conversation =
      get().conversations.find(
        (item) => item.id === get().activeConversationId,
      ) ?? null;
    let created = false;

    if (!conversation) {
      const now = nowIso();
      conversation = {
        id: newId(),
        title: role === "user" ? titleFromMessage(content) : NEW_CONVERSATION_TITLE,
        createdAt: now,
        updatedAt: now,
      };
      await getRepo().insertConversation(user.id, conversation);
      created = true;
      set((state) => ({
        conversations: [conversation!, ...state.conversations],
        activeConversationId: conversation!.id,
      }));
    }

    const message: ChatMessage = {
      id: id ?? newId(),
      role,
      content,
      imageName,
      conversationId: conversation.id,
      payload,
      createdAt: nowIso(),
    };

    try {
      await getRepo().insertMessage(user.id, message);
    } catch (error) {
      if (created) {
        await getRepo().deleteConversation(user.id, conversation.id).catch(() => {});
        set((state) => ({
          conversations: state.conversations.filter(
            (item) => item.id !== conversation!.id,
          ),
          activeConversationId:
            state.activeConversationId === conversation!.id
              ? null
              : state.activeConversationId,
          messages:
            state.activeConversationId === conversation!.id ? [] : state.messages,
        }));
      }
      throw error;
    }

    const updatedAt = nowIso();
    // 会话排序用 updated_at；失败不影响消息本身。
    await getRepo().updateConversation(user.id, conversation.id, { updatedAt }).catch(() => {});
    set((state) => ({
      messages:
        state.activeConversationId === conversation!.id
          ? [...state.messages, message]
          : state.messages,
      conversations: sortConversations([
        { ...conversation!, updatedAt },
        ...state.conversations.filter((item) => item.id !== conversation!.id),
      ]),
    }));
    return message;
  },

  updateSuggestion: async (messageId, suggestionId, patch) => {
    const user = await currentUser();
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
    const user = await currentUser();
    if (!user) return;
    await getRepo().clearConversations(user.id);
    selectionToken += 1;
    set({
      conversations: [],
      activeConversationId: null,
      messages: [],
      messagesLoading: false,
      error: null,
    });
    // 只清聊天缩略图；来源缩略图（kind=source）仍被详情页引用，保留。
    await clearThumbnails("message");
  },

  resetLocal: () => {
    selectionToken += 1;
    set({
      conversations: [],
      activeConversationId: null,
      messages: [],
      loading: false,
      messagesLoading: false,
      error: null,
      loadedFor: null,
      conversationReadyFor: null,
    });
  },
}));
