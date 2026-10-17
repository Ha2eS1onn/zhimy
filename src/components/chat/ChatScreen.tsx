"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Icon } from "../shell/Icon";
import { SYSTEM_PROMPT, IMAGE_HINT } from "@/lib/ai/prompt";
import { streamMockAnswer } from "@/lib/ai/mock";
import { streamChat } from "@/lib/ai/llmClient";
import type { ChatTurn, ChatContentPart } from "@/lib/ai/types";
import { useChatStore } from "@/store/chatStore";
import { useGraphStore } from "@/store/graphStore";
import { useSettingsStore } from "@/store/settingsStore";
import { toast } from "@/store/toastStore";
import { useUIStore } from "@/store/uiStore";
import { pathLabel } from "@/lib/path";
import { resolveQuestion } from "@/lib/search";
import { mockExtract } from "@/lib/ai/mock";
import { MessageBubble } from "./MessageBubble";
import { Composer, type ImagePayload } from "./Composer";

const EXAMPLES = ["电阻并联怎么算？", "浮力怎么理解？", "化学方程式怎么配平？"];

export function ChatScreen() {
  const searchParams = useSearchParams();
  const messages = useChatStore((state) => state.messages);
  const append = useChatStore((state) => state.append);
  const addSource = useGraphStore((state) => state.addSource);
  const llm = useSettingsStore((state) => state.llm);
  const openSettings = useUIStore((state) => state.openSettings);

  const [streamingText, setStreamingText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const partialRef = useRef("");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const initialQuestionRef = useRef<string>("");

  useEffect(() => {
    const question = searchParams.get("q") ?? "";
    if (question) initialQuestionRef.current = question;
  }, [searchParams]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, streamingText, error]);

  const handleSend = async (rawText: string, image: ImagePayload | null) => {
    if (busy) return;
    const text = rawText.trim();
    if (!text && !image) return;
    setBusy(true);
    setError(null);
    setStreamingText("");
    partialRef.current = "";

    try {
      await append({
        role: "user",
        content: text || "（图片提问）",
        imageName: image?.file.name ?? null,
      });

      const currentNodeList = useGraphStore.getState().nodes;
      const hit = text ? resolveQuestion(currentNodeList, text) : { nodeId: null, score: 0 };
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
          const turns = buildTurns(question, image, messages, llm.visionModel);
          answer = await streamChat({
            settings: llm,
            messages: turns,
            signal: controller.signal,
            onDelta: (chunk) => {
              partialRef.current += chunk;
              setStreamingText(partialRef.current);
            },
          });
        } else {
          answer = await streamMockAnswer(
            question,
            (chunk) => {
              partialRef.current += chunk;
              setStreamingText(partialRef.current);
            },
            controller.signal,
          );
        }
      } catch (streamError) {
        const aborted = (streamError as DOMException)?.name === "AbortError";
        if (aborted) {
          answer = partialRef.current.trim();
          if (!answer) {
            setStreaming(false);
            return;
          }
          answer += "\n\n（已停止生成）";
        } else {
          throw streamError;
        }
      } finally {
        abortRef.current = null;
        setStreaming(false);
        setStreamingText("");
      }

      if (!answer.trim()) {
        throw new Error("模型没有返回内容");
      }

      const source = await addSource({ question: text || "（图片提问）", answer });
      const suggestions = mockExtract(question, useGraphStore.getState().nodes, source.id);
      await append({ role: "assistant", content: answer, payload: { suggestions } });
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "发送失败，请重试";
      setError(message);
      toast(message, "error");
    } finally {
      partialRef.current = "";
      setBusy(false);
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const modeLabel =
    llm.mode === "real"
      ? `真实模型 · ${llm.model || "未填写模型"} · 设置`
      : "演示脚本模式 · 点此接入自己的模型";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-line px-4 py-3 md:px-6">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-semibold text-ink">对话</h1>
            <p className="text-[11px] text-muted">拍题或提问，AI 会把知识点收编进你的知识图谱</p>
          </div>
          <button type="button" className="btn-ghost btn-sm" onClick={() => openSettings("llm")}>
            <Icon name="spark" size={14} />
            {llm.mode === "real" ? "模型设置" : "演示模式"}
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          {messages.length === 0 && !streaming ? (
            <div className="card mt-6 p-6 text-center">
              <p className="text-sm font-medium text-ink">第一次提问，从一道不会的题开始</p>
              <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted">
                演示模式下你会看到一段分步解答，以及 1–3 个可收编的知识点建议；收编后它们会出现在 3D 知识库里，下次再问同一个知识点会直接给出路径。
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    className="chip hover:text-ink"
                    onClick={() => void handleSend(example, null)}
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}

          {streaming ? (
            <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-line bg-surface/80 px-3.5 py-2.5">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
                {streamingText || "正在思考…"}
                <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-accent align-middle" />
              </p>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </div>
          ) : null}

          <div ref={bottomRef} />
        </div>
      </div>

      <Composer
        busy={busy}
        streaming={streaming}
        modeLabel={modeLabel}
        onOpenSettings={() => openSettings("llm")}
        onSend={(text, image) => void handleSend(text, image)}
        onStop={handleStop}
      />
    </div>
  );
}

function buildTurns(
  question: string,
  image: ImagePayload | null,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  visionModel: string,
): ChatTurn[] {
  const trimmedHistory: ChatTurn[] = history.slice(-8).map((message) => ({
    role: message.role,
    content: message.content.slice(0, 1200),
  }));

  const supportVision = Boolean(visionModel.trim()) && Boolean(image);
  const userTurn: ChatTurn = supportVision
    ? {
        role: "user",
        content: [
          { type: "text", text: `${question}\n\n${IMAGE_HINT}` },
          { type: "image_url", image_url: { url: image!.dataUrl } },
        ] satisfies ChatContentPart[],
      }
    : { role: "user", content: question };

  return [{ role: "system", content: SYSTEM_PROMPT }, ...trimmedHistory, userTurn];
}
