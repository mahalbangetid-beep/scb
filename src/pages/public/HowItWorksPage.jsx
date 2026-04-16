/**
 * Standalone How It Works Page — Section 10.2
 */
import { useNavigate } from 'react-router-dom'
import {
    MessageSquare, ArrowRight, Globe, Smartphone, Bot, Zap,
    ChevronRight, CheckCircle2, Shield, Clock
} from 'lucide-react'

export default function HowItWorksPage() {
    const navigate = useNavigate()

    const steps = [
        {
            step: '01',
            title: 'Create Your Account',
            description: 'Sign up in seconds. No credit card required for the free trial. Get instant access to the dashboard.',
            icon: <CheckCircle2 size={36} />,
            details: ['Free trial available', 'No credit card needed', 'Instant dashboard access']
        },
        {
            step: '02',
            title: 'Connect Your Panel',
            description: 'Link your PerfectPanel or RentalPanel using API keys. Setup takes less than 2 minutes with our guided wizard.',
            icon: <Globe size={36} />,
            details: ['PerfectPanel support', 'RentalPanel support', 'Custom API panels']
        },
        {
            step: '03',
            title: 'Scan WhatsApp QR',
            description: 'Connect your WhatsApp business number by scanning a simple QR code. Multiple devices supported simultaneously.',
            icon: <Smartphone size={36} />,
            details: ['QR code scan', 'Multi-device support', 'Telegram bot option']
        },
        {
            step: '04',
            title: 'Configure Bot Rules',
            description: 'Set up auto-reply templates, command behaviors, and provider group forwarding rules.',
            icon: <Bot size={36} />,
            details: ['Custom templates', 'Command mapping', 'Provider forwarding']
        },
        {
            step: '05',
            title: 'Go Live 24/7',
            description: 'Your bot handles all customer requests automatically while you focus on growing your business.',
            icon: <Zap size={36} />,
            details: ['24/7 automation', 'Real-time monitoring', 'Performance alerts']
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
                        <a href="/features">Features</a>
                        <a href="/how-it-works" style={{ color: 'var(--landing-primary)' }}>How It Works</a>
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

            <section style={{ padding: '120px 24px 80px' }}>
                <div className="container">
                    <div className="section-header">
                        <span className="section-badge">How It Works</span>
                        <h1 style={{ fontSize: '2.5rem', fontWeight: 800 }}>Get Started in Minutes</h1>
                        <p>Simple setup process — from signup to fully automated support in under 10 minutes</p>
                    </div>

                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '32px',
                        maxWidth: '800px',
                        margin: '48px auto 0'
                    }}>
                        {steps.map((step, index) => (
                            <div key={index} style={{
                                display: 'flex',
                                gap: '24px',
                                background: 'var(--landing-bg)',
                                border: '1px solid var(--landing-border)',
                                borderRadius: 'var(--landing-radius)',
                                padding: '32px',
                                alignItems: 'flex-start',
                                transition: 'all 0.3s ease'
                            }}>
                                <div style={{
                                    flexShrink: 0,
                                    width: '72px',
                                    height: '72px',
                                    background: 'rgba(22, 163, 74, 0.08)',
                                    border: '2px solid var(--landing-primary)',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'var(--landing-primary)'
                                }}>
                                    {step.icon}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--landing-primary)', marginBottom: '4px' }}>
                                        STEP {step.step}
                                    </div>
                                    <h3 style={{ fontSize: '1.25rem', marginBottom: '8px', color: 'var(--landing-text)' }}>{step.title}</h3>
                                    <p style={{ color: 'var(--landing-text-muted)', lineHeight: 1.6, marginBottom: '12px' }}>{step.description}</p>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                        {step.details.map((d, i) => (
                                            <span key={i} style={{
                                                fontSize: '0.75rem',
                                                padding: '3px 10px',
                                                background: 'var(--landing-bg-secondary)',
                                                borderRadius: '6px',
                                                color: 'var(--landing-text-muted)',
                                                fontWeight: 500
                                            }}>
                                                ✓ {d}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className="cta-section">
                <div className="container">
                    <div className="cta-content">
                        <h2>Ready to Automate?</h2>
                        <p>Set up your bot in minutes and start saving hours every day.</p>
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
