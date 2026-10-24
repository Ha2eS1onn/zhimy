"use client";

import { create } from "zustand";

export type ToastTone = "info" | "success" | "error";

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  leaving?: boolean;
}

interface ToastState {
  toasts: ToastItem[];
  push: (message: string, tone?: ToastTone) => void;
  dismiss: (id: number) => void;
  remove: (id: number) => void;
}

const EXIT_MS = 180;

let nextId = 1;

export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],
  push: (message, tone = "info") => {
    const id = nextId++;
    set((state) => ({ toasts: [...state.toasts, { id, message, tone }] }));
    setTimeout(() => get().dismiss(id), 3600);
  },
  dismiss: (id) => {
    const item = get().toasts.find((toastItem) => toastItem.id === id);
    if (!item || item.leaving) return;
    set((state) => ({
      toasts: state.toasts.map((toastItem) =>
        toastItem.id === id ? { ...toastItem, leaving: true } : toastItem,
      ),
    }));
    setTimeout(() => get().remove(id), EXIT_MS);
  },
  remove: (id) =>
    set((state) => ({ toasts: state.toasts.filter((toastItem) => toastItem.id !== id) })),
}));

export function toast(message: string, tone: ToastTone = "info"): void {
  useToastStore.getState().push(message, tone);
}
