// FlashBite Service Worker — lightweight PWA shell
// Does NOT cache API responses or images (avoids stale data in this real-time app).
// Only caches the app shell (HTML/JS/CSS) for offline installability.

const CACHE_NAME = 'flashbite-shell-v1'
const SHELL_URLS = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png']

// Install — pre-cache the app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)).catch(() => {})
  )
  self.skipWaiting()
})

// Activate — clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Fetch — network-first for everything (no stale data), cache fallback for shell only
self.addEventListener('fetch', (event) => {
  const { request } = event

  // Skip non-GET requests (API mutations, uploads, etc.)
  if (request.method !== 'GET') return

  // Skip cross-origin requests (Supabase, maps, etc.)
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Skip API requests entirely — always network
  if (url.pathname.startsWith('/api/')) return

  // Skip _next/image (image optimization)
  if (url.pathname.startsWith('/_next/image')) return

  // Network-first for everything else
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful responses for the shell
        if (response.ok && response.type === 'basic') {
          const responseClone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone))
        }
        return response
      })
      .catch(() => {
        // Fallback to cache if network fails
        return caches.match(request).then((cached) => cached || caches.match('/'))
      })
  )
})
