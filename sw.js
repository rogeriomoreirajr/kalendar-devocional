/* Service worker do Kalendar Devocional: deixa o app abrir sem internet.
 *
 * - Arquivos do próprio site: tenta a rede primeiro (para receber atualizações) e cai no cache offline.
 * - Fontes do Google: guarda no cache na primeira vez e reaproveita depois.
 * As marcações de leitura ficam no localStorage e não passam por aqui.
 */
const CACHE = "kalendar-v7";
const BASICOS = [
  "./",
  "./index.html",
  "./app.js",
  "./styles/kalendar.css",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASICOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (evento) => {
  const req = evento.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    // "no-cache": sempre pergunta ao servidor se o arquivo mudou (o GitHub Pages deixa o navegador
    // reaproveitar arquivos por 10 min, o que misturava index.html novo com app.js antigo).
    evento.respondWith(
      fetch(req, { cache: "no-cache" })
        .then((resp) => {
          if (resp.ok) {
            const copia = resp.clone();
            caches.open(CACHE).then((c) => c.put(req, copia));
          }
          return resp;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("./index.html")))
    );
    return;
  }

  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    evento.respondWith(
      caches.match(req).then(
        (r) =>
          r ||
          fetch(req).then((resp) => {
            const copia = resp.clone();
            caches.open(CACHE).then((c) => c.put(req, copia));
            return resp;
          })
      )
    );
  }
});
