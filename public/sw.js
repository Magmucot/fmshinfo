/* СУНЦ Инфо — service worker: офлайн-фолбэк + кэш статики (network-first) */

const VERSION = "sunc-info-v3";
const STATIC_CACHE = `${VERSION}-static`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

/** Кэш-first только для неизменяемых ассетов */
const isImmutable = (url) =>
  url.pathname.startsWith("/icons/") ||
  url.pathname === "/favicon.svg" ||
  url.pathname === "/manifest.webmanifest" ||
  url.pathname === "/offline.html";

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // API-запросы не перехватываем: только онлайн-данные
  if (url.pathname.startsWith("/api/")) return;

  // Навигация и чанки: сеть → кэш → офлайн-страница
  if (request.mode === "navigate" || url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match(OFFLINE_URL))
        )
    );
    return;
  }

  // Неизменяемые ассеты: кэш → сеть
  if (isImmutable(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
            return response;
          })
      )
    );
  }
});
