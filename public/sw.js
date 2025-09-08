// Service Worker para funcionalidades offline
// Use timestamp para invalidar cache quando há nova versão
const VERSION = '__BUILD_TIME__'; // Será substituído na build
const CACHE_NAME = `visitapp-${VERSION}`;
const urlsToCache = [
  '/',
  '/static/js/bundle.js',
  '/static/css/main.css',
  '/manifest.json'
];

// Instalar Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache aberto');
        return cache.addAll(urlsToCache);
      })
  );
});

// Buscar recursos
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Retorna o cache se disponível, senão busca da rede
        if (response) {
          return response;
        }
        return fetch(event.request);
      }
    )
  );
});

// Ativar Service Worker e limpar caches antigos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Remove todos os caches que não são da versão atual
          if (cacheName !== CACHE_NAME || cacheName.startsWith('visitapp-')) {
            console.log('Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Assume controle imediatamente para todas as abas
      return self.clients.claim();
    })
  );
});

// Escutar mensagens para forçar atualização
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});