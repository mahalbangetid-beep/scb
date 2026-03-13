/**
 * SPA Serve Middleware
 * 
 * In PRODUCTION (when dist/index.html exists), serves the Vite-built 
 * frontend from /dist and injects dynamic meta tags (e.g. Cryptomus 
 * verification) into index.html before serving.
 * 
 * In DEVELOPMENT (no dist/), this is a complete no-op passthrough.
 * 
 * Why: Crawlers (like Cryptomus domain verifier) read raw HTML.
 * React SPA only injects meta tags via JavaScript, which crawlers
 * don't execute. This middleware injects the meta tags server-side
 * so they appear in the raw HTML source.
 */

const path = require('path');
const fs = require('fs');
const express = require('express');

const DIST_DIR = path.join(__dirname, '..', '..', '..', 'dist');
const INDEX_PATH = path.join(DIST_DIR, 'index.html');

// Simple TTL cache for head code (avoid DB hit on every request)
let headCache = { code: '', fetchedAt: 0 };
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getHeadCode() {
    const now = Date.now();
    if (now - headCache.fetchedAt < CACHE_TTL) {
        return headCache.code;
    }

    try {
        const prisma = require('../utils/prisma');
        const config = await prisma.systemConfig.findFirst({
            where: { key: 'cryptomus_head_code' },
            select: { value: true }
        });
        headCache = { code: config?.value || '', fetchedAt: now };
    } catch (err) {
        // On error, keep stale cache and don't retry immediately
        headCache.fetchedAt = now;
        console.error('[SPA] Failed to fetch head code:', err.message);
    }

    return headCache.code;
}

function spaServe() {
    // Check if dist/index.html exists (production build)
    if (!fs.existsSync(INDEX_PATH)) {
        console.log('[SPA] No dist/ found — SPA serve disabled (development mode)');
        // Return no-op middleware
        return (req, res, next) => next();
    }

    console.log('[SPA] dist/ found — serving frontend with dynamic meta injection');

    // Read the base HTML template once at startup
    const baseHtml = fs.readFileSync(INDEX_PATH, 'utf8');

    // Serve static assets (JS, CSS, images, fonts) from dist/
    const staticMiddleware = express.static(DIST_DIR, {
        index: false,  // Don't auto-serve index.html for /
        maxAge: '1y',  // Long cache for hashed filenames (vite standard)
    });

    return async (req, res, next) => {
        // Skip API routes, socket.io, and health check — they belong to Express
        if (
            req.path.startsWith('/api') ||
            req.path.startsWith('/socket.io') ||
            req.path === '/health'
        ) {
            return next();
        }

        // Try to serve static file first (JS, CSS, images, etc.)
        staticMiddleware(req, res, async () => {
            // Not a static file → serve index.html for SPA client-side routing
            try {
                const headCode = await getHeadCode();
                let html = baseHtml;

                if (headCode && headCode.trim()) {
                    // Inject verification meta tags right before </head>
                    html = html.replace('</head>', `  ${headCode}\n</head>`);
                }

                res.setHeader('Content-Type', 'text/html');
                res.send(html);
            } catch (err) {
                // Fallback: serve unmodified index.html
                res.setHeader('Content-Type', 'text/html');
                res.send(baseHtml);
            }
        });
    };
}

module.exports = spaServe;
