/*
 * 知脉 Service Worker。
 *
 * 定位：让应用能「安装」并把静态资源放到本机，但**不缓存任何用户数据**。
 * - 页面（navigation）永远走网络：知识图谱、对话、会话 cookie 都是私有的，
 *   缓存 HTML 会把上一个使用者的界面留在共享设备上，也会让部署更新延迟生效。
 * - 只有 /_next/static/（内容哈希命名）用 cache-first，图标与 manifest 用 stale-while-revalidate。
 * - /api/ 与跨域请求（Supabase）完全放行，不拦截、不缓存。
 * - 离线时 navigation 回退到自包含的 /offline.html。
 */
const VERSION = "v1";
const STATIC_CACHE = `zhimy-static-${VERSION}`;
const MEDIA_CACHE = `zhimy-media-${VERSION}`;
const OFFLINE_URL = "/offline.html";

const PRECACHE = [
  OFFLINE_URL,
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // 逐个 add：任何一个 404 都不该让整个 install 失败（否则 SW 永远装不上）。
      await Promise.all(
        PRECACHE.map(async (url) => {
          try {
            await cache.add(new Request(url, { cache: "reload" }));
          } catch {
            // 忽略单个资源失败
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (key) =>
              key.startsWith("zhimy-") && key !== STATIC_CACHE && key !== MEDIA_CACHE,
          )
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // 跨域请求（Supabase REST / Auth）直接交给浏览器，绝不进缓存。
  if (url.origin !== self.location.origin) return;
  // 接口请求一律不拦：BYOK 代理与健康检查都需要真实响应。
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest") {
    event.respondWith(staleWhileRevalidate(request, MEDIA_CACHE));
  }
});

async function networkFirstNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    const offline = await caches.match(OFFLINE_URL);
    if (offline) return offline;
    return new Response("当前网络不可用，且没有缓存离线页。", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;

  const response = await fetch(request);
  if (response.ok) void cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response.ok) void cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  if (hit) return hit;
  const response = await network;
  return response ?? Response.error();
}
