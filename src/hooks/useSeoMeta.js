/**
 * useSeoMeta Hook
 * 
 * Fetches and applies SEO meta tags based on the current route.
 * Runs once on app load, caches all SEO data, and updates <head> on route change.
 */

import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

// Cached SEO data (lives outside component to persist across renders)
let seoCache = null;
let fetchPromise = null;

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

async function fetchSeoData() {
    if (seoCache) return seoCache;
    if (fetchPromise) return fetchPromise;

    fetchPromise = fetch(`${API_URL}/seo/all-meta`)
        .then(r => r.json())
        .then(res => {
            seoCache = res?.data || {};
            return seoCache;
        })
        .catch(() => {
            seoCache = {};
            return seoCache;
        })
        .finally(() => {
            fetchPromise = null;
        });

    return fetchPromise;
}

// Map route pathname to page slug
function pathToSlug(pathname) {
    const map = {
        '/': 'home',
        '/login': 'login',
        '/register': 'signup',
        '/dashboard': 'dashboard',
        '/orders': 'orders',
        '/smm-panels': 'services',
        '/wallet': 'add-funds',
        '/api-docs': 'api',
        '/tickets': 'tickets',
        '/reports': 'reports',
        '/settings': 'settings',
        '/contacts': 'contact',
    };

    return map[pathname] || pathname.replace(/^\//, '').replace(/\//g, '-');
}

export default function useSeoMeta() {
    const location = useLocation();
    const injectedRef = useRef([]);

    useEffect(() => {
        let cancelled = false;

        fetchSeoData().then(data => {
            if (cancelled) return;

            // Cleanup previous injected tags
            injectedRef.current.forEach(el => {
                try { el.remove(); } catch (e) { /* ignore */ }
            });
            injectedRef.current = [];

            const slug = pathToSlug(location.pathname);
            const seo = data[slug];
            if (!seo) return;

            // Page Title
            if (seo.pageTitle) {
                document.title = seo.pageTitle;
            }

            // Meta Description
            if (seo.metaDescription) {
                let meta = document.querySelector('meta[name="description"]');
                if (!meta) {
                    meta = document.createElement('meta');
                    meta.name = 'description';
                    document.head.appendChild(meta);
                    injectedRef.current.push(meta);
                }
                meta.content = seo.metaDescription;
            }

            // Meta Keywords
            if (seo.metaKeywords && Array.isArray(seo.metaKeywords) && seo.metaKeywords.length > 0) {
                let meta = document.querySelector('meta[name="keywords"]');
                if (!meta) {
                    meta = document.createElement('meta');
                    meta.name = 'keywords';
                    document.head.appendChild(meta);
                    injectedRef.current.push(meta);
                }
                meta.content = seo.metaKeywords.join(', ');
            }

            // Meta Robots
            if (seo.metaRobots) {
                let meta = document.querySelector('meta[name="robots"]');
                if (!meta) {
                    meta = document.createElement('meta');
                    meta.name = 'robots';
                    document.head.appendChild(meta);
                    injectedRef.current.push(meta);
                }
                meta.content = seo.metaRobots;
            }

            // Custom Header HTML
            if (seo.customHeader && seo.customHeader.trim()) {
                const container = document.createElement('div');
                container.id = `seo-custom-${slug}`;
                container.innerHTML = seo.customHeader;
                while (container.firstChild) {
                    const node = container.firstChild;
                    document.head.appendChild(node);
                    injectedRef.current.push(node);
                }
            }
        });

        return () => {
            cancelled = true;
        };
    }, [location.pathname]);
}
