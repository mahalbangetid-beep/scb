/**
 * GoogleIntegrations — Section 10.3
 * 
 * Dynamically injects Google Analytics tracking code and
 * Google Search Console verification meta tag based on
 * admin-configured settings stored in the Setting table.
 * 
 * Fetched once on app mount via the public settings endpoint.
 */
import { useEffect } from 'react'

export default function GoogleIntegrations() {
    useEffect(() => {
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
        let gaScript1 = null
        let gaScript2 = null
        let gscMeta = null

        fetch(`${API_URL}/public/google-integrations`)
            .then(r => r.json())
            .then(res => {
                const data = res?.data || res || {}
                const gaId = data.googleAnalyticsId
                const gscTag = data.googleSearchConsoleTag

                // 1. Google Analytics — inject gtag.js
                if (gaId && gaId.trim()) {
                    const id = gaId.trim()
                    // Global Site Tag script
                    gaScript1 = document.createElement('script')
                    gaScript1.async = true
                    gaScript1.src = `https://www.googletagmanager.com/gtag/js?id=${id}`
                    gaScript1.id = 'ga-gtag-script'
                    document.head.appendChild(gaScript1)

                    // Config script
                    gaScript2 = document.createElement('script')
                    gaScript2.id = 'ga-config-script'
                    gaScript2.textContent = `
                        window.dataLayer = window.dataLayer || [];
                        function gtag(){dataLayer.push(arguments);}
                        gtag('js', new Date());
                        gtag('config', '${id}');
                    `
                    document.head.appendChild(gaScript2)
                }

                // 2. Google Search Console — inject verification meta tag
                if (gscTag && gscTag.trim()) {
                    gscMeta = document.createElement('meta')
                    gscMeta.name = 'google-site-verification'
                    gscMeta.content = gscTag.trim()
                    gscMeta.id = 'gsc-verification-meta'
                    document.head.appendChild(gscMeta)
                }
            })
            .catch(() => { /* silent fail — non-critical */ })

        return () => {
            // Cleanup on unmount
            if (gaScript1) gaScript1.remove()
            if (gaScript2) gaScript2.remove()
            if (gscMeta) gscMeta.remove()
        }
    }, [])

    return null // This component renders nothing — side-effect only
}
