import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/*
 * Chunks « lourds » chargés à la demande (mermaid et tout ce qu'il tire : d3, katex,
 * cytoscape, dagre…, ainsi que les dépendances optionnelles de jspdf jamais utilisées ici).
 * Ils sont exclus du précache Workbox et mis en cache à la première utilisation
 * (stratégie CacheFirst, cache « lazy-chunks ») : l'organigramme reste donc disponible
 * hors ligne dès qu'il a été ouvert une fois.
 */
const LAZY_ROOTS = ['/node_modules/mermaid/', '/node_modules/html2canvas/', '/node_modules/canvg/'];

// Fichiers à exclure du précache (rempli pendant le build, lu par manifestTransforms)
const lazyFiles = new Set();

const norm = (id) => id.replace(/\\/g, '/');

function lazyChunksPlugin() {
  return {
    name: 'bde-lazy-chunks',
    apply: 'build',
    generateBundle(_options, bundle) {
      lazyFiles.clear();
      const chunks = Object.values(bundle).filter((c) => c.type === 'chunk');
      const byName = new Map(chunks.map((c) => [c.fileName, c]));

      // 1) Graphe statique depuis les points d'entrée (= ce qui est nécessaire au démarrage)
      const eager = new Set();
      const walkStatic = (file) => {
        if (eager.has(file)) return;
        eager.add(file);
        for (const dep of byName.get(file)?.imports ?? []) walkStatic(dep);
      };
      chunks.filter((c) => c.isEntry).forEach((c) => walkStatic(c.fileName));

      // 2) Fermeture (statique + dynamique) des chunks contenant une racine « lourde »
      const lazy = new Set();
      const walkAll = (file) => {
        if (lazy.has(file)) return;
        lazy.add(file);
        const c = byName.get(file);
        for (const dep of [...(c?.imports ?? []), ...(c?.dynamicImports ?? [])]) walkAll(dep);
      };
      chunks
        .filter((c) => (c.moduleIds ?? Object.keys(c.modules ?? {}))
          .some((id) => LAZY_ROOTS.some((root) => norm(id).includes(root))))
        .forEach((c) => walkAll(c.fileName));

      // 3) On n'exclut jamais un chunk requis au démarrage
      for (const file of lazy) if (!eager.has(file)) lazyFiles.add(file);
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    lazyChunksPlugin(),
    VitePWA({
      // « prompt » : la mise à jour est proposée à l'utilisateur (cf. src/components/pwa/PwaUpdatePrompt.jsx)
      registerType: 'prompt',
      // Enregistrement géré par le hook useRegisterSW → aucun script inline/registerSW.js injecté
      injectRegister: false,
      // Le manifeste est maintenu à la main dans public/manifest.webmanifest
      manifest: false,
      devOptions: { enabled: false },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,webmanifest}'],
        // Non précachés : écrans de démarrage iOS (46 jpg, servis à l'installation) et
        globIgnores: ['**/apple-splash-*.jpg', '**/node_modules/**'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
        manifestTransforms: [
          async (entries) => ({
            manifest: entries.filter((e) => !lazyFiles.has(e.url.replace(/^\//, ''))),
            warnings: [],
          }),
        ],
        runtimeCaching: [
          {
            // Chunks JS non précachés (mermaid & co) : mis en cache à la première utilisation
            urlPattern: /\/assets\/.+\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'lazy-chunks',
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Police Inter (Google Fonts)
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  base: '/',
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Mermaid n'est plus regroupé ici : il est importé dynamiquement par OrgChart.jsx
        // et découpé par diagramme (seul le flowchart est réellement téléchargé).
        manualChunks(id) {
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'react-vendor';
          }
          if (id.includes('node_modules/@dnd-kit/')) {
            return 'dnd-vendor';
          }
          // jspdf est chargé à la demande (export PDF) : pas de chunk forcé,
          // sinon il serait préchargé à chaque visite.
        },
      },
    },
  },
  server: {
    port: 5173,
    open: true,
  },
});
