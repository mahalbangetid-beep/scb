/**
 * Standalone Features Page — Section 10.2
 * Individual SEO-friendly page accessible from landing navigation
 */
import { useNavigate } from 'react-router-dom'
import {
    Bot, RefreshCw, Shield, Zap, Globe, BarChart3,
    MessageSquare, ArrowRight, CheckCircle2, Lock, Clock,
    Users, Target, Megaphone, Send, FileText
} from 'lucide-react'

export default function FeaturesPage() {
    const navigate = useNavigate()

    const features = [
        {
            icon: <Bot size={32} />,
            title: 'Intelligent Auto-Reply',
            description: 'AI-powered responses that understand context and handle customer queries 24/7 without manual intervention. Configure keyword-based triggers, regex patterns, and smart routing.',
            highlights: ['24/7 Availability', 'Keyword Triggers', 'Smart Routing']
        },
        {
            icon: <RefreshCw size={32} />,
            title: 'Instant Refill Processing',
            description: 'Automatically process refill requests, validate orders, and forward to providers in milliseconds. Support for bulk refill operations with detailed status tracking.',
            highlights: ['Bulk Operations', 'Auto-Validation', 'Provider Forwarding']
        },
        {
            icon: <Shield size={32} />,
            title: 'Advanced Security',
            description: 'Order verification, phone number validation, spam protection, and fraud prevention systems built-in. Two-factor authentication with Google Authenticator support.',
            highlights: ['2FA Support', 'Spam Protection', 'Order Verification']
        },
        {
            icon: <Zap size={32} />,
            title: 'Real-time Processing',
            description: 'Handle 100+ orders per message with instant individual responses for each order. Asynchronous bulk processing ensures no timeout issues.',
            highlights: ['100+ Orders/Message', 'Async Processing', 'Instant Responses']
        },
        {
            icon: <Globe size={32} />,
            title: 'Multi-Platform Support',
            description: 'Works seamlessly with WhatsApp and Telegram from a single unified dashboard. Connect multiple devices and bots simultaneously.',
            highlights: ['WhatsApp & Telegram', 'Multi-Device', 'Unified Dashboard']
        },
        {
            icon: <BarChart3 size={32} />,
            title: 'Detailed Analytics',
            description: 'Track every message, command, and transaction with comprehensive reporting tools. Export data, monitor credits, and analyze bot performance.',
            highlights: ['Message Tracking', 'Credit Reports', 'Performance Metrics']
        },
        {
            icon: <Megaphone size={32} />,
            title: 'Marketing Broadcast',
            description: 'Send targeted messages to thousands of customers across WhatsApp and Telegram. Schedule campaigns, track delivery, and analyze engagement.',
            highlights: ['Scheduled Campaigns', 'Rich Media', 'Delivery Reports']
        },
        {
            icon: <Users size={32} />,
            title: 'Multi-Panel Management',
            description: 'Connect and manage multiple SMM panels from one dashboard. Support for PerfectPanel, RentalPanel, and custom API panels.',
            highlights: ['PerfectPanel', 'RentalPanel', 'Custom API']
        },
        {
            icon: <Target size={32} />,
            title: 'Provider Group Automation',
            description: 'Automatically forward orders to provider WhatsApp groups. Smart routing based on service type with error handling and retry logic.',
            highlights: ['Auto-Forwarding', 'Smart Routing', 'Error Handling']
        }
    ]

    return (
        <div className="landing-page">
            <nav className="landing-nav">
                <div className="nav-container">
                    <div className="nav-logo" style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
                        <MessageSquare size={32} className="logo-icon" />
                        <span className="logo-text">SMMChatBot</span>
                    </div>
                    <div className="nav-links">
                        <a href="/features" style={{ color: 'var(--landing-primary)' }}>Features</a>
                        <a href="/how-it-works">How It Works</a>
                        <a href="/pricing">Pricing</a>
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

            <section style={{ paddingTop: '120px', paddingBottom: '80px', padding: '120px 24px 80px' }}>
                <div className="container">
                    <div className="section-header">
                        <span className="section-badge">Features</span>
                        <h1 style={{ fontSize: '2.5rem', fontWeight: 800 }}>Everything You Need to Automate Support</h1>
                        <p>Powerful features designed for SMM panel owners who want to scale their business efficiently</p>
                    </div>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                        gap: '24px',
                        marginTop: '48px'
                    }}>
                        {features.map((feature, index) => (
                            <div key={index} className="feature-card" style={{ padding: '32px' }}>
                                <div className="feature-icon">{feature.icon}</div>
                                <h3>{feature.title}</h3>
                                <p>{feature.description}</p>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '16px' }}>
                                    {feature.highlights.map((h, i) => (
                                        <span key={i} style={{
                                            fontSize: '0.75rem',
                                            padding: '4px 10px',
                                            background: 'rgba(22, 163, 74, 0.08)',
                                            border: '1px solid rgba(22, 163, 74, 0.2)',
                                            borderRadius: '999px',
                                            color: 'var(--landing-primary)',
                                            fontWeight: 600
                                        }}>
                                            {h}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className="cta-section">
                <div className="container">
                    <div className="cta-content">
                        <h2>Ready to Get Started?</h2>
                        <p>Join hundreds of panel owners who save hours every day with intelligent automation.</p>
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
