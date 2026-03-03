import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    MessageSquare,
    Zap,
    Shield,
    Clock,
    Users,
    ChevronRight,
    Check,
    X,
    Star,
    Play,
    ArrowRight,
    Bot,
    Send,
    RefreshCw,
    AlertTriangle,
    Smartphone,
    Globe,
    Headphones,
    BarChart3,
    Lock,
    CheckCircle2,
    Sparkles,
    Radio,
    Megaphone,
    MessageCircle,
    Target,
    Calendar,
    FileText
} from 'lucide-react';

const LandingPage = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('refill');
    const [activePricingTab, setActivePricingTab] = useState('support');
    const [isVisible, setIsVisible] = useState({});
    const [pricingPackages, setPricingPackages] = useState({});
    const [pricingLoading, setPricingLoading] = useState(true);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setIsVisible((prev) => ({ ...prev, [entry.target.id]: true }));
                    }
                });
            },
            { threshold: 0.1 }
        );

        document.querySelectorAll('[data-animate]').forEach((el) => {
            observer.observe(el);
        });

        return () => observer.disconnect();
    }, []);

    // Fetch credit packages from backend for pricing section
    useEffect(() => {
        const fetchPricingPackages = async () => {
            try {
                setPricingLoading(true);
                const rawUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
                // Strip trailing /api if present to get base URL, then append public endpoint
                const baseUrl = rawUrl.replace(/\/api\/?$/, '');
                const res = await fetch(`${baseUrl}/api/public/credit-packages`);
                if (!res.ok) throw new Error('Failed to fetch packages');
                const json = await res.json();
                const packages = json.data || [];

                // Group packages by category for tabs
                // Backend categories: support, whatsapp_marketing, telegram_marketing
                // Tab keys:           support, marketing, telegram
                const grouped = { support: [], marketing: [], telegram: [] };
                packages.forEach(pkg => {
                    if (pkg.category === 'whatsapp_marketing') {
                        grouped.marketing.push(pkg);
                    } else if (pkg.category === 'telegram_marketing') {
                        grouped.telegram.push(pkg);
                    } else {
                        grouped.support.push(pkg);
                    }
                });

                setPricingPackages(grouped);
            } catch (err) {
                console.warn('[LandingPage] Failed to fetch pricing packages:', err.message);
                // pricingPackages stays empty → fallback message shown
            } finally {
                setPricingLoading(false);
            }
        };

        fetchPricingPackages();
    }, []);

    const features = [
        {
            icon: <Bot size={28} />,
            title: 'Intelligent Auto-Reply',
            description: 'AI-powered responses that understand context and handle customer queries 24/7 without manual intervention.'
        },
        {
            icon: <RefreshCw size={28} />,
            title: 'Instant Refill Processing',
            description: 'Automatically process refill requests, validate orders, and forward to providers in milliseconds.'
        },
        {
            icon: <Shield size={28} />,
            title: 'Advanced Security',
            description: 'Order verification, phone number validation, and fraud prevention systems built-in.'
        },
        {
            icon: <Zap size={28} />,
            title: 'Real-time Processing',
            description: 'Handle 100+ orders per message with instant individual responses for each order.'
        },
        {
            icon: <Globe size={28} />,
            title: 'Multi-Platform Support',
            description: 'Works seamlessly with WhatsApp and Telegram from a single unified dashboard.'
        },
        {
            icon: <BarChart3 size={28} />,
            title: 'Detailed Analytics',
            description: 'Track every message, command, and transaction with comprehensive reporting tools.'
        }
    ];

    const howItWorks = [
        {
            step: '01',
            title: 'Connect Your Panel',
            description: 'Link your PerfectPanel or RentalPanel using API keys. Setup takes less than 2 minutes.',
            icon: <Globe size={32} />
        },
        {
            step: '02',
            title: 'Scan WhatsApp QR',
            description: 'Connect your WhatsApp business number by scanning a simple QR code.',
            icon: <Smartphone size={32} />
        },
        {
            step: '03',
            title: 'Configure Bot Rules',
            description: 'Set up auto-reply templates, command behaviors, and provider group forwarding.',
            icon: <Bot size={32} />
        },
        {
            step: '04',
            title: 'Go Live 24/7',
            description: 'Your bot handles all customer requests automatically while you focus on growing your business.',
            icon: <Zap size={32} />
        }
    ];

    // Get available pricing tabs (only show tabs that have packages)
    const availablePricingTabs = [
        { key: 'support', label: 'Support Message', icon: <Headphones size={18} /> },
        { key: 'marketing', label: 'Marketing Message', icon: <Megaphone size={18} /> },
        { key: 'telegram', label: 'Telegram Message', icon: <Send size={18} /> }
    ];

    const paymentMethods = [
        { name: 'Binance Pay', icon: '₿' },
        { name: 'Cryptomus', icon: '💎' },
        { name: 'Tik Kart', icon: '💳' },
        { name: 'Helekart', icon: '🏪' },
        { name: 'Bank Transfer', icon: '🏦' }
    ];

    const testimonials = [
        {
            name: 'Michael Chen',
            role: 'CEO, SocialBoost Agency',
            avatar: 'MC',
            content: 'This platform reduced our support response time from hours to seconds. Our customers are happier and we save 20+ hours weekly.',
            rating: 5
        },
        {
            name: 'Sarah Johnson',
            role: 'SMM Panel Owner',
            avatar: 'SJ',
            content: 'Finally a solution that actually works with PerfectPanel! The auto-refill feature alone paid for itself in the first week.',
            rating: 5
        },
        {
            name: 'David Kumar',
            role: 'Digital Marketing Agency',
            avatar: 'DK',
            content: 'Managing 50+ provider groups was a nightmare. Now everything is automated and organized. Highly recommended!',
            rating: 5
        }
    ];

    const commandExamples = {
        refill: {
            request: '481799696 refill',
            response: `✅ Refill Request Submitted

🆔 Order: #481799696
📊 Status: ✅ Completed
📋 Service: Instagram Followers
🔗 Link: instagram.com/example

✅ Refill request has been forwarded to provider.
📩 Reference: REF-2847593`
        },
        cancel: {
            request: '485018699 cancel',
            response: `📋 Cancel Request Processed

🆔 Order: #485018699
📊 Status: ⏳ In Progress
💰 Charge: $12.50
📉 Remaining: 2,340

✅ This order has been added to refund queue.
📩 Provider notified automatically.`
        },
        status: {
            request: '3463745263 status',
            response: `📊 Order Status

🆔 Order: #3463745263
📊 Status: ⏳ In Progress
📋 Service: YouTube Views
🔗 Link: youtube.com/watch?v=...

📈 Progress:
▪️ Start: 15,420
▪️ Ordered: 10,000
▪️ Delivered: 7,850
▪️ Remaining: 2,150`
        }
    };

    const currentPricingCards = pricingPackages[activePricingTab] || [];

    return (
        <div className="landing-page">
            {/* Navigation */}
            <nav className="landing-nav">
                <div className="nav-container">
                    <div className="nav-logo">
                        <MessageSquare size={32} className="logo-icon" />
                        <span className="logo-text">SMMChatBot</span>
                    </div>
                    <div className="nav-links">
                        <a href="#features">Features</a>
                        <a href="#how-it-works">How It Works</a>
                        <a href="#pricing">Pricing</a>
                        <a href="#faq">FAQ</a>
                    </div>
                    <div className="nav-actions">
                        <button className="btn-ghost" onClick={() => navigate('/login')}>Sign In</button>
                        <button className="btn-primary" onClick={() => navigate('/register')}>
                            Get Started <ArrowRight size={18} />
                        </button>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="hero-section">
                <div className="hero-bg-gradient"></div>
                <div className="hero-content">
                    <div className="hero-badge">
                        <Shield size={16} />
                        <span>Enterprise-Grade Security</span>
                    </div>

                    <h1 className="hero-title">
                        <span className="gradient-text">PerfectPanel & RentalPanel</span>
                        <br />
                        Supported Chat Bot
                    </h1>

                    <p className="hero-subtitle">
                        Automate your SMM panel support with intelligent WhatsApp & Telegram bots.
                        Handle refills, cancellations, and status checks while you sleep.
                    </p>

                    <div className="hero-cta">
                        <button className="btn-primary btn-large" onClick={() => navigate('/register')}>
                            Start Free Trial <Sparkles size={20} />
                        </button>
                        <button className="btn-outline btn-large">
                            <Play size={20} /> Watch Demo
                        </button>
                    </div>

                    <div className="hero-trust">
                        <div className="trust-badge">
                            <CheckCircle2 size={20} />
                            <span>Meta Business Verified Platform</span>
                        </div>
                        <div className="trust-badge">
                            <Lock size={20} />
                            <span>256-bit SSL Encryption</span>
                        </div>
                        <div className="trust-badge">
                            <Clock size={20} />
                            <span>99.9% Uptime Guarantee</span>
                        </div>
                    </div>
                </div>

                <div className="hero-visual">
                    <div className="phone-mockup">
                        <div className="phone-header">
                            <div className="phone-notch"></div>
                        </div>
                        <div className="chat-window">
                            <div className="chat-header-mock">
                                <div className="chat-avatar">🤖</div>
                                <div className="chat-info">
                                    <span className="chat-name">SMM Support Bot</span>
                                    <span className="chat-status">Online • Auto-reply enabled</span>
                                </div>
                            </div>
                            <div className="chat-messages">
                                <div className="message incoming">
                                    <span>481799696 refill</span>
                                    <span className="time">10:32 AM</span>
                                </div>
                                <div className="message outgoing">
                                    <span>✅ Refill request submitted successfully!</span>
                                    <span className="time">10:32 AM</span>
                                </div>
                                <div className="message outgoing">
                                    <span>📩 Provider has been notified automatically.</span>
                                    <span className="time">10:32 AM</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Panel Support Section */}
            <section className="panel-support-section">
                <div className="container">
                    <div className="section-header">
                        <h2>Supported SMM Panels</h2>
                        <p>Works out-of-the-box with major panel platforms</p>
                    </div>
                    <div className="panel-cards">
                        <div className="panel-card featured">
                            <div className="panel-icon">PP</div>
                            <h3>PerfectPanel</h3>
                            <p>Full API integration with admin capabilities</p>
                            <span className="badge">Fully Supported</span>
                        </div>
                        <div className="panel-card featured">
                            <div className="panel-icon">RP</div>
                            <h3>RentalPanel</h3>
                            <p>Complete automation support with provider data</p>
                            <span className="badge">Fully Supported</span>
                        </div>
                        <div className="panel-card">
                            <div className="panel-icon">+</div>
                            <h3>Custom Panels</h3>
                            <p>Any panel with standard SMM API can be integrated</p>
                            <span className="badge secondary">On Request</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section id="features" className="features-section" data-animate>
                <div className="container">
                    <div className="section-header">
                        <span className="section-badge">Features</span>
                        <h2>Everything You Need to Automate Support</h2>
                        <p>Powerful features designed for SMM panel owners who want to scale</p>
                    </div>
                    <div className="features-grid">
                        {features.map((feature, index) => (
                            <div key={index} className="feature-card">
                                <div className="feature-icon">{feature.icon}</div>
                                <h3>{feature.title}</h3>
                                <p>{feature.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Demo Section */}
            <section className="demo-section">
                <div className="container">
                    <div className="section-header">
                        <span className="section-badge">Live Demo</span>
                        <h2>See the Bot in Action</h2>
                        <p>Real examples of how your customers will interact with the automated support</p>
                    </div>

                    <div className="demo-tabs">
                        <button
                            className={`demo-tab ${activeTab === 'refill' ? 'active' : ''}`}
                            onClick={() => setActiveTab('refill')}
                        >
                            <RefreshCw size={18} /> Refill Command
                        </button>
                        <button
                            className={`demo-tab ${activeTab === 'cancel' ? 'active' : ''}`}
                            onClick={() => setActiveTab('cancel')}
                        >
                            <X size={18} /> Cancel Command
                        </button>
                        <button
                            className={`demo-tab ${activeTab === 'status' ? 'active' : ''}`}
                            onClick={() => setActiveTab('status')}
                        >
                            <BarChart3 size={18} /> Status Check
                        </button>
                    </div>

                    <div className="demo-content">
                        <div className="demo-phone">
                            <div className="demo-chat">
                                <div className="demo-message customer">
                                    <div className="message-bubble">
                                        <code>{commandExamples[activeTab].request}</code>
                                    </div>
                                    <span className="message-time">Customer</span>
                                </div>
                                <div className="demo-message bot">
                                    <div className="message-bubble">
                                        <pre>{commandExamples[activeTab].response}</pre>
                                    </div>
                                    <span className="message-time">Bot • Instant</span>
                                </div>
                            </div>
                        </div>
                        <div className="demo-info">
                            <h3>⚡ Response Time: &lt;1 second</h3>
                            <ul>
                                <li><Check size={18} /> Validates order ownership automatically</li>
                                <li><Check size={18} /> Fetches real-time data from your panel</li>
                                <li><Check size={18} /> Forwards to provider groups if configured</li>
                                <li><Check size={18} /> Logs everything for your reports</li>
                                <li><Check size={18} /> Works in groups and private chats</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </section>

            {/* How It Works */}
            <section id="how-it-works" className="how-it-works-section">
                <div className="container">
                    <div className="section-header">
                        <span className="section-badge">How It Works</span>
                        <h2>Get Started in Minutes</h2>
                        <p>Simple setup process to get your automation running</p>
                    </div>
                    <div className="steps-container">
                        {howItWorks.map((step, index) => (
                            <div key={index} className="step-card">
                                <div className="step-number">{step.step}</div>
                                <div className="step-icon">{step.icon}</div>
                                <h3>{step.title}</h3>
                                <p>{step.description}</p>
                                {index < howItWorks.length - 1 && (
                                    <div className="step-connector">
                                        <ChevronRight size={24} />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Pricing Section - Tabs + Card Slider */}
            <section id="pricing" className="pricing-section">
                <div className="container">
                    <div className="section-header">
                        <span className="section-badge">Pricing</span>
                        <h2>Simple, Transparent Pricing</h2>
                        <p>Choose the plan that fits your business needs</p>
                    </div>

                    {/* Pricing Tabs — only show tabs that have packages */}
                    <div className="pricing-tabs">
                        {availablePricingTabs.map(tab => (
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

                    {/* Credit Package Cards from Backend */}
                    {pricingLoading ? (
                        <div className="pricing-cards-slider">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="pricing-slide-card" style={{ opacity: 0.5, minHeight: 280 }}>
                                    <div className="card-icon"><Headphones size={24} /></div>
                                    <h4 style={{ background: '#e2e8f0', borderRadius: 8, height: 20, width: '60%' }}></h4>
                                    <div className="card-price" style={{ background: '#e2e8f0', borderRadius: 8, height: 32, width: '40%', margin: '16px 0' }}></div>
                                    <p className="card-desc" style={{ background: '#f1f5f9', borderRadius: 6, height: 14, width: '90%' }}></p>
                                </div>
                            ))}
                        </div>
                    ) : currentPricingCards.length > 0 ? (
                        <div className="pricing-cards-slider">
                            {currentPricingCards.map((pkg, index) => (
                                <div key={index} className={`pricing-slide-card ${pkg.isFeatured ? 'popular-card' : ''}`}>
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
                                        {pkg.valuePerDollar && (
                                            <li><Check size={14} /> {pkg.valuePerDollar} credits/$</li>
                                        )}
                                    </ul>
                                    <button className="card-cta" onClick={() => navigate('/register')}>
                                        Get Started
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '48px 24px', color: '#64748b' }}>
                            <p>No packages available for this category yet.</p>
                            <p style={{ fontSize: '0.875rem', marginTop: 8 }}>Contact us for custom pricing.</p>
                        </div>
                    )}
                </div>
            </section>

            {/* Broadcast Section */}
            <section className="broadcast-section">
                <div className="container">
                    <div className="section-header">
                        <span className="section-badge">Broadcasting</span>
                        <h2>WhatsApp & Telegram Broadcast</h2>
                        <p>Reach your customers with powerful multi-platform broadcast tools</p>
                    </div>

                    <div className="broadcast-content">
                        <div className="broadcast-info">
                            <h3>Marketing Automation Made Simple</h3>
                            <p>
                                Send targeted messages to thousands of customers across WhatsApp and Telegram
                                with our powerful broadcast engine. Schedule campaigns, track delivery, and
                                analyze engagement — all from one dashboard.
                            </p>
                            <ul className="broadcast-features">
                                <li>
                                    <Check size={18} />
                                    <div><strong>Scheduled Campaigns</strong> — Set it and forget it. Messages go out at the perfect time.</div>
                                </li>
                                <li>
                                    <Check size={18} />
                                    <div><strong>Rich Media Support</strong> — Send images, videos, documents, and formatted text.</div>
                                </li>
                                <li>
                                    <Check size={18} />
                                    <div><strong>Smart Intervals</strong> — Anti-spam protection with configurable send intervals.</div>
                                </li>
                                <li>
                                    <Check size={18} />
                                    <div><strong>Delivery Reports</strong> — Track delivered, read, and failed messages in real-time.</div>
                                </li>
                            </ul>
                            <button className="btn-primary" onClick={() => navigate('/register')}>
                                Try Broadcast Free <ArrowRight size={18} />
                            </button>
                        </div>

                        <div className="broadcast-cards">
                            <div className="broadcast-card">
                                <div className="bc-icon"><MessageCircle size={24} /></div>
                                <h4>WhatsApp Broadcast</h4>
                                <p>Bulk messaging with personalized templates</p>
                            </div>
                            <div className="broadcast-card">
                                <div className="bc-icon"><Send size={24} /></div>
                                <h4>Telegram Broadcast</h4>
                                <p>Channel & group messaging at scale</p>
                            </div>
                            <div className="broadcast-card">
                                <div className="bc-icon"><Calendar size={24} /></div>
                                <h4>Scheduled Sends</h4>
                                <p>Automated campaigns on your schedule</p>
                            </div>
                            <div className="broadcast-card">
                                <div className="bc-icon"><BarChart3 size={24} /></div>
                                <h4>Analytics</h4>
                                <p>Delivery tracking & engagement metrics</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Payment Methods */}
            <section className="payment-section">
                <div className="container">
                    <h3>Accepted Payment Methods</h3>
                    <div className="payment-methods">
                        {paymentMethods.map((method, index) => (
                            <div key={index} className="payment-method">
                                <span className="payment-icon">{method.icon}</span>
                                <span>{method.name}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Testimonials */}
            <section className="testimonials-section">
                <div className="container">
                    <div className="section-header">
                        <span className="section-badge">Testimonials</span>
                        <h2>Trusted by SMM Professionals</h2>
                    </div>
                    <div className="testimonials-grid">
                        {testimonials.map((testimonial, index) => (
                            <div key={index} className="testimonial-card">
                                <div className="testimonial-rating">
                                    {[...Array(testimonial.rating)].map((_, i) => (
                                        <Star key={i} size={18} fill="#FFD700" color="#FFD700" />
                                    ))}
                                </div>
                                <p className="testimonial-content">"{testimonial.content}"</p>
                                <div className="testimonial-author">
                                    <div className="author-avatar">{testimonial.avatar}</div>
                                    <div className="author-info">
                                        <span className="author-name">{testimonial.name}</span>
                                        <span className="author-role">{testimonial.role}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Important Notices */}
            <section className="notices-section">
                <div className="container">
                    <div className="section-header">
                        <AlertTriangle size={32} className="warning-icon" />
                        <h2>Important Information</h2>
                    </div>
                    <div className="notices-grid">
                        <div className="notice-card warning">
                            <h4>⚠️ Service Disclaimer</h4>
                            <p>This is a technical automation platform. Occasional downtime may occur for maintenance or technical issues. Resolution time may vary depending on the complexity of the issue.</p>
                        </div>
                        <div className="notice-card warning">
                            <h4>📱 WhatsApp Risk Notice</h4>
                            <p>While we implement best practices to keep accounts safe, users connect and use WhatsApp numbers at their own risk. We recommend using dedicated business numbers for automation.</p>
                        </div>
                        <div className="notice-card info">
                            <h4>💰 Wallet Policy</h4>
                            <p>All funds added to your wallet are non-refundable and cannot be withdrawn. Credits can only be used for platform services. Please add funds according to your usage needs.</p>
                        </div>
                        <div className="notice-card info">
                            <h4>📋 Terms of Use</h4>
                            <p>By using this platform, you acknowledge and accept full responsibility for your automation activities. Please review our Terms of Service before registration.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="cta-section">
                <div className="container">
                    <div className="cta-content">
                        <h2>Ready to Automate Your SMM Support?</h2>
                        <p>Join hundreds of panel owners who save hours every day with intelligent automation.</p>
                        <div className="cta-buttons">
                            <button className="btn-primary btn-large" onClick={() => navigate('/register')}>
                                Start Free Trial <ArrowRight size={20} />
                            </button>
                            <button className="btn-ghost btn-large">
                                <Headphones size={20} /> Contact Support
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="landing-footer">
                <div className="container">
                    <div className="footer-grid">
                        <div className="footer-brand">
                            <div className="footer-logo">
                                <MessageSquare size={28} />
                                <span>SMMChatBot</span>
                            </div>
                            <p>Enterprise-grade WhatsApp & Telegram automation for SMM panel owners.</p>
                            <div className="footer-trust">
                                <CheckCircle2 size={16} />
                                <span>Meta Business Verified</span>
                            </div>
                        </div>
                        <div className="footer-links">
                            <h4>Product</h4>
                            <a href="#features">Features</a>
                            <a href="#pricing">Pricing</a>
                            <a href="#how-it-works">How It Works</a>
                            <a href="#">API Docs</a>
                        </div>
                        <div className="footer-links">
                            <h4>Company</h4>
                            <a href="#">About Us</a>
                            <a href="#">Blog</a>
                            <a href="#">Careers</a>
                            <a href="#">Contact</a>
                        </div>
                        <div className="footer-links">
                            <h4>Legal</h4>
                            <a href="#">Terms of Service</a>
                            <a href="#">Privacy Policy</a>
                            <a href="#">Refund Policy</a>
                            <a href="#">Disclaimer</a>
                        </div>
                    </div>
                    <div className="footer-bottom">
                        <p>&copy; 2026 SMMChatBot. All rights reserved.</p>
                        <div className="footer-social">
                            <a href="#" aria-label="Twitter">𝕏</a>
                            <a href="#" aria-label="Telegram">💬</a>
                            <a href="#" aria-label="Discord">🎮</a>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
