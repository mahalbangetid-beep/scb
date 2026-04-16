/**
 * Standalone FAQ Page — Section 10.2
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageSquare, ArrowRight, ChevronDown, HelpCircle } from 'lucide-react'

const faqData = [
    {
        category: 'General',
        questions: [
            {
                q: 'What is SMMChatBot?',
                a: 'SMMChatBot is an enterprise-grade automation platform for SMM panel owners. It connects your WhatsApp or Telegram to your SMM panel (PerfectPanel, RentalPanel, or custom panels) and automatically handles customer orders, refills, cancellations, and status checks 24/7.'
            },
            {
                q: 'Which SMM panels are supported?',
                a: 'We fully support PerfectPanel and RentalPanel with complete API integration. Any panel with a standard SMM API can also be integrated on request.'
            },
            {
                q: 'How long does setup take?',
                a: 'Most users are up and running in under 10 minutes. Simply create an account, connect your panel via API key, scan a WhatsApp QR code, and configure your bot rules.'
            }
        ]
    },
    {
        category: 'Features',
        questions: [
            {
                q: 'Can the bot handle multiple orders in one message?',
                a: 'Yes! The bot can process 100+ orders in a single message. It will respond with individual status updates for each order and handle them asynchronously.'
            },
            {
                q: 'Does it support group chats?',
                a: 'Yes. The bot works in both private chats and group chats. In groups, it can track order ownership, handle multiple users, and forward to provider groups automatically.'
            },
            {
                q: 'Can I broadcast messages to my customers?',
                a: 'Yes. The platform includes a powerful broadcast engine for both WhatsApp and Telegram. You can schedule campaigns, use rich media, set send intervals, and track delivery in real-time.'
            },
            {
                q: 'Is there Telegram support?',
                a: 'Yes. We support both WhatsApp and Telegram from a single dashboard. You can connect Telegram bots and use them for order processing and broadcasting.'
            }
        ]
    },
    {
        category: 'Security',
        questions: [
            {
                q: 'Is my WhatsApp number safe?',
                a: 'We implement best practices to keep accounts safe, including configurable message delays, anti-spam protection, and rate limiting. However, users connect and use WhatsApp numbers at their own risk. We recommend using dedicated business numbers.'
            },
            {
                q: 'Do you support Two-Factor Authentication?',
                a: 'Yes. We support Google Authenticator (TOTP) for two-factor authentication. Admins can enforce 2FA for all users as an additional security measure.'
            },
            {
                q: 'How are API keys stored?',
                a: 'API keys and sensitive credentials are stored securely in our database. All communication is encrypted with 256-bit SSL.'
            }
        ]
    },
    {
        category: 'Billing',
        questions: [
            {
                q: 'What payment methods are accepted?',
                a: 'We accept Binance Pay, Cryptomus (crypto), and various local payment methods. Manual bank transfer is also available.'
            },
            {
                q: 'How does the credit system work?',
                a: 'You purchase message credit packages which are deducted as the bot sends messages. Different message types (support, marketing, Telegram) can have different rates. Credits never expire.'
            },
            {
                q: 'Are funds refundable?',
                a: 'All funds added to your wallet are non-refundable and cannot be withdrawn. Credits can only be used for platform services. Please add funds according to your usage needs.'
            }
        ]
    }
]

export default function FaqPage() {
    const navigate = useNavigate()
    const [openIndex, setOpenIndex] = useState(null)

    const toggle = (idx) => setOpenIndex(openIndex === idx ? null : idx)

    let globalIdx = 0

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
                        <a href="/pricing">Pricing</a>
                        <a href="/faq" style={{ color: 'var(--landing-primary)' }}>FAQ</a>
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
                <div className="container" style={{ maxWidth: '800px' }}>
                    <div className="section-header">
                        <span className="section-badge">FAQ</span>
                        <h1 style={{ fontSize: '2.5rem', fontWeight: 800 }}>Frequently Asked Questions</h1>
                        <p>Everything you need to know about SMMChatBot</p>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '48px', marginTop: '48px' }}>
                        {faqData.map((section) => (
                            <div key={section.category}>
                                <h2 style={{
                                    fontSize: '1.25rem',
                                    fontWeight: 700,
                                    color: 'var(--landing-primary)',
                                    marginBottom: '16px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}>
                                    <HelpCircle size={20} /> {section.category}
                                </h2>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {section.questions.map((faq) => {
                                        const idx = globalIdx++
                                        const isOpen = openIndex === idx
                                        return (
                                            <div key={idx} style={{
                                                background: 'var(--landing-bg)',
                                                border: `1px solid ${isOpen ? 'var(--landing-primary)' : 'var(--landing-border)'}`,
                                                borderRadius: 'var(--landing-radius)',
                                                overflow: 'hidden',
                                                transition: 'border-color 0.2s ease'
                                            }}>
                                                <button
                                                    onClick={() => toggle(idx)}
                                                    style={{
                                                        width: '100%',
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                        padding: '16px 20px',
                                                        background: 'none',
                                                        border: 'none',
                                                        cursor: 'pointer',
                                                        color: 'var(--landing-text)',
                                                        fontSize: '0.9375rem',
                                                        fontWeight: 600,
                                                        textAlign: 'left'
                                                    }}
                                                >
                                                    {faq.q}
                                                    <ChevronDown
                                                        size={18}
                                                        style={{
                                                            flexShrink: 0,
                                                            transition: 'transform 0.2s ease',
                                                            transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
                                                            color: 'var(--landing-text-muted)'
                                                        }}
                                                    />
                                                </button>
                                                {isOpen && (
                                                    <div style={{
                                                        padding: '0 20px 16px',
                                                        fontSize: '0.9375rem',
                                                        color: 'var(--landing-text-muted)',
                                                        lineHeight: 1.7
                                                    }}>
                                                        {faq.a}
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className="cta-section">
                <div className="container">
                    <div className="cta-content">
                        <h2>Still Have Questions?</h2>
                        <p>Our support team is ready to help. Contact us anytime.</p>
                        <div className="cta-buttons">
                            <button className="btn-primary btn-large" onClick={() => navigate('/register')}>
                                Get Started <ArrowRight size={20} />
                            </button>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    )
}
