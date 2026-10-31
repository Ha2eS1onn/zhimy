"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Sheet } from "@/components/common/Sheet";
import { MintyIllustration } from "@/components/common/MintyIllustration";
import { Icon } from "../shell/Icon";
import { streamMockAnswer } from "@/lib/ai/mock";
import { streamChat } from "@/lib/ai/llmClient";
import { planChatRequest } from "@/lib/ai/chatTurns";
import { formatRelative } from "@/lib/format";
import { newId } from "@/lib/ids";
import { createChatImageDataUrls, VISION_MAX_DATA_URL_LENGTH } from "@/lib/media/imageThumbnails";
import { deleteThumbnail, saveThumbnail } from "@/lib/media/localThumbnailStore";
import { useChatStore } from "@/store/chatStore";
import { useGraphStore } from "@/store/graphStore";
import { useSettingsStore } from "@/store/settingsStore";
import { toast } from "@/store/toastStore";
import { useUIStore } from "@/store/uiStore";
import { pathLabel } from "@/lib/path";
import { resolveHit } from "@/lib/ai/hit";
import { createSemanticSearch } from "@/lib/ai/semanticClient";
import { EVENTS, track } from "@/lib/analytics";
import { mockExtract } from "@/lib/ai/mock";
import { extractWithLlm } from "@/lib/ai/extract";
import type { Conversation, Suggestion } from "@/types";
import { MessageBubble } from "./MessageBubble";
import { Composer, type ImagePayload } from "./Composer";
import { useTypewriter } from "./useTypewriter";

const EXAMPLES = [
  "电阻并联怎么算？",
  "解释一下递归和迭代的区别",
  "什么是斯多葛学派的“控制二分法”？",
];

/** 客户端用 layout effect 在首帧前切会话；服务端回退到 useEffect，避免 SSR 警告。 */
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** 思维链落 payload 的上限，避免个别模型返回超长推理把 jsonb 撑大。 */
const MAX_REASONING_CHARS = 20_000;

/** 取最近几条消息作为抽取上下文，帮助模型理解「再详细讲一道」这类追问。 */
function buildRecentContext(): string {
  return useChatStore
    .getState()
    .messages.slice(-5)
    .map((message) => `${message.role === "user" ? "用户" : "助手"}：${message.content.slice(0, 300)}`)
    .join("\n");
}

export function ChatScreen() {
  const searchParams = useSearchParams();
  const messages = useChatStore((state) => state.messages);
  const conversations = useChatStore((state) => state.conversations);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const loadedFor = useChatStore((state) => state.loadedFor);
  const conversationReadyFor = useChatStore((state) => state.conversationReadyFor);
  const conversationsLoading = useChatStore((state) => state.loading);
  const messagesLoading = useChatStore((state) => state.messagesLoading);
  const storeError = useChatStore((state) => state.error);
  const append = useChatStore((state) => state.append);
  const selectConversation = useChatStore((state) => state.selectConversation);
  const startNewConversation = useChatStore((state) => state.startNewConversation);
  const deleteConversation = useChatStore((state) => state.deleteConversation);
  const clearChatError = useChatStore((state) => state.clearError);
  const addSource = useGraphStore((state) => state.addSource);
  const llm = useSettingsStore((state) => state.llm);
  const openSettings = useUIStore((state) => state.openSettings);

  const [historyOpen, setHistoryOpen] = useState(false);

  const answerWriter = useTypewriter();
  const reasoningWriter = useTypewriter();
  const [streaming, setStreaming] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const reasoningBoxRef = useRef<HTMLDivElement | null>(null);
  const initialQuestionRef = useRef<string>("");
  const visionHintRef = useRef(false);
  const reasoningCharsRef = useRef(0);
  const didInitForRef = useRef<string | null>(null);

  const streamingText = answerWriter.text;
  const streamingReasoning = reasoningWriter.text;
  const conversationReady = Boolean(loadedFor) && conversationReadyFor === loadedFor;
  const activeConversation =
    conversations.find((conversation) => conversation.id === activeConversationId) ?? null;
  const displayError = error ?? storeError;

  useEffect(() => {
    const question = searchParams.get("q") ?? "";
    if (question) initialQuestionRef.current = question;
  }, [searchParams]);

  // 进入对话页：没有 ?c= 时默认新对话；有 c 才恢复指定会话。
  // 每次 ChatScreen 重新挂载都要执行一次（即使 store 里还留着上一个会话）。
  useIsomorphicLayoutEffect(() => {
    if (!loadedFor) return;
    const mountedFor = didInitForRef.current !== loadedFor;
    const storeNeedsInit = conversationReadyFor !== loadedFor;
    if (!mountedFor && !storeNeedsInit) return;
    didInitForRef.current = loadedFor;
    const conversationId = searchParams.get("c");
    if (conversationId) void selectConversation(conversationId);
    else startNewConversation();
  }, [conversationReadyFor, loadedFor, searchParams, selectConversation, startNewConversation]);

  // 离开聊天页时停止仍在进行的生成，避免组件卸载后继续写消息。
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // 当前会话写回 ?c=，刷新页面不会丢失；新对话则移除参数。
  useEffect(() => {
    if (!loadedFor || conversationReadyFor !== loadedFor) return;
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const current = url.searchParams.get("c");
    if (activeConversationId) {
      if (current === activeConversationId) return;
      url.searchParams.set("c", activeConversationId);
    } else {
      if (!current) return;
      url.searchParams.delete("c");
    }
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [activeConversationId, conversationReadyFor, loadedFor]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, streamingText, streamingReasoning, error, extracting]);

  useEffect(() => {
    const box = reasoningBoxRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [streamingReasoning]);

  const handleSend = async (rawText: string, image: ImagePayload | null) => {
    if (busy) return;
    const text = rawText.trim();
    if (!text && !image) return;
    setBusy(true);
    setError(null);
    clearChatError();
    answerWriter.reset();
    reasoningWriter.reset();
    reasoningCharsRef.current = 0;

    // 向量检索依赖 BYOK 的 embedding 配置；未配置时 createSemanticSearch 返回 null，
    // resolveHit 内部会自动退回关键词命中。
    const semantic = createSemanticSearch(llm);
    if (text) {
      track(EVENTS.chatSent, {
        mode: llm.mode,
        hasImage: Boolean(image),
        vision: Boolean(llm.visionModel.trim()),
        semantic: Boolean(semantic),
      });
    }

    const messageId = newId();
    let thumbnailDataUrl: string | null = null;
    let visionDataUrl: string | null = null;

    try {
      // 原图只用于本次提问：同时压出本地缩略图与可发送给视觉模型的图片。
      // 后者控制在 1600px 内，避免 base64 请求体撞上代理 / Vercel 的体积上限。
      if (image) {
        const generated = await createChatImageDataUrls(image.file);
        thumbnailDataUrl = generated.thumbnail;
        visionDataUrl = generated.vision ?? image.dataUrl;
        if (visionDataUrl.length > VISION_MAX_DATA_URL_LENGTH) {
          toast("图片过大，压缩后仍超出可发送大小，请换一张更小的图片", "error");
          return;
        }
        if (thumbnailDataUrl) {
          await saveThumbnail({
            id: messageId,
            dataUrl: thumbnailDataUrl,
            name: image.file.name,
            kind: "message",
          });
        }
      }

      try {
        await append({
          id: messageId,
          role: "user",
          content: text || "（图片提问）",
          imageName: image?.file.name ?? null,
        });
      } catch (appendError) {
        if (thumbnailDataUrl) void deleteThumbnail(messageId);
        throw appendError;
      }

      const currentNodeList = useGraphStore.getState().nodes;
      const hit = text
        ? await resolveHit({ nodes: currentNodeList, question: text, semantic })
        : { nodeId: null, score: 0, source: "keyword" as const, fallback: undefined };
      if (text) {
        track(EVENTS.hitAttempt, {
          hit: Boolean(hit.nodeId),
          source: hit.source,
          score: Number(hit.score.toFixed(3)),
          ...(hit.fallback ? { fallback: hit.fallback } : {}),
        });
      }
      if (hit.nodeId) {
        const path = pathLabel(currentNodeList, hit.nodeId);
        await append({
          role: "assistant",
          content: `这个问题你已经在图谱里学过了：**${path}**。\n\n这里不再重复讲解，直接带你回到那个位置。`,
          payload: { hit: { nodeId: hit.nodeId, score: hit.score } },
        });
        return;
      }

      const question = text || "帮我看看这道题";
      let answer = "";

      setStreaming(true);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        if (llm.mode === "real") {
          if (image && !llm.visionModel.trim() && !visionHintRef.current) {
            visionHintRef.current = true;
            toast(
              `没有单独配置视觉模型：本次会用「${llm.model || "当前模型"}」识图；如果它不支持图片，请在设置 → 模型里填写视觉模型。`,
              "info",
            );
          }
          const request = planChatRequest({
            question,
            imageDataUrl: visionDataUrl,
            history: messages,
            textModel: llm.model,
            visionModel: llm.visionModel,
          });
          answer = await streamChat({
            // 图片请求实际走视觉模型；未配置时沿用文本模型（可能不支持识图，由服务商报错）。
            settings: { ...llm, model: request.model },
            messages: request.turns,
            signal: controller.signal,
            onDelta: (chunk) => {
              answerWriter.push(chunk);
            },
            onReasoningDelta: (chunk) => {
              const remaining = MAX_REASONING_CHARS - reasoningCharsRef.current;
              if (remaining <= 0) return;
              const piece = chunk.slice(0, remaining);
              reasoningCharsRef.current += piece.length;
              reasoningWriter.push(piece);
            },
          });
        } else {
          answer = await streamMockAnswer(
            question,
            (chunk) => {
              answerWriter.push(chunk);
            },
            controller.signal,
          );
        }
      } catch (streamError) {
        const aborted = (streamError as DOMException)?.name === "AbortError";
        if (aborted) {
          const partial = answerWriter.flush().trim();
          reasoningWriter.flush();
          if (!partial) {
            setStreaming(false);
            return;
          }
          answer = `${partial}\n\n（已停止生成）`;
        } else {
          throw streamError;
        }
      } finally {
        abortRef.current = null;
        answerWriter.flush();
        reasoningWriter.flush();
        setStreaming(false);
      }

      if (!answer.trim()) {
        throw new Error("模型没有返回内容");
      }

      const source = await addSource({
        question: text || "（图片提问）",
        answer,
        hasImage: Boolean(image),
      });
      if (thumbnailDataUrl) {
        // 来源页（详情/3D 面板）按 source.id 再留一份，换设备读不到属预期。
        void saveThumbnail({
          id: source.id,
          dataUrl: thumbnailDataUrl,
          name: image?.file.name ?? null,
          kind: "source",
        });
      }

      let suggestions: Suggestion[] = [];
      if (llm.mode === "real") {
        // 真实模式：让用户自己的模型从这次解答里抽取知识点，并从候选节点里选择落点。
        setExtracting(true);
        try {
          suggestions = await extractWithLlm({
            settings: llm,
            question,
            answer,
            nodes: useGraphStore.getState().nodes,
            sourceId: source.id,
            context: buildRecentContext(),
            semantic,
          });
          if (suggestions.length === 0) {
            toast("这段对话里没有识别到可收编的知识点", "info");
          }
        } catch (extractError) {
          const detail = extractError instanceof Error ? extractError.message : "未知错误";
          toast(`知识点整理失败：${detail}`, "error");
        } finally {
          setExtracting(false);
        }
      } else {
        suggestions = mockExtract(question, useGraphStore.getState().nodes, source.id);
      }

      const reasoningText = reasoningWriter
        .getTarget()
        .trim()
        .slice(0, MAX_REASONING_CHARS);
      await append({
        role: "assistant",
        content: answer,
        payload: {
          suggestions,
          ...(reasoningText ? { reasoning: reasoningText } : {}),
        },
      });
      if (suggestions.length > 0) {
        track(EVENTS.captureShown, { count: suggestions.length, mode: llm.mode });
      }
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "发送失败，请重试";
      setError(message);
      toast(message, "error");
    } finally {
      setBusy(false);
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleNewChat = () => {
    if (busy || streaming || messagesLoading) return;
    setError(null);
    startNewConversation();
    setHistoryOpen(false);
  };

  const handleSelectConversation = async (conversationId: string) => {
    if (busy || streaming) return;
    setError(null);
    setHistoryOpen(false);
    if (conversationId !== activeConversationId) {
      await selectConversation(conversationId);
    }
  };

  const handleDeleteConversation = async (conversation: Conversation) => {
    if (busy || streaming) return;
    if (!window.confirm(`删除对话「${conversation.title}」？消息会一并删除。`)) return;
    setError(null);
    try {
      await deleteConversation(conversation.id);
      toast("已删除对话", "success");
    } catch (deleteError) {
      toast(
        deleteError instanceof Error ? deleteError.message : "删除对话失败",
        "error",
      );
    }
  };

  const modeLabel =
    llm.mode === "real"
      ? `${llm.model || "模型"} · 设置`
      : "演示模式 · 接入模型";

  return (
    <div className="flex h-full min-h-0 flex-col bg-shell">
      <header className="shrink-0 border-b border-line bg-shell px-4 py-2.5 md:px-6 md:py-3">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-base font-[750] tracking-[-0.03em] text-ink">对话</h1>
            <p className="truncate text-[11px] text-muted">
              {conversationReady && activeConversation ? activeConversation.title : "新对话"} · 拍题或直接提问
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={handleNewChat}
              disabled={busy || streaming || messagesLoading}
              aria-label="新建对话"
              title="新建对话"
            >
              <Icon name="plus" size={14} />
              <span className="hidden sm:inline">新对话</span>
            </button>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => setHistoryOpen(true)}
              disabled={busy || streaming}
              aria-label="历史对话"
              title="历史对话"
            >
              <Icon name="chat" size={14} />
              <span className="hidden sm:inline">历史</span>
            </button>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => openSettings("llm")}
              aria-label={llm.mode === "real" ? "模型设置" : "演示模式"}
            >
              <Icon name="spark" size={14} />
              <span className="hidden md:inline">
                {llm.mode === "real" ? "模型设置" : "演示模式"}
              </span>
            </button>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          {!conversationReady || messagesLoading || conversationsLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted">
              <span className="inline-block size-3 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
              正在加载对话…
            </div>
          ) : null}

          {conversationReady &&
          messages.length === 0 &&
          !streaming &&
          !messagesLoading &&
          !conversationsLoading ? (
            <div className="card mt-2 px-5 py-7 text-center md:mt-8">
              <MintyIllustration variant="capture" className="mx-auto h-24 w-44" />
              <p className="mt-2 text-base font-[750] tracking-[-0.02em] text-ink">从一个问题开始</p>
              <p className="mx-auto mt-1.5 max-w-[46ch] text-xs leading-relaxed text-muted">
                提问、拍题，把值得留下的知识收进来。
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    className="chip"
                    onClick={() => void handleSend(example, null)}
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {conversationReady
            ? messages.map((message) => <MessageBubble key={message.id} message={message} />)
            : null}

          {streaming && streamingReasoning ? (
            <details
              open={!streamingText}
              className="max-w-[92%] rounded-[18px] rounded-bl-md border border-line bg-surface px-4 py-3"
            >
              <summary className="cursor-pointer text-[11px] text-muted">
                {streamingText ? "思考" : "思考中"}
              </summary>
              <div
                ref={reasoningBoxRef}
                className="mt-1.5 max-h-64 overflow-y-auto whitespace-pre-wrap text-[12px] leading-relaxed text-muted"
              >
                {streamingReasoning}
                {!streamingText ? (
                  <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-accent align-middle" />
                ) : null}
              </div>
            </details>
          ) : null}

          {streaming && (streamingText || !streamingReasoning) ? (
            <div className="max-w-[92%] rounded-[18px] rounded-bl-md border border-line bg-surface px-4 py-3">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
                {streamingText || "思考中"}
                <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-accent align-middle" />
              </p>
            </div>
          ) : null}

          {extracting ? (
            <div className="flex items-center gap-2 text-xs text-muted">
              <span className="inline-block size-3 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
              正在整理知识点…
            </div>
          ) : null}

          {displayError ? (
            <div className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
              {displayError}
            </div>
          ) : null}

          <div ref={bottomRef} />
        </div>
      </div>

      <Composer
        busy={busy || !conversationReady || messagesLoading || conversationsLoading}
        streaming={streaming}
        modeLabel={modeLabel}
        onOpenSettings={() => openSettings("llm")}
        onSend={(text, image) => void handleSend(text, image)}
        onStop={handleStop}
      />

      <Sheet
        open={historyOpen}
        title="对话记录"
        description="继续之前的对话。"
        onClose={() => setHistoryOpen(false)}
      >
        <button
          type="button"
          className="btn-primary w-full justify-start"
          onClick={handleNewChat}
          disabled={busy || streaming || messagesLoading}
        >
          <Icon name="plus" size={14} /> 新建对话
        </button>

        {conversations.length === 0 ? (
          <p className="mt-4 text-xs leading-relaxed text-muted">
            暂无历史对话。
          </p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {conversations.map((conversation) => (
              <li key={conversation.id} className="flex items-stretch gap-1.5">
                <button
                  type="button"
                  onClick={() => void handleSelectConversation(conversation.id)}
                  disabled={busy || streaming}
                  aria-current={conversation.id === activeConversationId ? "true" : undefined}
                  className={`min-h-11 min-w-0 flex-1 rounded-xl border px-3 py-2 text-left transition ${
                    conversation.id === activeConversationId
                      ? "border-accent bg-accent/10"
                      : "border-line bg-surface hover:border-accent"
                  }`}
                >
                  <p className="truncate text-xs text-ink">{conversation.title}</p>
                  <p className="mt-0.5 text-[10px] text-muted">
                    {formatRelative(conversation.updatedAt)}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteConversation(conversation)}
                  disabled={busy || streaming}
                  aria-label={`删除对话：${conversation.title}`}
                  className="grid min-h-11 w-11 place-items-center rounded-xl border border-line text-muted transition hover:border-danger/40 hover:text-danger"
                >
                  <Icon name="close" size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </div>
  );
}
