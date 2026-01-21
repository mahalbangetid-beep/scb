import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mail, Lock, User, Loader2, ArrowRight, ShieldCheck, AlertCircle, Phone, MessageCircle, Globe, Key, ChevronDown, ChevronUp } from 'lucide-react'
import api from '../services/api'

export default function Register() {
    const [formData, setFormData] = useState({
        username: '',
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
        whatsappNumber: '',
        telegramUsername: '',
        smmPanelUrl: '',
        panelApiKey: ''
    })
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [showOptional, setShowOptional] = useState(false)
    const navigate = useNavigate()

    const handleSubmit = async (e) => {
        e.preventDefault()

        if (formData.password !== formData.confirmPassword) {
            setError('Passwords do not match')
            return
        }

        if (formData.password.length < 6) {
            setError('Password must be at least 6 characters')
            return
        }

        if (formData.username.length < 3) {
            setError('Username must be at least 3 characters')
            return
        }

        setLoading(true)
        setError(null)

        try {
            const res = await api.post('/auth/register', {
                username: formData.username,
                name: formData.name,
                email: formData.email,
                password: formData.password,
                whatsappNumber: formData.whatsappNumber || undefined,
                telegramUsername: formData.telegramUsername || undefined,
                smmPanelUrl: formData.smmPanelUrl || undefined,
                panelApiKey: formData.panelApiKey || undefined
            })

            // On register success, we automatically login if API returns token
            if (res.data.token) {
                localStorage.setItem('token', res.data.token)
                localStorage.setItem('user', JSON.stringify(res.data.user))
                navigate('/dashboard')
            } else {
                navigate('/login', { state: { message: 'Registration successful! Please login.' } })
            }
        } catch (err) {
            setError(err.error?.message || err.message || 'Registration failed. Please try again.')
            setLoading(false)
        }
    }

    return (
        <div className="auth-container">
            <div className="auth-card animate-scale-in" style={{ maxWidth: '480px' }}>
                <div className="auth-header">
                    <div className="auth-logo">
                        <ShieldCheck size={32} className="primary" />
                        <span className="logo-text">SMMChatBot</span>
                    </div>
                    <h1 className="auth-title">Create Account</h1>
                    <p className="auth-subtitle">Get started with SMM Panel Automation today</p>
                </div>

                {error && (
                    <div className="auth-error animate-shake">
                        <AlertCircle size={16} />
                        <span>{error}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="auth-form">
                    {/* Username */}
                    <div className="form-group">
                        <label className="form-label">Username *</label>
                        <div className="input-with-icon">
                            <User size={18} />
                            <input
                                type="text"
                                className="form-input"
                                placeholder="johndoe"
                                value={formData.username}
                                onChange={(e) => setFormData({ ...formData, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                                required
                                disabled={loading}
                                autoComplete="username"
                            />
                        </div>
                        <p className="form-hint">Letters, numbers, and underscores only</p>
                    </div>

                    {/* Full Name */}
                    <div className="form-group">
                        <label className="form-label">Full Name *</label>
                        <div className="input-with-icon">
                            <User size={18} />
                            <input
                                type="text"
                                className="form-input"
                                placeholder="John Doe"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                required
                                disabled={loading}
                            />
                        </div>
                    </div>

                    {/* Email */}
                    <div className="form-group">
                        <label className="form-label">Email Address *</label>
                        <div className="input-with-icon">
                            <Mail size={18} />
                            <input
                                type="email"
                                className="form-input"
                                placeholder="name@company.com"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                required
                                disabled={loading}
                            />
                        </div>
                    </div>

                    {/* Password */}
                    <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-md)' }}>
                        <div className="form-group">
                            <label className="form-label">Password *</label>
                            <div className="input-with-icon">
                                <Lock size={18} />
                                <input
                                    type="password"
                                    className="form-input"
                                    placeholder="••••••••"
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    required
                                    disabled={loading}
                                    autoComplete="new-password"
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Confirm *</label>
                            <div className="input-with-icon">
                                <Lock size={18} />
                                <input
                                    type="password"
                                    className="form-input"
                                    placeholder="••••••••"
                                    value={formData.confirmPassword}
                                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                                    required
                                    disabled={loading}
                                    autoComplete="new-password"
                                />
                            </div>
                        </div>
                    </div>
                    <p className="form-hint" style={{ marginTop: '-0.5rem' }}>At least 6 characters</p>

                    {/* Optional Fields Toggle */}
                    <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => setShowOptional(!showOptional)}
                        style={{ width: '100%', justifyContent: 'center', marginTop: 'var(--spacing-sm)' }}
                    >
                        {showOptional ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        {showOptional ? 'Hide' : 'Show'} SMM Panel Settings (Optional)
                    </button>

                    {/* Optional SMM Panel Fields */}
                    {showOptional && (
                        <div className="optional-fields" style={{
                            marginTop: 'var(--spacing-md)',
                            padding: 'var(--spacing-md)',
                            background: 'var(--bg-tertiary)',
                            borderRadius: 'var(--radius-lg)',
                            border: '1px solid var(--border-color)'
                        }}>
                            <p className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: 'var(--spacing-md)' }}>
                                You can add these later in settings
                            </p>

                            {/* WhatsApp Number */}
                            <div className="form-group">
                                <label className="form-label">WhatsApp Number</label>
                                <div className="input-with-icon">
                                    <Phone size={18} />
                                    <input
                                        type="tel"
                                        className="form-input"
                                        placeholder="+1234567890"
                                        value={formData.whatsappNumber}
                                        onChange={(e) => setFormData({ ...formData, whatsappNumber: e.target.value })}
                                        disabled={loading}
                                    />
                                </div>
                            </div>

                            {/* Telegram Username */}
                            <div className="form-group">
                                <label className="form-label">Telegram Username</label>
                                <div className="input-with-icon">
                                    <MessageCircle size={18} />
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="@username"
                                        value={formData.telegramUsername}
                                        onChange={(e) => setFormData({ ...formData, telegramUsername: e.target.value })}
                                        disabled={loading}
                                    />
                                </div>
                            </div>

                            {/* SMM Panel URL */}
                            <div className="form-group">
                                <label className="form-label">SMM Panel URL</label>
                                <div className="input-with-icon">
                                    <Globe size={18} />
                                    <input
                                        type="url"
                                        className="form-input"
                                        placeholder="https://yourpanel.com"
                                        value={formData.smmPanelUrl}
                                        onChange={(e) => setFormData({ ...formData, smmPanelUrl: e.target.value })}
                                        disabled={loading}
                                    />
                                </div>
                            </div>

                            {/* Panel API Key */}
                            <div className="form-group">
                                <label className="form-label">Panel API Key</label>
                                <div className="input-with-icon">
                                    <Key size={18} />
                                    <input
                                        type="password"
                                        className="form-input"
                                        placeholder="Your panel API key"
                                        value={formData.panelApiKey}
                                        onChange={(e) => setFormData({ ...formData, panelApiKey: e.target.value })}
                                        disabled={loading}
                                    />
                                </div>
                                <p className="form-hint">This will be encrypted and stored securely</p>
                            </div>
                        </div>
                    )}

                    <button type="submit" className="btn btn-primary auth-btn" disabled={loading} style={{ marginTop: 'var(--spacing-lg)' }}>
                        {loading ? (
                            <Loader2 className="animate-spin" size={20} />
                        ) : (
                            <>
                                Create Account
                                <ArrowRight size={20} />
                            </>
                        )}
                    </button>
                </form>

                <div className="auth-footer">
                    <p>Already have an account? <Link to="/login" className="auth-link">Log in instead</Link></p>
                </div>
            </div>

            <div className="auth-decoration">
                <div className="blob"></div>
                <div className="blob2"></div>
            </div>
        </div>
    )
}
