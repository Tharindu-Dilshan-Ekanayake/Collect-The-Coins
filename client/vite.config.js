import react from '@vitejs/plugin-react'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

import { PROD_ENVIRONMENT } from './src/bloxity/environment.js'

/**
 * Tells the Boxity SDK (and environment.js) which environment a standalone local page
 * is in, before any game code runs. Dev server only: production builds carry no
 * environment; Boxity injects it into the pages it serves.
 *
 *   default               real Boxity (guest names, accounts and avatars just work)
 *   BLOXITY_DEV_ENV=local only if you run the local Boxity stack (portal :3000, API :4000)
 */
const LOCAL_BLOXITY_ENV = {
  env: 'local',
  apiUrl: 'http://localhost:4000',
  playUrl: 'http://localhost:2568',
  portalUrl: 'http://localhost:3000',
  staticUrl: PROD_ENVIRONMENT.staticUrl,
}

function bloxityDevEnvironment() {
  return {
    name: 'bloxity-dev-environment',
    apply: 'serve',
    transformIndexHtml() {
      // Injected only for the local stack; otherwise the SDK uses real Boxity.
      if (process.env.BLOXITY_DEV_ENV !== 'local') return []
      const env = LOCAL_BLOXITY_ENV
      return [{ tag: 'script', children: `window.BLOXITY_ENV = ${JSON.stringify(env)};`, injectTo: 'head-prepend' }]
    },
  }
}

/**
 * The 3D code is a dynamic import, so the browser would only discover it after the
 * entry script runs. Emitting modulepreload links (and font preloads) in index.html
 * starts those downloads in parallel with the entry, saving a round trip on mobile.
 */
function preloadGameChunks() {
  return {
    name: 'preload-game-chunks',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle) return html
        const chunks = Object.values(ctx.bundle)
        const game = chunks.find((c) => c.type === 'chunk' && c.name === 'GameCanvas')
        if (!game) return html
        const files = new Set([game.fileName])
        const visit = (fileName) => {
          const chunk = ctx.bundle[fileName]
          for (const dep of chunk?.imports || []) {
            if (!files.has(dep)) {
              files.add(dep)
              visit(dep)
            }
          }
        }
        visit(game.fileName)
        const fonts = chunks.filter((c) => c.type === 'asset' && /fredoka-latin-(600|700)-normal.*\.woff2$/.test(c.fileName))
        const tags = [
          ...[...files].filter((f) => !html.includes(f)).map((f) => ({ tag: 'link', attrs: { rel: 'modulepreload', crossorigin: '', href: '/' + f }, injectTo: 'head' })),
          ...fonts.map((f) => ({
            tag: 'link',
            attrs: { rel: 'preload', as: 'font', type: 'font/woff2', crossorigin: '', href: '/' + f.fileName },
            injectTo: 'head',
          })),
        ]
        return { html, tags }
      },
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), preloadGameChunks(), bloxityDevEnvironment()],
  resolve: {
    // Game rules shared with the Colyseus server (../shared).
    alias: { '@shared': fileURLToPath(new URL('../shared', import.meta.url)) },
  },
  server: {
    fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] },
  },
  build: {
    // R3F registers the whole three.js namespace, so three can't tree-shake below
    // ~800 kB raw (~200 kB gzip). That one chunk trips the default 500 kB warning.
    // (If a stage lazy-loads Rapier, its ~2.2 MB WASM chunk will exceed this too.)
    chunkSizeWarningLimit: 900,
    rolldownOptions: {
      output: {
        // Vendor libraries in their own long-cached chunks, so a game update doesn't
        // make returning players re-download three.js or the physics engine.
        codeSplitting: {
          groups: [
            { name: 'rapier', priority: 15, test: /node_modules[\\/]@dimforge/ },
            { name: 'three', priority: 15, test: /node_modules[\\/]three[\\/]/ },
            { name: 'r3f', priority: 10, test: /node_modules[\\/](@react-three|its-fine|suspend-react|react-use-measure)/ },
            // Highest priority: groups pull in their dependencies, and React, zustand and
            // Vite's preload helper are needed by the entry chunk. If any of them lands in
            // the r3f chunk, the entry statically imports all of three.js and Rapier.
            {
              name: 'react',
              priority: 20,
              test: /node_modules[\\/](react|react-dom|scheduler|zustand)[\\/]|preload-helper/,
            },
          ],
        },
      },
    },
  },
})
