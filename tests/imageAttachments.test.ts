import { describe, expect, it } from "vitest";
import {
  CHAT_IMAGE_MAX_BYTES,
  computeThumbnailSize,
  isSupportedChatImageMime,
  validateChatImage,
} from "@/lib/media/imageInputCore";

describe("拍题图片校验", () => {
  it("允许 JPG / PNG / WebP / GIF", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp", "image/gif"]) {
      expect(validateChatImage({ type, size: 1024, name: "question.png" })).toBeNull();
    }
  });

  it("拒绝 SVG 与未知格式", () => {
    expect(isSupportedChatImageMime("image/svg+xml")).toBe(false);
    expect(validateChatImage({ type: "image/svg+xml", size: 1024 })).toContain("不支持");
    expect(validateChatImage({ type: "application/pdf", size: 1024 })).toContain("不支持");
  });

  it("type 为空时按扩展名兜底，大小写不敏感", () => {
    expect(validateChatImage({ type: "", size: 1024, name: "photo.JPG" })).toBeNull();
    expect(validateChatImage({ type: "", size: 1024, name: "photo.webp" })).toBeNull();
    expect(validateChatImage({ type: "", size: 1024, name: "photo.heic" })).toContain("不支持");
    expect(validateChatImage({ type: "", size: 1024 })).toContain("不支持");
  });

  it("空文件会被拒绝", () => {
    expect(validateChatImage({ type: "image/png", size: 0 })).toContain("为空");
    expect(validateChatImage({ type: "image/png", size: Number.NaN })).toContain("为空");
  });

  it("10 MB 是包含边界：恰好 10 MB 通过，多 1 字节拒绝", () => {
    expect(validateChatImage({ type: "image/jpeg", size: CHAT_IMAGE_MAX_BYTES })).toBeNull();
    expect(
      validateChatImage({ type: "image/jpeg", size: CHAT_IMAGE_MAX_BYTES + 1 }),
    ).toContain("10 MB");
  });
});

describe("缩略图尺寸计算", () => {
  it("横图按最长边缩到 640，保持比例", () => {
    expect(computeThumbnailSize(4000, 3000)).toEqual({ width: 640, height: 480 });
  });

  it("竖图按最长边缩到 640", () => {
    expect(computeThumbnailSize(1200, 2400)).toEqual({ width: 320, height: 640 });
  });

  it("小图不放大", () => {
    expect(computeThumbnailSize(320, 200)).toEqual({ width: 320, height: 200 });
    expect(computeThumbnailSize(640, 640)).toEqual({ width: 640, height: 640 });
  });

  it("非法尺寸返回 1×1，避免画布 0 宽高", () => {
    expect(computeThumbnailSize(0, 0)).toEqual({ width: 1, height: 1 });
    expect(computeThumbnailSize(-10, 20)).toEqual({ width: 1, height: 1 });
    expect(computeThumbnailSize(Number.NaN, 20)).toEqual({ width: 1, height: 1 });
  });

  it("自定义最长边", () => {
    expect(computeThumbnailSize(2000, 1000, 200)).toEqual({ width: 200, height: 100 });
  });
});
