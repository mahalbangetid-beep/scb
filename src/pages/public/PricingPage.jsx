/**
 * Standalone Pricing Page — Section 10.2
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    MessageSquare, ArrowRight, Headphones, Megaphone, Send,
    Check, Loader2
} from 'lucide-react'

export default function PricingPage() {
    const navigate = useNavigate()
    const [activePricingTab, setActivePricingTab] = useState('support')
    const [pricingPackages, setPricingPackages] = useState({})
    const [pricingLoading, setPricingLoading] = useState(true)

    useEffect(() => {
        const fetchPricingPackages = async () => {
            try {
                setPricingLoading(true)
                const rawUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
                const baseUrl = rawUrl.replace(/\/api\/?$/, '')
                const res = await fetch(`${baseUrl}/api/public/credit-packages`)
                if (!res.ok) throw new Error('Failed to fetch packages')
                const json = await res.json()
                const packages = json.data || []

                const grouped = { support: [], marketing: [], telegram: [] }
                packages.forEach(pkg => {
                    if (pkg.category === 'whatsapp_marketing') grouped.marketing.push(pkg)
                    else if (pkg.category === 'telegram_marketing') grouped.telegram.push(pkg)
                    else grouped.support.push(pkg)
                })
                setPricingPackages(grouped)
            } catch (err) {
                console.warn('[PricingPage] Failed to fetch packages:', err.message)
            } finally {
                setPricingLoading(false)
            }
        }
        fetchPricingPackages()
    }, [])

    const tabs = [
        { key: 'support', label: 'Support Message', icon: <Headphones size={18} /> },
        { key: 'marketing', label: 'Marketing Message', icon: <Megaphone size={18} /> },
        { key: 'telegram', label: 'Telegram Message', icon: <Send size={18} /> }
    ]

    const currentCards = pricingPackages[activePricingTab] || []

    return (
        <div className="landing-page">
            <nav className="landing-nav">
                <div className="nav-container">
                    <div className="nav-logo" style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
                        <MessageSquare size={32} className="logo-icon" />
                        <span className="logo-text">SMMChatBot</span>
                    </div>
                    <div className="nav-links">
                        <a href="/features">Features</a>
                        <a href="/how-it-works">How It Works</a>
                        <a href="/pricing" style={{ color: 'var(--landing-primary)' }}>Pricing</a>
                        <a href="/faq">FAQ</a>
                    </div>
                    <div className="nav-actions">
                        <button className="btn-ghost" onClick={() => navigate('/login')}>Sign In</button>
                        <button className="btn-primary" onClick={() => navigate('/register')}>
                            Get Started <ArrowRight size={18} />
                        </button>
                    </div>
                </div>
            </nav>

            <section className="pricing-section" style={{ paddingTop: '120px' }}>
                <div className="container">
                    <div className="section-header">
                        <span className="section-badge">Pricing</span>
                        <h1 style={{ fontSize: '2.5rem', fontWeight: 800 }}>Simple, Transparent Pricing</h1>
                        <p>Choose the credit package that fits your business needs. No hidden fees.</p>
                    </div>

                    <div className="pricing-tabs">
                        {tabs.map(tab => (
                            (pricingPackages[tab.key] && pricingPackages[tab.key].length > 0) && (
                                <button
                                    key={tab.key}
                                    className={`pricing-tab ${activePricingTab === tab.key ? 'active' : ''}`}
                                    onClick={() => setActivePricingTab(tab.key)}
                                >
                                    {tab.icon} {tab.label}
                                </button>
                            )
                        ))}
                    </div>

                    {pricingLoading ? (
                        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--landing-text-muted)' }}>
                            <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto 12px' }} />
                            <p>Loading packages...</p>
                        </div>
                    ) : currentCards.length > 0 ? (
                        <div className="pricing-cards-slider" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
                            {currentCards.map((pkg, index) => (
                                <div key={index} className={`pricing-slide-card ${pkg.isFeatured ? 'popular-card' : ''}`}
                                    style={{ maxWidth: '300px' }}>
                                    <div className="card-icon">
                                        {activePricingTab === 'support' ? <Headphones size={24} /> :
                                            activePricingTab === 'marketing' ? <Megaphone size={24} /> :
                                                <Send size={24} />}
                                    </div>
                                    <h4>{pkg.name}</h4>
                                    <div className="card-price">${pkg.price}<span> / package</span></div>
                                    <p className="card-desc">{pkg.description || `${pkg.credits.toLocaleString()} message credits`}</p>
                                    <ul className="card-features">
                                        <li><Check size={14} /> {pkg.credits.toLocaleString()} Message Credits</li>
                                        {pkg.bonusCredits > 0 && (
                                            <li><Check size={14} /> +{pkg.bonusCredits.toLocaleString()} Bonus Credits</li>
                                        )}
                                        {pkg.discountPct > 0 && (
                                            <li><Check size={14} /> {pkg.discountPct}% Discount</li>
                                        )}
                                    </ul>
                                    <button className="card-cta" onClick={() => navigate('/register')}>
                                        Get Started
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--landing-text-muted)' }}>
                            <p>No packages available for this category yet.</p>
                            <p style={{ fontSize: '0.875rem', marginTop: 8 }}>Contact us for custom pricing.</p>
                        </div>
                    )}
                </div>
            </section>

            <section className="cta-section">
                <div className="container">
                    <div className="cta-content">
                        <h2>Ready to Get Started?</h2>
                        <p>Sign up now and start automating your SMM panel support.</p>
                        <div className="cta-buttons">
                            <button className="btn-primary btn-large" onClick={() => navigate('/register')}>
                                Start Free Trial <ArrowRight size={20} />
                            </button>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    )
}
