const CACHE = "openled-web-v40";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=40",
  "./app.js?v=40",
  "./manifest.webmanifest?v=40",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./firmware/esp32_ws2812b.ino"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())
  );
});

function cacheResponse(request, response) {
  if (response && response.ok) {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(request, copy));
  }
  return response;
}

function networkFirst(request) {
  return fetch(request)
    .then((response) => cacheResponse(request, response))
    .catch(() =>
      caches.match(request).then((cached) => cached || caches.match("./index.html") || Response.error())
    );
}

function staleWhileRevalidate(request) {
  return caches.match(request).then((cached) => {
    const network = fetch(request)
      .then((response) => cacheResponse(request, response))
      .catch(() => cached || Response.error());
    return cached || network;
  });
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) {
    return;
  }
  event.respondWith(
    event.request.mode === "navigate"
      ? networkFirst(event.request)
      : staleWhileRevalidate(event.request)
  );
});
