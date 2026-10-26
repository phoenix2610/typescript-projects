const CACHE_NAME = 'precache-v1';
const PRECACHE_MANIFEST = ['/favicon.svg', '/icons.svg'];

const isServiceWorkerScope = typeof (globalThis as any).ServiceWorkerGlobalScope !== 'undefined';

if (isServiceWorkerScope) {
  const sw = self as unknown as ServiceWorkerGlobalScope;

  sw.addEventListener('install', (event: ExtendableEvent) => {
    event.waitUntil(
      caches
        .open(CACHE_NAME)
        .then((cache) => cache.addAll(PRECACHE_MANIFEST))
        .then(() => sw.skipWaiting()),
    );
  });

  sw.addEventListener('activate', (event: ExtendableEvent) => {
    event.waitUntil(
      caches
        .keys()
        .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
        .then(() => sw.clients.claim()),
    );
  });

  let counter = 0;

  async function simulateNetworkFetch(): Promise<Response> {
    counter += 1;
    return new Response(JSON.stringify({ counter, servedAt: Date.now() }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async function staleWhileRevalidate(request: Request): Promise<Response> {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    const revalidate = simulateNetworkFetch().then((fresh) => {
      cache.put(request, fresh.clone());
      return fresh;
    });
    if (cached) {
      revalidate.catch(() => {});
      return cached;
    }
    return revalidate;
  }

  sw.addEventListener('fetch', (event: FetchEvent) => {
    const url = new URL(event.request.url);
    if (url.pathname.endsWith('/api/counter')) {
      event.respondWith(staleWhileRevalidate(event.request));
      return;
    }
    event.respondWith(caches.match(event.request).then((cached) => cached ?? fetch(event.request)));
  });
}

export function mount(root: HTMLElement) {
  root.innerHTML = '';
  root.style.fontFamily = 'system-ui, sans-serif';
  root.style.padding = '16px';
  root.style.maxWidth = '360px';

  const status = document.createElement('div');
  status.setAttribute('data-testid', 'sw-status');
  status.textContent = 'Registering…';

  const fetchBtn = document.createElement('button');
  fetchBtn.textContent = 'Fetch /api/counter';
  fetchBtn.setAttribute('data-testid', 'fetch-counter');
  fetchBtn.style.marginTop = '8px';

  const counterLog = document.createElement('pre');
  counterLog.setAttribute('data-testid', 'counter-log');
  counterLog.style.fontSize = '12px';
  counterLog.style.background = '#161b22';
  counterLog.style.padding = '6px';
  counterLog.style.marginTop = '4px';

  const cacheBtn = document.createElement('button');
  cacheBtn.textContent = 'List precached assets';
  cacheBtn.setAttribute('data-testid', 'check-cache');
  cacheBtn.style.marginTop = '8px';

  const cacheLog = document.createElement('pre');
  cacheLog.setAttribute('data-testid', 'cache-log');
  cacheLog.style.fontSize = '12px';
  cacheLog.style.background = '#161b22';
  cacheLog.style.padding = '6px';
  cacheLog.style.marginTop = '4px';

  fetchBtn.addEventListener('click', async () => {
    const res = await fetch('/api/counter');
    const data = await res.json();
    counterLog.textContent += `counter=${data.counter}\n`;
  });

  cacheBtn.addEventListener('click', async () => {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    cacheLog.textContent = keys.map((k) => new URL(k.url).pathname).join('\n') || '(empty)';
  });

  root.append(status, fetchBtn, counterLog, cacheBtn, cacheLog);

  navigator.serviceWorker
    .register('/sw-loader.ts', { type: 'module' })
    .then(() => navigator.serviceWorker.ready)
    .then(() => {
      status.textContent = 'Service worker active.';
    })
    .catch((err) => {
      status.textContent = `Registration failed: ${(err as Error).message}`;
    });
}

export default mount;
