import { useState, useEffect, useRef } from 'react'
import {
    Settings, Save, Loader2, AlertCircle, CheckCircle2, X,
    DollarSign, MessageSquare, Shield, Globe, Bell, Smartphone,
    CreditCard, Clock, Lock, Mail, Users, Zap, Database, Image, Upload, Trash2
} from 'lucide-react'
import api from '../../services/api'

export default function SystemSettings() {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState(null)
    const [success, setSuccess] = useState(null)
    const [activeSection, setActiveSection] = useState('billing')

    const [settings, setSettings] = useState({
        // Pricing
        creditPerMessageWa: 0.01,
        creditPerMessageTg: 0.01,
        creditPerGroupMessage: 0.02,
        waLoginFee: 5.00,
        tgLoginFee: 3.00,
        defaultUserCredit: 0,

        // Platform
        platformName: 'SMMChatBot',
        supportEmail: '',
        supportWhatsapp: '',
        maintenanceMode: false,

        // Security
        maxLoginAttempts: 5,
        sessionTimeout: 24,
        requireEmailVerification: false,

        // Notifications
        emailNotifications: true,
        lowBalanceThreshold: 5.00,
        autoSuspendOnZeroBalance: false,

        // Branding
        frontendLogo: '',
        backendLogo: '',
        favicon: ''
    })

    // Billing mode state (separate from regular settings)
    const [billingMode, setBillingMode] = useState('CREDITS')
    const [billingLoading, setBillingLoading] = useState(false)

    const frontendLogoRef = useRef(null)
    const backendLogoRef = useRef(null)
    const faviconRef = useRef(null)
    const MAX_FILE_SIZE = 500 * 1024 // 500KB
    const MAX_FAVICON_SIZE = 100 * 1024 // 100KB for favicon

    const sections = [
        { id: 'billing', label: 'Billing Mode', icon: CreditCard, color: '#10b981' },
        { id: 'pricing', label: 'Pricing & Rates', icon: DollarSign, color: '#22c55e' },
        { id: 'platform', label: 'Platform', icon: Globe, color: '#3b82f6' },
        { id: 'security', label: 'Security', icon: Shield, color: '#a855f7' },
        { id: 'notifications', label: 'Notifications', icon: Bell, color: '#f59e0b' }
    ]

    useEffect(() => {
        fetchSettings()
    }, [])

    const fetchSettings = async () => {
        try {
            setLoading(true)
            const [configRes, billingRes] = await Promise.all([
                api.get('/admin/config'),
                api.get('/billing-mode').catch(() => ({ data: { mode: 'CREDITS' } }))
            ])
            const configData = configRes.data || {}

            const mapConfig = (category, key, defaultValue) => {
                const items = configData[category] || []
                const item = items.find(i => i.key === key)
                return item?.value ?? defaultValue
            }

            setSettings({
                creditPerMessageWa: mapConfig('pricing', 'creditPerMessageWa', 0.01),
                creditPerMessageTg: mapConfig('pricing', 'creditPerMessageTg', 0.01),
                creditPerGroupMessage: mapConfig('pricing', 'creditPerGroupMessage', 0.02),
                waLoginFee: mapConfig('pricing', 'waLoginFee', 5.00),
                tgLoginFee: mapConfig('pricing', 'tgLoginFee', 3.00),
                defaultUserCredit: mapConfig('pricing', 'defaultUserCredit', 0),
                platformName: mapConfig('platform', 'platformName', 'SMMChatBot'),
                supportEmail: mapConfig('platform', 'supportEmail', ''),
                supportWhatsapp: mapConfig('platform', 'supportWhatsapp', ''),
                maintenanceMode: mapConfig('platform', 'maintenanceMode', false),
                maxLoginAttempts: mapConfig('security', 'maxLoginAttempts', 5),
                sessionTimeout: mapConfig('security', 'sessionTimeout', 24),
                requireEmailVerification: mapConfig('security', 'requireEmailVerification', false),
                emailNotifications: mapConfig('notifications', 'emailNotifications', true),
                lowBalanceThreshold: mapConfig('notifications', 'lowBalanceThreshold', 5.00),
                autoSuspendOnZeroBalance: mapConfig('notifications', 'autoSuspendOnZeroBalance', false),
                frontendLogo: mapConfig('branding', 'frontendLogo', ''),
                backendLogo: mapConfig('branding', 'backendLogo', ''),
                favicon: mapConfig('branding', 'favicon', '')
            })

            // Set billing mode
            setBillingMode(billingRes.data?.mode || 'CREDITS')
        } catch (err) {
            console.warn('Failed to load config:', err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleBillingModeChange = async (newMode) => {
        setBillingLoading(true)
        try {
            await api.put('/billing-mode', { mode: newMode })
            setBillingMode(newMode)
            setSuccess(`Billing mode changed to ${newMode}!`)
            setTimeout(() => setSuccess(null), 3000)
        } catch (err) {
            setError(err.message || 'Failed to change billing mode')
        } finally {
            setBillingLoading(false)
        }
    }

    const handleSave = async () => {
        setSaving(true)
        setError(null)

        try {
            const configItems = [
                { key: 'creditPerMessageWa', value: settings.creditPerMessageWa, category: 'pricing' },
                { key: 'creditPerMessageTg', value: settings.creditPerMessageTg, category: 'pricing' },
                { key: 'creditPerGroupMessage', value: settings.creditPerGroupMessage, category: 'pricing' },
                { key: 'waLoginFee', value: settings.waLoginFee, category: 'pricing' },
                { key: 'tgLoginFee', value: settings.tgLoginFee, category: 'pricing' },
                { key: 'defaultUserCredit', value: settings.defaultUserCredit, category: 'pricing' },
                { key: 'platformName', value: settings.platformName, category: 'platform' },
                { key: 'supportEmail', value: settings.supportEmail, category: 'platform' },
                { key: 'supportWhatsapp', value: settings.supportWhatsapp, category: 'platform' },
                { key: 'maintenanceMode', value: settings.maintenanceMode, category: 'platform' },
                { key: 'maxLoginAttempts', value: settings.maxLoginAttempts, category: 'security' },
                { key: 'sessionTimeout', value: settings.sessionTimeout, category: 'security' },
                { key: 'requireEmailVerification', value: settings.requireEmailVerification, category: 'security' },
                { key: 'emailNotifications', value: settings.emailNotifications, category: 'notifications' },
                { key: 'lowBalanceThreshold', value: settings.lowBalanceThreshold, category: 'notifications' },
                { key: 'autoSuspendOnZeroBalance', value: settings.autoSuspendOnZeroBalance, category: 'notifications' },
                { key: 'frontendLogo', value: settings.frontendLogo, category: 'branding' },
                { key: 'backendLogo', value: settings.backendLogo, category: 'branding' },
                { key: 'favicon', value: settings.favicon, category: 'branding' }
            ]

            for (const item of configItems) {
                await api.put('/admin/config', item)
            }

            setSuccess('Settings saved successfully!')
            setTimeout(() => setSuccess(null), 3000)
        } catch (err) {
            setError(err.message || 'Failed to save settings')
        } finally {
            setSaving(false)
        }
    }

    const updateSetting = (key, value) => {
        setSettings(prev => ({ ...prev, [key]: value }))
    }

    const handleLogoUpload = (e, type) => {
        const file = e.target.files[0]
        if (!file) return

        // Validate file type
        if (!file.type.startsWith('image/')) {
            setError('Please select an image file')
            return
        }

        // Validate file size (500KB max)
        if (file.size > MAX_FILE_SIZE) {
            setError(`Image size must be less than 500KB. Current size: ${(file.size / 1024).toFixed(1)}KB`)
            return
        }

        const reader = new FileReader()
        reader.onload = (event) => {
            const base64 = event.target.result
            updateSetting(type === 'frontend' ? 'frontendLogo' : 'backendLogo', base64)
            setSuccess(`${type === 'frontend' ? 'Frontend' : 'Backend'} logo uploaded successfully!`)
            setTimeout(() => setSuccess(null), 2000)
        }
        reader.onerror = () => {
            setError('Failed to read image file')
        }
        reader.readAsDataURL(file)
    }

    const removeLogo = (type) => {
        updateSetting(type === 'frontend' ? 'frontendLogo' : 'backendLogo', '')
    }

    const handleFaviconUpload = (e) => {
        const file = e.target.files[0]
        if (!file) return

        // Validate file type - favicons should be ICO, PNG, or SVG
        const validTypes = ['image/x-icon', 'image/vnd.microsoft.icon', 'image/png', 'image/svg+xml', 'image/ico']
        if (!file.type.startsWith('image/')) {
            setError('Please select an image file (ICO, PNG recommended)')
            return
        }

        // Validate file size (100KB max for favicon)
        if (file.size > MAX_FAVICON_SIZE) {
            setError(`Favicon size must be less than 100KB. Current size: ${(file.size / 1024).toFixed(1)}KB`)
            return
        }

        const reader = new FileReader()
        reader.onload = (event) => {
            const base64 = event.target.result
            updateSetting('favicon', base64)
            setSuccess('Favicon uploaded successfully!')
            setTimeout(() => setSuccess(null), 2000)
        }
        reader.onerror = () => {
            setError('Failed to read favicon file')
        }
        reader.readAsDataURL(file)
    }

    const removeFavicon = () => {
        updateSetting('favicon', '')
    }

    if (loading) {
        return (
            <div className="settings-page">
                <div className="settings-loading">
                    <div className="loading-spinner">
                        <Loader2 className="animate-spin" size={40} />
                    </div>
                    <p>Loading system settings...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="settings-page">
            {/* Header */}
            <div className="settings-header">
                <div className="header-content">
                    <div className="header-icon">
                        <Settings size={28} />
                    </div>
                    <div>
                        <h1>System Settings</h1>
                        <p>Configure platform pricing, security, and notifications</p>
                    </div>
                </div>
                <button className="save-btn" onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                    {saving ? 'Saving...' : 'Save All Changes'}
                </button>
            </div>

            {/* Alerts */}
            {error && (
                <div className="alert alert-error">
                    <AlertCircle size={18} />
                    <span>{error}</span>
                    <button onClick={() => setError(null)}><X size={16} /></button>
                </div>
            )}

            {success && (
                <div className="alert alert-success">
                    <CheckCircle2 size={18} />
                    <span>{success}</span>
                    <button onClick={() => setSuccess(null)}><X size={16} /></button>
                </div>
            )}

            {/* Main Layout */}
            <div className="settings-layout">
                {/* Sidebar Navigation */}
                <aside className="settings-nav">
                    <div className="nav-title">Configuration</div>
                    {sections.map(section => (
                        <button
                            key={section.id}
                            className={`nav-item ${activeSection === section.id ? 'active' : ''}`}
                            onClick={() => setActiveSection(section.id)}
                        >
                            <div className="nav-icon" style={{ background: `${section.color}15`, color: section.color }}>
                                <section.icon size={18} />
                            </div>
                            <span>{section.label}</span>
                            {activeSection === section.id && <div className="nav-indicator" style={{ background: section.color }} />}
                        </button>
                    ))}
                </aside>

                {/* Content Area */}
                <main className="settings-content">
                    {/* Billing Mode Section */}
                    {activeSection === 'billing' && (
                        <div className="section-content animate-in">
                            <div className="section-header">
                                <div className="section-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                                    <CreditCard size={24} />
                                </div>
                                <div>
                                    <h2>Billing Mode</h2>
                                    <p>Choose how bot messages are charged to users</p>
                                </div>
                            </div>

                            <div className="config-card highlight">
                                <div className="card-header">
                                    <Zap size={20} />
                                    <h3>Global Billing System</h3>
                                </div>
                                <p className="card-desc">This setting applies to all users. Choose between credit-based or dollar-based charging.</p>

                                <div className="billing-mode-selector">
                                    <button
                                        className={`billing-mode-btn ${billingMode === 'CREDITS' ? 'active credits' : ''}`}
                                        onClick={() => handleBillingModeChange('CREDITS')}
                                        disabled={billingLoading || billingMode === 'CREDITS'}
                                    >
                                        <div className="mode-icon">
                                            <MessageSquare size={24} />
                                        </div>
                                        <div className="mode-info">
                                            <span className="mode-title">Credits Mode</span>
                                            <span className="mode-desc">1 credit = 1 message</span>
                                        </div>
                                        {billingMode === 'CREDITS' && <CheckCircle2 size={20} className="mode-check" />}
                                    </button>

                                    <button
                                        className={`billing-mode-btn ${billingMode === 'DOLLARS' ? 'active dollars' : ''}`}
                                        onClick={() => handleBillingModeChange('DOLLARS')}
                                        disabled={billingLoading || billingMode === 'DOLLARS'}
                                    >
                                        <div className="mode-icon">
                                            <DollarSign size={24} />
                                        </div>
                                        <div className="mode-info">
                                            <span className="mode-title">Dollar Mode</span>
                                            <span className="mode-desc">$ per message rate</span>
                                        </div>
                                        {billingMode === 'DOLLARS' && <CheckCircle2 size={20} className="mode-check" />}
                                    </button>
                                </div>

                                {billingLoading && (
                                    <div className="billing-loading">
                                        <Loader2 className="animate-spin" size={18} />
                                        <span>Changing billing mode...</span>
                                    </div>
                                )}

                                <div className="billing-mode-info">
                                    {billingMode === 'CREDITS' ? (
                                        <div className="mode-active-info credits">
                                            <MessageSquare size={18} />
                                            <div>
                                                <strong>Credits Mode Active</strong>
                                                <p>Users pay 1 credit per bot message. Users can convert their dollar balance to credits.</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="mode-active-info dollars">
                                            <DollarSign size={18} />
                                            <div>
                                                <strong>Dollar Mode Active</strong>
                                                <p>Users pay per-message rates from their dollar balance. Rates configured in Pricing section.</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Pricing Section */}
                    {activeSection === 'pricing' && (
                        <div className="section-content animate-in">
                            <div className="section-header">
                                <div className="section-icon" style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e' }}>
                                    <DollarSign size={24} />
                                </div>
                                <div>
                                    <h2>Pricing & Rates</h2>
                                    <p>Configure message rates and login fees</p>
                                </div>
                            </div>

                            {/* Message Rates Card */}
                            <div className="config-card">
                                <div className="card-header">
                                    <MessageSquare size={20} />
                                    <h3>Message Rates</h3>
                                </div>
                                <p className="card-desc">Set the credit cost for each message type</p>

                                <div className="input-grid">
                                    <div className="input-group">
                                        <label>
                                            <Smartphone size={14} />
                                            WhatsApp Rate
                                        </label>
                                        <div className="input-with-prefix">
                                            <span className="prefix">$</span>
                                            <input
                                                type="number"
                                                value={settings.creditPerMessageWa}
                                                onChange={(e) => updateSetting('creditPerMessageWa', parseFloat(e.target.value))}
                                                step="0.001"
                                                min="0"
                                            />
                                        </div>
                                        <span className="input-hint">Per message</span>
                                    </div>

                                    <div className="input-group">
                                        <label>
                                            <Zap size={14} />
                                            Telegram Rate
                                        </label>
                                        <div className="input-with-prefix">
                                            <span className="prefix">$</span>
                                            <input
                                                type="number"
                                                value={settings.creditPerMessageTg}
                                                onChange={(e) => updateSetting('creditPerMessageTg', parseFloat(e.target.value))}
                                                step="0.001"
                                                min="0"
                                            />
                                        </div>
                                        <span className="input-hint">Per message</span>
                                    </div>

                                    <div className="input-group">
                                        <label>
                                            <Users size={14} />
                                            Group Rate
                                        </label>
                                        <div className="input-with-prefix">
                                            <span className="prefix">$</span>
                                            <input
                                                type="number"
                                                value={settings.creditPerGroupMessage}
                                                onChange={(e) => updateSetting('creditPerGroupMessage', parseFloat(e.target.value))}
                                                step="0.001"
                                                min="0"
                                            />
                                        </div>
                                        <span className="input-hint">Per group message</span>
                                    </div>
                                </div>
                            </div>

                            {/* Login Fees Card */}
                            <div className="config-card">
                                <div className="card-header">
                                    <CreditCard size={20} />
                                    <h3>Connection Fees</h3>
                                </div>
                                <p className="card-desc">One-time fees when users connect their accounts</p>

                                <div className="input-grid cols-2">
                                    <div className="input-group">
                                        <label>WhatsApp Login Fee</label>
                                        <div className="input-with-prefix">
                                            <span className="prefix">$</span>
                                            <input
                                                type="number"
                                                value={settings.waLoginFee}
                                                onChange={(e) => updateSetting('waLoginFee', parseFloat(e.target.value))}
                                                step="0.01"
                                                min="0"
                                            />
                                        </div>
                                    </div>

                                    <div className="input-group">
                                        <label>Telegram Login Fee</label>
                                        <div className="input-with-prefix">
                                            <span className="prefix">$</span>
                                            <input
                                                type="number"
                                                value={settings.tgLoginFee}
                                                onChange={(e) => updateSetting('tgLoginFee', parseFloat(e.target.value))}
                                                step="0.01"
                                                min="0"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Default Credit Card */}
                            <div className="config-card highlight">
                                <div className="card-header">
                                    <DollarSign size={20} />
                                    <h3>New User Credit</h3>
                                </div>
                                <p className="card-desc">Initial credit balance for newly registered users</p>

                                <div className="input-group large">
                                    <div className="input-with-prefix">
                                        <span className="prefix">$</span>
                                        <input
                                            type="number"
                                            value={settings.defaultUserCredit}
                                            onChange={(e) => updateSetting('defaultUserCredit', parseFloat(e.target.value))}
                                            step="0.01"
                                            min="0"
                                            placeholder="0.00"
                                        />
                                    </div>
                                    <span className="input-hint">Set to 0 to disable welcome credits</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Platform Section */}
                    {activeSection === 'platform' && (
                        <div className="section-content animate-in">
                            <div className="section-header">
                                <div className="section-icon" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                                    <Globe size={24} />
                                </div>
                                <div>
                                    <h2>Platform Settings</h2>
                                    <p>Configure your platform identity and contact information</p>
                                </div>
                            </div>

                            <div className="config-card">
                                <div className="card-header">
                                    <Database size={20} />
                                    <h3>Platform Identity</h3>
                                </div>

                                <div className="input-group">
                                    <label>Platform Name</label>
                                    <input
                                        type="text"
                                        className="full-input"
                                        value={settings.platformName}
                                        onChange={(e) => updateSetting('platformName', e.target.value)}
                                        placeholder="Your Platform Name"
                                    />
                                    <span className="input-hint">Displayed throughout the application</span>
                                </div>
                            </div>

                            <div className="config-card">
                                <div className="card-header">
                                    <Mail size={20} />
                                    <h3>Support Contact</h3>
                                </div>
                                <p className="card-desc">Contact information for user support</p>

                                <div className="input-grid cols-2">
                                    <div className="input-group">
                                        <label>Support Email</label>
                                        <input
                                            type="email"
                                            className="full-input"
                                            value={settings.supportEmail}
                                            onChange={(e) => updateSetting('supportEmail', e.target.value)}
                                            placeholder="support@example.com"
                                        />
                                    </div>

                                    <div className="input-group">
                                        <label>Support WhatsApp</label>
                                        <input
                                            type="text"
                                            className="full-input"
                                            value={settings.supportWhatsapp}
                                            onChange={(e) => updateSetting('supportWhatsapp', e.target.value)}
                                            placeholder="+62812345678"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Logo Branding */}
                            <div className="config-card">
                                <div className="card-header">
                                    <Image size={20} />
                                    <h3>Logo Branding</h3>
                                </div>
                                <p className="card-desc">Upload logos for frontend and backend (max 500KB, PNG/JPG with transparent background recommended)</p>

                                <div className="logo-grid">
                                    {/* Frontend Logo */}
                                    <div className="logo-upload-box">
                                        <label>Frontend Logo</label>
                                        <div className="logo-preview">
                                            {settings.frontendLogo ? (
                                                <>
                                                    <img src={settings.frontendLogo} alt="Frontend Logo" />
                                                    <button
                                                        className="logo-remove-btn"
                                                        onClick={() => removeLogo('frontend')}
                                                        title="Remove logo"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </>
                                            ) : (
                                                <div className="logo-placeholder">
                                                    <Image size={32} />
                                                    <span>No logo</span>
                                                </div>
                                            )}
                                        </div>
                                        <input
                                            type="file"
                                            ref={frontendLogoRef}
                                            accept="image/*"
                                            onChange={(e) => handleLogoUpload(e, 'frontend')}
                                            style={{ display: 'none' }}
                                        />
                                        <button
                                            className="logo-upload-btn"
                                            onClick={() => frontendLogoRef.current?.click()}
                                        >
                                            <Upload size={16} />
                                            Upload Logo
                                        </button>
                                        <span className="input-hint">Displayed on login page & sidebar</span>
                                        <span className="input-hint ratio-hint">📐 Best: Square 1:1 (e.g. 200x200px) • Sidebar displays at 44x44px</span>
                                    </div>

                                    {/* Backend Logo */}
                                    <div className="logo-upload-box">
                                        <label>Backend Logo</label>
                                        <div className="logo-preview">
                                            {settings.backendLogo ? (
                                                <>
                                                    <img src={settings.backendLogo} alt="Backend Logo" />
                                                    <button
                                                        className="logo-remove-btn"
                                                        onClick={() => removeLogo('backend')}
                                                        title="Remove logo"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </>
                                            ) : (
                                                <div className="logo-placeholder">
                                                    <Image size={32} />
                                                    <span>No logo</span>
                                                </div>
                                            )}
                                        </div>
                                        <input
                                            type="file"
                                            ref={backendLogoRef}
                                            accept="image/*"
                                            onChange={(e) => handleLogoUpload(e, 'backend')}
                                            style={{ display: 'none' }}
                                        />
                                        <button
                                            className="logo-upload-btn"
                                            onClick={() => backendLogoRef.current?.click()}
                                        >
                                            <Upload size={16} />
                                            Upload Logo
                                        </button>
                                        <span className="input-hint">Displayed on admin panel & emails</span>
                                        <span className="input-hint ratio-hint">📐 Best: Square 1:1 (200x200px) or Horizontal 3:1 (300x100px)</span>
                                    </div>

                                    {/* Favicon */}
                                    <div className="logo-upload-box favicon-box">
                                        <label>Favicon</label>
                                        <div className="logo-preview favicon-preview">
                                            {settings.favicon ? (
                                                <>
                                                    <img src={settings.favicon} alt="Favicon" />
                                                    <button
                                                        className="logo-remove-btn"
                                                        onClick={removeFavicon}
                                                        title="Remove favicon"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </>
                                            ) : (
                                                <div className="logo-placeholder">
                                                    <Image size={24} />
                                                    <span>No favicon</span>
                                                </div>
                                            )}
                                        </div>
                                        <input
                                            type="file"
                                            ref={faviconRef}
                                            accept="image/x-icon,image/png,image/ico,.ico"
                                            onChange={handleFaviconUpload}
                                            style={{ display: 'none' }}
                                        />
                                        <button
                                            className="logo-upload-btn"
                                            onClick={() => faviconRef.current?.click()}
                                        >
                                            <Upload size={16} />
                                            Upload Favicon
                                        </button>
                                        <span className="input-hint">Browser tab icon (max 100KB)</span>
                                        <span className="input-hint ratio-hint">📐 Best: Square 1:1 • 32x32px or 64x64px (ICO/PNG)</span>
                                    </div>
                                </div>
                            </div>

                            <div className="config-card danger">
                                <div className="card-header">
                                    <Lock size={20} />
                                    <h3>Maintenance Mode</h3>
                                </div>
                                <p className="card-desc">Temporarily disable user access to the platform</p>

                                <div className="toggle-row">
                                    <label className="toggle-switch">
                                        <input
                                            type="checkbox"
                                            checked={settings.maintenanceMode}
                                            onChange={(e) => updateSetting('maintenanceMode', e.target.checked)}
                                        />
                                        <span className="toggle-slider"></span>
                                    </label>
                                    <div className="toggle-info">
                                        <span className={`status-text ${settings.maintenanceMode ? 'warning' : 'success'}`}>
                                            {settings.maintenanceMode ? '⚠️ Maintenance Mode Active' : '✓ Platform is Online'}
                                        </span>
                                        {settings.maintenanceMode && (
                                            <span className="status-desc">Non-admin users cannot access the platform</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Security Section */}
                    {activeSection === 'security' && (
                        <div className="section-content animate-in">
                            <div className="section-header">
                                <div className="section-icon" style={{ background: 'rgba(168, 85, 247, 0.1)', color: '#a855f7' }}>
                                    <Shield size={24} />
                                </div>
                                <div>
                                    <h2>Security Settings</h2>
                                    <p>Configure login and session security parameters</p>
                                </div>
                            </div>

                            <div className="config-card">
                                <div className="card-header">
                                    <Lock size={20} />
                                    <h3>Login Protection</h3>
                                </div>

                                <div className="input-grid cols-2">
                                    <div className="input-group">
                                        <label>Max Login Attempts</label>
                                        <input
                                            type="number"
                                            className="full-input"
                                            value={settings.maxLoginAttempts}
                                            onChange={(e) => updateSetting('maxLoginAttempts', parseInt(e.target.value))}
                                            min="1"
                                            max="10"
                                        />
                                        <span className="input-hint">Lock account after failed attempts</span>
                                    </div>

                                    <div className="input-group">
                                        <label>
                                            <Clock size={14} />
                                            Session Timeout
                                        </label>
                                        <div className="input-with-suffix">
                                            <input
                                                type="number"
                                                value={settings.sessionTimeout}
                                                onChange={(e) => updateSetting('sessionTimeout', parseInt(e.target.value))}
                                                min="1"
                                                max="720"
                                            />
                                            <span className="suffix">hours</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="config-card">
                                <div className="card-header">
                                    <Mail size={20} />
                                    <h3>Email Verification</h3>
                                </div>

                                <div className="toggle-row">
                                    <label className="toggle-switch">
                                        <input
                                            type="checkbox"
                                            checked={settings.requireEmailVerification}
                                            onChange={(e) => updateSetting('requireEmailVerification', e.target.checked)}
                                        />
                                        <span className="toggle-slider"></span>
                                    </label>
                                    <div className="toggle-info">
                                        <span className="toggle-label">Require Email Verification</span>
                                        <span className="toggle-desc">New users must verify their email before accessing features</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Notifications Section */}
                    {activeSection === 'notifications' && (
                        <div className="section-content animate-in">
                            <div className="section-header">
                                <div className="section-icon" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
                                    <Bell size={24} />
                                </div>
                                <div>
                                    <h2>Notification Settings</h2>
                                    <p>Configure alerts and automatic actions</p>
                                </div>
                            </div>

                            <div className="config-card">
                                <div className="card-header">
                                    <Mail size={20} />
                                    <h3>Email Notifications</h3>
                                </div>

                                <div className="toggle-row">
                                    <label className="toggle-switch">
                                        <input
                                            type="checkbox"
                                            checked={settings.emailNotifications}
                                            onChange={(e) => updateSetting('emailNotifications', e.target.checked)}
                                        />
                                        <span className="toggle-slider"></span>
                                    </label>
                                    <div className="toggle-info">
                                        <span className="toggle-label">Enable Email Notifications</span>
                                        <span className="toggle-desc">Send email alerts for important events</span>
                                    </div>
                                </div>
                            </div>

                            <div className="config-card">
                                <div className="card-header">
                                    <CreditCard size={20} />
                                    <h3>Balance Alerts</h3>
                                </div>
                                <p className="card-desc">Warn users when their balance is running low</p>

                                <div className="input-group large">
                                    <label>Low Balance Threshold</label>
                                    <div className="input-with-prefix">
                                        <span className="prefix">$</span>
                                        <input
                                            type="number"
                                            value={settings.lowBalanceThreshold}
                                            onChange={(e) => updateSetting('lowBalanceThreshold', parseFloat(e.target.value))}
                                            step="0.01"
                                            min="0"
                                        />
                                    </div>
                                    <span className="input-hint">Show warning when balance falls below this amount</span>
                                </div>

                                <div className="toggle-row mt-lg">
                                    <label className="toggle-switch">
                                        <input
                                            type="checkbox"
                                            checked={settings.autoSuspendOnZeroBalance}
                                            onChange={(e) => updateSetting('autoSuspendOnZeroBalance', e.target.checked)}
                                        />
                                        <span className="toggle-slider"></span>
                                    </label>
                                    <div className="toggle-info">
                                        <span className={`toggle-label ${settings.autoSuspendOnZeroBalance ? 'warning' : ''}`}>
                                            Auto-Suspend on Zero Balance
                                        </span>
                                        <span className="toggle-desc">Automatically suspend users when balance reaches $0</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </main>
            </div>

            <style>{`
                .settings-page {
                    padding: var(--spacing-lg);
                    max-width: 1400px;
                    margin: 0 auto;
                }

                /* Billing Mode Styles */
                .billing-mode-selector {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: var(--spacing-md);
                    margin: var(--spacing-lg) 0;
                }

                .billing-mode-btn {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-md);
                    padding: var(--spacing-lg);
                    background: var(--bg-tertiary);
                    border: 2px solid var(--border-color);
                    border-radius: var(--radius-lg);
                    cursor: pointer;
                    transition: all 0.2s ease;
                    text-align: left;
                }

                .billing-mode-btn:hover:not(:disabled) {
                    border-color: var(--primary-500);
                    background: var(--bg-secondary);
                }

                .billing-mode-btn:disabled {
                    cursor: default;
                }

                .billing-mode-btn.active.credits {
                    border-color: #10b981;
                    background: rgba(16, 185, 129, 0.1);
                }

                .billing-mode-btn.active.dollars {
                    border-color: #3b82f6;
                    background: rgba(59, 130, 246, 0.1);
                }

                .billing-mode-btn .mode-icon {
                    width: 48px;
                    height: 48px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: var(--bg-secondary);
                    border-radius: var(--radius-md);
                    color: var(--text-secondary);
                }

                .billing-mode-btn.active.credits .mode-icon {
                    background: rgba(16, 185, 129, 0.2);
                    color: #10b981;
                }

                .billing-mode-btn.active.dollars .mode-icon {
                    background: rgba(59, 130, 246, 0.2);
                    color: #3b82f6;
                }

                .billing-mode-btn .mode-info {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }

                .billing-mode-btn .mode-title {
                    font-weight: 600;
                    color: var(--text-primary);
                    font-size: 1rem;
                }

                .billing-mode-btn .mode-desc {
                    font-size: 0.875rem;
                    color: var(--text-secondary);
                }

                .billing-mode-btn .mode-check {
                    color: #10b981;
                }

                .billing-mode-btn.active.dollars .mode-check {
                    color: #3b82f6;
                }

                .billing-loading {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    color: var(--text-secondary);
                    padding: var(--spacing-md);
                }

                .billing-mode-info {
                    margin-top: var(--spacing-md);
                }

                .mode-active-info {
                    display: flex;
                    align-items: flex-start;
                    gap: var(--spacing-md);
                    padding: var(--spacing-md);
                    border-radius: var(--radius-md);
                }

                .mode-active-info.credits {
                    background: rgba(16, 185, 129, 0.1);
                    border: 1px solid rgba(16, 185, 129, 0.3);
                    color: #10b981;
                }

                .mode-active-info.dollars {
                    background: rgba(59, 130, 246, 0.1);
                    border: 1px solid rgba(59, 130, 246, 0.3);
                    color: #3b82f6;
                }

                .mode-active-info strong {
                    display: block;
                    margin-bottom: 4px;
                }

                .mode-active-info p {
                    font-size: 0.875rem;
                    opacity: 0.9;
                    margin: 0;
                }

                @media (max-width: 600px) {
                    .billing-mode-selector {
                        grid-template-columns: 1fr;
                    }
                }

                .settings-loading {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    min-height: 400px;
                    gap: var(--spacing-md);
                    color: var(--text-secondary);
                }

                .loading-spinner {
                    width: 64px;
                    height: 64px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: linear-gradient(135deg, var(--primary-500), var(--primary-600));
                    border-radius: 16px;
                    color: white;
                }

                /* Header */
                .settings-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: var(--spacing-lg);
                    flex-wrap: wrap;
                    gap: var(--spacing-md);
                }

                .header-content {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-md);
                }

                .header-icon {
                    width: 56px;
                    height: 56px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: linear-gradient(135deg, var(--primary-500), var(--primary-600));
                    border-radius: 14px;
                    color: white;
                }

                .header-content h1 {
                    margin: 0;
                    font-size: 1.75rem;
                    font-weight: 600;
                }

                .header-content p {
                    margin: var(--spacing-xs) 0 0;
                    color: var(--text-secondary);
                }

                .save-btn {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-sm) var(--spacing-xl);
                    background: linear-gradient(135deg, var(--primary-500), var(--primary-600));
                    color: white;
                    border: none;
                    border-radius: var(--radius-md);
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .save-btn:hover:not(:disabled) {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(124, 58, 237, 0.35);
                }

                .save-btn:disabled {
                    opacity: 0.7;
                    cursor: not-allowed;
                }

                /* Alerts */
                .alert {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-md) var(--spacing-lg);
                    border-radius: var(--radius-md);
                    margin-bottom: var(--spacing-lg);
                    animation: slideIn 0.3s ease;
                }

                @keyframes slideIn {
                    from { opacity: 0; transform: translateY(-10px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .alert-error {
                    background: rgba(239, 68, 68, 0.1);
                    border: 1px solid rgba(239, 68, 68, 0.3);
                    color: #ef4444;
                }

                .alert-success {
                    background: rgba(34, 197, 94, 0.1);
                    border: 1px solid rgba(34, 197, 94, 0.3);
                    color: #22c55e;
                }

                .alert button {
                    margin-left: auto;
                    background: none;
                    border: none;
                    cursor: pointer;
                    color: inherit;
                    opacity: 0.7;
                }

                .alert button:hover { opacity: 1; }

                /* Layout */
                .settings-layout {
                    display: grid;
                    grid-template-columns: 260px 1fr;
                    gap: var(--spacing-xl);
                }

                @media (max-width: 900px) {
                    .settings-layout {
                        grid-template-columns: 1fr;
                    }
                }

                /* Navigation */
                .settings-nav {
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-lg);
                    padding: var(--spacing-md);
                    height: fit-content;
                    position: sticky;
                    top: var(--spacing-lg);
                }

                .nav-title {
                    font-size: 0.75rem;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: var(--text-tertiary);
                    padding: var(--spacing-sm) var(--spacing-md);
                    margin-bottom: var(--spacing-xs);
                }

                .nav-item {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-md);
                    width: 100%;
                    padding: var(--spacing-md);
                    background: none;
                    border: none;
                    border-radius: var(--radius-md);
                    cursor: pointer;
                    color: var(--text-secondary);
                    text-align: left;
                    position: relative;
                    transition: all 0.2s;
                }

                .nav-item:hover {
                    background: var(--bg-tertiary);
                    color: var(--text-primary);
                }

                .nav-item.active {
                    background: var(--bg-tertiary);
                    color: var(--text-primary);
                    font-weight: 500;
                }

                .nav-icon {
                    width: 36px;
                    height: 36px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: var(--radius-md);
                    flex-shrink: 0;
                }

                .nav-indicator {
                    position: absolute;
                    right: 0;
                    top: 50%;
                    transform: translateY(-50%);
                    width: 3px;
                    height: 24px;
                    border-radius: 3px;
                }

                /* Content */
                .settings-content {
                    min-height: 500px;
                }

                .section-content {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-lg);
                }

                .section-content.animate-in {
                    animation: fadeIn 0.3s ease;
                }

                @keyframes fadeIn {
                    from { opacity: 0; transform: translateX(10px); }
                    to { opacity: 1; transform: translateX(0); }
                }

                .section-header {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-md);
                    padding-bottom: var(--spacing-lg);
                    border-bottom: 1px solid var(--border-color);
                }

                .section-icon {
                    width: 48px;
                    height: 48px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 12px;
                }

                .section-header h2 {
                    margin: 0;
                    font-size: 1.25rem;
                }

                .section-header p {
                    margin: 4px 0 0;
                    color: var(--text-secondary);
                    font-size: 0.875rem;
                }

                /* Config Cards */
                .config-card {
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-lg);
                    padding: var(--spacing-xl);
                    transition: all 0.2s;
                }

                .config-card:hover {
                    border-color: var(--primary-500);
                }

                .config-card.highlight {
                    background: linear-gradient(135deg, rgba(34, 197, 94, 0.05), rgba(34, 197, 94, 0.02));
                    border-color: rgba(34, 197, 94, 0.3);
                }

                .config-card.danger {
                    background: linear-gradient(135deg, rgba(239, 68, 68, 0.05), rgba(239, 68, 68, 0.02));
                    border-color: rgba(239, 68, 68, 0.2);
                }

                .card-header {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    color: var(--text-primary);
                    margin-bottom: var(--spacing-xs);
                }

                .card-header h3 {
                    margin: 0;
                    font-size: 1rem;
                    font-weight: 600;
                }

                .card-desc {
                    color: var(--text-secondary);
                    font-size: 0.875rem;
                    margin: 0 0 var(--spacing-lg);
                }

                /* Input Grid */
                .input-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: var(--spacing-lg);
                }

                .input-grid.cols-2 {
                    grid-template-columns: repeat(2, 1fr);
                }

                @media (max-width: 768px) {
                    .input-grid, .input-grid.cols-2 {
                        grid-template-columns: 1fr;
                    }
                }

                /* Input Groups */
                .input-group {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-xs);
                }

                .input-group.large {
                    max-width: 300px;
                }

                .input-group label {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-xs);
                    font-size: 0.875rem;
                    font-weight: 500;
                    color: var(--text-secondary);
                }

                .input-with-prefix, .input-with-suffix {
                    display: flex;
                    align-items: center;
                    background: var(--bg-tertiary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-md);
                    overflow: hidden;
                    transition: all 0.2s;
                }

                .input-with-prefix:focus-within,
                .input-with-suffix:focus-within {
                    border-color: var(--primary-500);
                    box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.1);
                }

                .prefix, .suffix {
                    padding: 0 var(--spacing-md);
                    color: var(--text-tertiary);
                    font-weight: 500;
                    background: var(--bg-secondary);
                    height: 42px;
                    display: flex;
                    align-items: center;
                }

                .input-with-prefix input,
                .input-with-suffix input {
                    flex: 1;
                    padding: var(--spacing-sm) var(--spacing-md);
                    border: none;
                    background: transparent;
                    color: var(--text-primary);
                    font-size: 0.95rem;
                    outline: none;
                }

                .full-input {
                    width: 100%;
                    padding: var(--spacing-sm) var(--spacing-md);
                    background: var(--bg-tertiary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-md);
                    color: var(--text-primary);
                    font-size: 0.95rem;
                    transition: all 0.2s;
                }

                .full-input:focus {
                    outline: none;
                    border-color: var(--primary-500);
                    box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.1);
                }

                .input-hint {
                    font-size: 0.75rem;
                    color: var(--text-tertiary);
                }

                .input-hint.ratio-hint {
                    display: block;
                    margin-top: 4px;
                    padding: 6px 10px;
                    background: rgba(59, 130, 246, 0.08);
                    border-left: 3px solid #3b82f6;
                    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
                    color: #3b82f6;
                    font-size: 0.7rem;
                }

                /* Toggle Switch */
                .toggle-row {
                    display: flex;
                    align-items: flex-start;
                    gap: var(--spacing-md);
                }

                .toggle-row.mt-lg {
                    margin-top: var(--spacing-xl);
                    padding-top: var(--spacing-lg);
                    border-top: 1px solid var(--border-color);
                }

                .toggle-switch {
                    position: relative;
                    display: inline-block;
                    width: 50px;
                    height: 26px;
                    flex-shrink: 0;
                }

                .toggle-switch input {
                    opacity: 0;
                    width: 0;
                    height: 0;
                }

                .toggle-slider {
                    position: absolute;
                    cursor: pointer;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: var(--bg-tertiary);
                    border: 2px solid var(--border-color);
                    border-radius: 26px;
                    transition: all 0.3s;
                }

                .toggle-slider::before {
                    position: absolute;
                    content: "";
                    height: 18px;
                    width: 18px;
                    left: 2px;
                    bottom: 2px;
                    background: white;
                    border-radius: 50%;
                    transition: all 0.3s;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                }

                .toggle-switch input:checked + .toggle-slider {
                    background: var(--primary-500);
                    border-color: var(--primary-500);
                }

                .toggle-switch input:checked + .toggle-slider::before {
                    transform: translateX(24px);
                }

                .toggle-info {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }

                .toggle-label {
                    font-weight: 500;
                    color: var(--text-primary);
                }

                .toggle-label.warning {
                    color: #f59e0b;
                }

                .toggle-desc {
                    font-size: 0.875rem;
                    color: var(--text-tertiary);
                }

                .status-text {
                    font-weight: 500;
                }

                .status-text.success {
                    color: #22c55e;
                }

                .status-text.warning {
                    color: #f59e0b;
                }

                .status-desc {
                    font-size: 0.875rem;
                    color: var(--text-tertiary);
                }

                /* Logo Upload Styles */
                .logo-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: var(--spacing-xl);
                    margin-top: var(--spacing-md);
                }

                @media (max-width: 768px) {
                    .logo-grid {
                        grid-template-columns: 1fr;
                    }
                }

                .logo-upload-box {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-sm);
                }

                .logo-upload-box label {
                    font-weight: 500;
                    color: var(--text-secondary);
                }

                .logo-preview {
                    width: 100%;
                    height: 120px;
                    background: var(--bg-tertiary);
                    border: 2px dashed var(--border-color);
                    border-radius: var(--radius-lg);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    position: relative;
                    overflow: hidden;
                }

                .logo-preview img {
                    max-width: 100%;
                    max-height: 100%;
                    object-fit: contain;
                    padding: var(--spacing-sm);
                }

                .logo-placeholder {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: var(--spacing-xs);
                    color: var(--text-tertiary);
                }

                .logo-placeholder span {
                    font-size: 0.75rem;
                }

                .logo-remove-btn {
                    position: absolute;
                    top: 8px;
                    right: 8px;
                    width: 28px;
                    height: 28px;
                    border-radius: 50%;
                    background: rgba(239, 68, 68, 0.9);
                    color: white;
                    border: none;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    opacity: 0;
                    transition: opacity 0.2s;
                }

                .logo-preview:hover .logo-remove-btn {
                    opacity: 1;
                }

                .logo-remove-btn:hover {
                    background: #ef4444;
                }

                .logo-upload-btn {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-sm) var(--spacing-md);
                    background: var(--bg-tertiary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-md);
                    color: var(--text-primary);
                    font-size: 0.875rem;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .logo-upload-btn:hover {
                    background: var(--primary-500);
                    border-color: var(--primary-500);
                    color: white;
                }

                /* Favicon specific styles */
                .favicon-box {
                    max-width: 200px;
                }

                .favicon-preview {
                    height: 80px;
                    width: 80px;
                }

                .favicon-preview img {
                    max-width: 48px;
                    max-height: 48px;
                }
            `}</style>
        </div>
    )
}
