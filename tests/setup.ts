// zustand 的 persist 在 storage 不可用时不会挂载 api.persist；Node 测试环境没有
// window.localStorage，这里注入内存实现，避免每个用到持久化 store 的测试各写一份。
const memory = new Map<string, string>();

const localStorageStub: Storage = {
  get length() {
    return memory.size;
  },
  clear() {
    memory.clear();
  },
  getItem(key) {
    return memory.get(key) ?? null;
  },
  key(index) {
    return [...memory.keys()][index] ?? null;
  },
  removeItem(key) {
    memory.delete(key);
  },
  setItem(key, value) {
    memory.set(key, String(value));
  },
};

if (typeof window === "undefined") {
  Object.defineProperty(globalThis, "window", {
    value: { localStorage: localStorageStub },
    configurable: true,
  });
} else {
  Object.defineProperty(window, "localStorage", {
    value: localStorageStub,
    configurable: true,
  });
}
