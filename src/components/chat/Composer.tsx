"use client";

import { useEffect, useRef, useState } from "react";
import { validateChatImage } from "@/lib/media/imageInputCore";
import { toast } from "@/store/toastStore";
import { Icon } from "../shell/Icon";

export interface ImagePayload {
  file: File;
  dataUrl: string;
}

interface ComposerProps {
  busy: boolean;
  streaming: boolean;
  modeLabel: string;
  onOpenSettings: () => void;
  onSend: (text: string, image: ImagePayload | null) => void;
  onStop: () => void;
}

export function Composer({ busy, streaming, modeLabel, onOpenSettings, onSend, onStop }: ComposerProps) {
  const [text, setText] = useState("");
  const [image, setImage] = useState<ImagePayload | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
  }, [text]);

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const invalid = validateChatImage(file);
    if (invalid) {
      toast(invalid, "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (dataUrl) setImage({ file, dataUrl });
    };
    reader.readAsDataURL(file);
  };

  const submit = () => {
    if (busy) return;
    const value = text.trim();
    if (!value && !image) return;
    onSend(value, image);
    setText("");
    setImage(null);
  };

  return (
    <div className="shrink-0 border-t border-line bg-shell/95 px-3 py-3 md:px-5">
      <div className="mx-auto w-full max-w-3xl">
        {image ? (
          <div className="mb-2 flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.dataUrl}
              alt="待发送的题目图片"
              className="h-14 w-14 rounded-lg border border-line object-cover"
            />
            <span className="truncate text-[11px] text-muted">{image.file.name}</span>
            <button
              type="button"
              className="btn-ghost btn-sm ml-auto"
              onClick={() => setImage(null)}
            >
              移除
            </button>
          </div>
        ) : null}

        <div className="card flex items-end gap-2 p-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(event) => {
              handleFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            className="grid size-9 shrink-0 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-ink"
            aria-label="上传题目图片"
            onClick={() => fileInputRef.current?.click()}
          >
            <Icon name="camera" size={18} />
          </button>
          <textarea
            ref={textareaRef}
            className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-1 py-2 text-sm leading-relaxed text-ink outline-none placeholder:text-muted/70"
            rows={1}
            placeholder="输入题目或追问，Enter 发送，Shift+Enter 换行"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submit();
              }
            }}
          />
          {streaming ? (
            <button type="button" className="btn-ghost btn-sm shrink-0" onClick={onStop}>
              <Icon name="stop" size={14} /> 停止
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary btn-sm shrink-0"
              onClick={submit}
              disabled={busy || (!text.trim() && !image)}
            >
              <Icon name="send" size={14} /> 发送
            </button>
          )}
        </div>

        <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted">
          <button type="button" className="hover:text-ink" onClick={onOpenSettings}>
            {modeLabel}
          </button>
          <span className="hidden sm:inline">
            图片仅用于本次提问；缩略图保存在本机浏览器（不上传云端）
          </span>
        </div>
      </div>
    </div>
  );
}
