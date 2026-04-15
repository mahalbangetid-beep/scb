import { useState, useEffect } from 'react'
import {
    DollarSign, Save, Loader2, AlertCircle, CheckCircle2,
    MessageSquare, Smartphone, Bot, Globe, CreditCard,
    Zap, Package, RefreshCw,
    SendHorizontal, Users, Shield, Tag,
    ToggleLeft, ToggleRight, ArrowRightLeft, Bell,
    ChevronDown, ChevronUp, Search, Filter, Clock, BarChart3
} from 'lucide-react'
import api from '../../services/api'

export default function DefaultCharges() {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState(null)
    const [success, setSuccess] = useState(null)
    const [hasChanges, setHasChanges] = useState(false)

    // Charges state
    const [charges, setCharges] = useState({
        messageRates: { wa_message_rate: 0.01, tg_message_rate: 0.01, group_message_rate: 0.02 },
        loginFees: { wa_login_fee: 5.00, tg_login_fee: 5.00 },
        subscriptionFees: { DEVICE: 5.00, TELEGRAM_BOT: 3.00, SMM_PANEL: 2.00 },
        creditPackages: [],
        messageTypeRates: {},
        other: { low_balance_threshold: 5.00, low_credit_notify_enabled: true, low_credit_notify_threshold: 50, default_user_credit: 0, free_signup_credits: 100, free_signup_support_credits: 100, free_signup_whatsapp_credits: 0, free_signup_telegram_credits: 0 }
    })

    // Message type labels for UI display
    const MESSAGE_TYPE_LABELS = {
        wa_forward_message:      { label: 'Forward Message (WhatsApp)', note: 'Bot forwards message to another number/group', platform: 'wa' },
        wa_user_sends:           { label: 'User Sends Message', note: 'Incoming message from user (no charge)', platform: 'wa' },
        wa_keyword_response:     { label: 'Keyword Response', note: 'Bot auto-replies to a keyword trigger', platform: 'wa' },
        wa_status_update:        { label: 'AI Status Update Message', note: 'Bot sends order status update to user', platform: 'wa' },
        wa_system_message:       { label: 'System Message', note: 'Covers: .help, .group, .list, commands, etc.', platform: 'wa' },
        wa_general_response:     { label: 'General Response', note: 'Utility/general bot replies', platform: 'wa' },
        wa_payment_notification: { label: 'Payment Notification', note: 'Fund added/deducted notification to user', platform: 'wa' },
        wa_ticket_reply:         { label: 'Ticket Reply', note: 'Auto ticket response', platform: 'wa' },
        wa_register_confirm:     { label: 'Username Register Confirmation', note: 'Bot confirms user registration', platform: 'wa' },
        wa_security_text:        { label: 'Security Access Text', note: '2FA or access control messages', platform: 'wa' },
        wa_fonepay_verification: { label: 'Fonepay Verification Message', note: 'Transaction verification dialogue', platform: 'wa' },
        tg_keyword_response:     { label: 'Telegram Keyword Response', note: 'Same as WhatsApp but via Telegram', platform: 'tg' },
        tg_system_message:       { label: 'Telegram System Message', note: 'Telegram equivalent of system messages', platform: 'tg' },
        tg_forward:              { label: 'Telegram Forward', note: 'Forwarding via Telegram channel/group', platform: 'tg' },
        bulk_marketing:          { label: 'Bulk / Marketing Message', note: 'Set separately in broadcast settings', platform: 'other' },
    }

    // Original charges for diff checking
    const [originalCharges, setOriginalCharges] = useState(null)

    // Credit Deduction Log (Section 2.1)
    const [logExpanded, setLogExpanded] = useState(false)
    const [logLoading, setLogLoading] = useState(false)
    const [logData, setLogData] = useState({ transactions: [], summary: { totalDeducted: 0, totalTransactions: 0 } })
    const [logPagination, setLogPagination] = useState({ page: 1, total: 0, totalPages: 0 })
    const [logFilter, setLogFilter] = useState({ type: 'all', search: '', from: '', to: '' })
    const [summaryData, setSummaryData] = useState(null)
    const [summaryLoading, setSummaryLoading] = useState(false)

    useEffect(() => {
        fetchCharges()
    }, [])

    useEffect(() => {
        if (success || error) {
            const timer = setTimeout(() => { setSuccess(null); setError(null) }, 4000)
            return () => clearTimeout(timer)
        }
    }, [success, error])

    // Fetch deduction log when expanded or filter changes
    useEffect(() => {
        if (logExpanded) {
            fetchDeductionLog()
            fetchDeductionSummary()
        }
    }, [logExpanded, logFilter.type, logPagination.page])

    const fetchDeductionLog = async (pageOverride) => {
        try {
            setLogLoading(true)
            const p = pageOverride || logPagination.page
            const params = new URLSearchParams({ page: p, limit: 20 })
            if (logFilter.type && logFilter.type !== 'all') params.append('type', logFilter.type)
            if (logFilter.search) params.append('search', logFilter.search)
            if (logFilter.from) params.append('from', logFilter.from)
            if (logFilter.to) params.append('to', logFilter.to)

            const res = await api.get(`/admin/credit-deduction-log?${params.toString()}`)
            const data = res.data || res
            setLogData(data.data || data)
            if (data.pagination) {
                setLogPagination(prev => ({ ...prev, total: data.pagination.total, totalPages: data.pagination.totalPages }))
            }
        } catch (err) {
            console.error('Failed to fetch deduction log:', err)
        } finally {
            setLogLoading(false)
        }
    }

    const fetchDeductionSummary = async () => {
        try {
            setSummaryLoading(true)
            const params = new URLSearchParams()
            if (logFilter.from) params.append('from', logFilter.from)
            if (logFilter.to) params.append('to', logFilter.to)

            const res = await api.get(`/admin/credit-deduction-summary?${params.toString()}`)
            const data = res.data || res
            setSummaryData(data)
        } catch (err) {
            console.error('Failed to fetch deduction summary:', err)
        } finally {
            setSummaryLoading(false)
        }
    }

    const fetchCharges = async () => {
        try {
            setLoading(true)
            const res = await api.get('/admin/charges')
            const data = res.data || res
            setCharges(data)
            setOriginalCharges(JSON.parse(JSON.stringify(data)))
            setHasChanges(false)
        } catch (err) {
            setError('Failed to load charges: ' + (err.response?.data?.message || err.message))
        } finally {
            setLoading(false)
        }
    }

    const updateField = (section, key, value) => {
        setCharges(prev => ({
            ...prev,
            [section]: {
                ...prev[section],
                [key]: value
            }
        }))
        setHasChanges(true)
    }

    const handleSave = async () => {
        try {
            setSaving(true)
            setError(null)

            // Build payload with only changed sections
            const payload = {}
            if (JSON.stringify(charges.messageRates) !== JSON.stringify(originalCharges.messageRates)) {
                payload.messageRates = {}
                for (const [k, v] of Object.entries(charges.messageRates)) {
                    payload.messageRates[k] = parseFloat(v)
                }
            }
            if (JSON.stringify(charges.loginFees) !== JSON.stringify(originalCharges.loginFees)) {
                payload.loginFees = {}
                for (const [k, v] of Object.entries(charges.loginFees)) {
                    payload.loginFees[k] = parseFloat(v)
                }
            }
            if (JSON.stringify(charges.subscriptionFees) !== JSON.stringify(originalCharges.subscriptionFees)) {
                payload.subscriptionFees = {}
                for (const [k, v] of Object.entries(charges.subscriptionFees)) {
                    payload.subscriptionFees[k] = parseFloat(v)
                }
            }
            if (JSON.stringify(charges.other) !== JSON.stringify(originalCharges.other)) {
                payload.other = {}
                for (const [k, v] of Object.entries(charges.other)) {
                    // Preserve boolean values (e.g. low_credit_notify_enabled)
                    if (typeof v === 'boolean') {
                        payload.other[k] = v
                        continue
                    }
                    payload.other[k] = parseFloat(v)
                }
            }
            if (JSON.stringify(charges.messageTypeRates) !== JSON.stringify(originalCharges.messageTypeRates)) {
                payload.messageTypeRates = {}
                for (const [k, v] of Object.entries(charges.messageTypeRates)) {
                    payload.messageTypeRates[k] = { enabled: v.enabled !== false, rate: parseFloat(v.rate) || 0 }
                }
            }

            if (Object.keys(payload).length === 0) {
                setSuccess('No changes to save')
                setHasChanges(false)
                return
            }

            await api.put('/admin/charges', payload)
            setSuccess('All charges updated successfully!')
            setOriginalCharges(JSON.parse(JSON.stringify(charges)))
            setHasChanges(false)
        } catch (err) {
            setError('Failed to save: ' + (err.response?.data?.message || err.message))
        } finally {
            setSaving(false)
        }
    }

    const handleReset = () => {
        if (originalCharges) {
            setCharges(JSON.parse(JSON.stringify(originalCharges)))
            setHasChanges(false)
        }
    }

    if (loading) {
        return (
            <div className="dc-page">
                <div className="dc-loading">
                    <Loader2 className="dc-spinner" size={40} />
                    <p>Loading charges...</p>
                </div>
                <style>{styles}</style>
            </div>
        )
    }

    return (
        <div className="dc-page">
            {/* Header */}
            <div className="dc-header">
                <div className="dc-header-left">
                    <div className="dc-header-icon">
                        <DollarSign size={28} />
                    </div>
                    <div>
                        <h1>Default Charges</h1>
                        <p>Manage all platform pricing, rates, and fees in one place</p>
                    </div>
                </div>
                <div className="dc-header-actions">
                    {hasChanges && (
                        <button className="dc-btn dc-btn-ghost" onClick={handleReset}>
                            <RefreshCw size={16} /> Reset
                        </button>
                    )}
                    <button
                        className={`dc-btn dc-btn-save ${hasChanges ? 'has-changes' : ''}`}
                        onClick={handleSave}
                        disabled={saving || !hasChanges}
                    >
                        {saving ? <Loader2 className="dc-spinner" size={16} /> : <Save size={16} />}
                        {saving ? 'Saving...' : 'Save All Changes'}
                    </button>
                </div>
            </div>

            {/* Notifications */}
            {error && (
                <div className="dc-alert dc-alert-error">
                    <AlertCircle size={18} />
                    <span>{error}</span>
                </div>
            )}
            {success && (
                <div className="dc-alert dc-alert-success">
                    <CheckCircle2 size={18} />
                    <span>{success}</span>
                </div>
            )}

            {/* Quick Overview Cards */}
            <div className="dc-overview">
                <div className="dc-overview-card">
                    <div className="dc-overview-icon" style={{ background: 'linear-gradient(135deg, #25D366, #128C7E)' }}>
                        <MessageSquare size={20} />
                    </div>
                    <div className="dc-overview-info">
                        <span className="dc-overview-label">WA Message</span>
                        <span className="dc-overview-value">{parseFloat(charges.messageRates.wa_message_rate || 0)} cr/msg</span>
                    </div>
                </div>
                <div className="dc-overview-card">
                    <div className="dc-overview-icon" style={{ background: 'linear-gradient(135deg, #0088cc, #005580)' }}>
                        <SendHorizontal size={20} />
                    </div>
                    <div className="dc-overview-info">
                        <span className="dc-overview-label">TG Message</span>
                        <span className="dc-overview-value">{parseFloat(charges.messageRates.tg_message_rate || 0)} cr/msg</span>
                    </div>
                </div>
                <div className="dc-overview-card">
                    <div className="dc-overview-icon" style={{ background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)' }}>
                        <Users size={20} />
                    </div>
                    <div className="dc-overview-info">
                        <span className="dc-overview-label">Group Msg</span>
                        <span className="dc-overview-value">{parseFloat(charges.messageRates.group_message_rate || 0)} cr/msg</span>
                    </div>
                </div>
                <div className="dc-overview-card">
                    <div className="dc-overview-icon" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                        <Smartphone size={20} />
                    </div>
                    <div className="dc-overview-info">
                        <span className="dc-overview-label">Device Sub</span>
                        <span className="dc-overview-value">${parseFloat(charges.subscriptionFees.DEVICE || 0).toFixed(2)}/mo</span>
                    </div>
                </div>
            </div>

            {/* Main Grid */}
            <div className="dc-grid">
                {/* Message Rates Section */}
                <div className="dc-card">
                    <div className="dc-card-header">
                        <div className="dc-card-icon" style={{ background: 'linear-gradient(135deg, #25D366, #128C7E)' }}>
                            <MessageSquare size={20} />
                        </div>
                        <div>
                            <h3>Message Rates</h3>
                            <p>Per-message charges for each platform</p>
                        </div>
                    </div>
                    <div className="dc-card-body">
                        <div className="dc-field">
                            <label>
                                <Smartphone size={14} />
                                WhatsApp Message Rate
                            </label>
                            <div className="dc-input-group">
                                <span className="dc-input-prefix">🔢</span>
                                <input
                                    type="number"
                                    step="1"
                                    min="0"
                                    value={charges.messageRates.wa_message_rate}
                                    onChange={e => updateField('messageRates', 'wa_message_rate', e.target.value)}
                                />
                                <span className="dc-input-suffix">credits / msg</span>
                            </div>
                        </div>
                        <div className="dc-field">
                            <label>
                                <SendHorizontal size={14} />
                                Telegram Message Rate
                            </label>
                            <div className="dc-input-group">
                                <span className="dc-input-prefix">🔢</span>
                                <input
                                    type="number"
                                    step="1"
                                    min="0"
                                    value={charges.messageRates.tg_message_rate}
                                    onChange={e => updateField('messageRates', 'tg_message_rate', e.target.value)}
                                />
                                <span className="dc-input-suffix">credits / msg</span>
                            </div>
                        </div>
                        <div className="dc-field">
                            <label>
                                <Users size={14} />
                                Group Message Rate
                            </label>
                            <div className="dc-input-group">
                                <span className="dc-input-prefix">🔢</span>
                                <input
                                    type="number"
                                    step="1"
                                    min="0"
                                    value={charges.messageRates.group_message_rate}
                                    onChange={e => updateField('messageRates', 'group_message_rate', e.target.value)}
                                />
                                <span className="dc-input-suffix">credits / msg</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Login Fees Section */}
                <div className="dc-card">
                    <div className="dc-card-header">
                        <div className="dc-card-icon" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
                            <Shield size={20} />
                        </div>
                        <div>
                            <h3>Login / Connection Fees</h3>
                            <p>One-time fees when connecting devices</p>
                        </div>
                    </div>
                    <div className="dc-card-body">
                        <div className="dc-field">
                            <label>
                                <Smartphone size={14} />
                                WhatsApp Login Fee
                            </label>
                            <div className="dc-input-group">
                                <span className="dc-input-prefix">$</span>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={charges.loginFees.wa_login_fee}
                                    onChange={e => updateField('loginFees', 'wa_login_fee', e.target.value)}
                                />
                                <span className="dc-input-suffix">once</span>
                            </div>
                        </div>
                        <div className="dc-field">
                            <label>
                                <Bot size={14} />
                                Telegram Login Fee
                            </label>
                            <div className="dc-input-group">
                                <span className="dc-input-prefix">$</span>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={charges.loginFees.tg_login_fee}
                                    onChange={e => updateField('loginFees', 'tg_login_fee', e.target.value)}
                                />
                                <span className="dc-input-suffix">once</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Subscription Fees Section */}
                <div className="dc-card">
                    <div className="dc-card-header">
                        <div className="dc-card-icon" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                            <CreditCard size={20} />
                        </div>
                        <div>
                            <h3>Monthly Subscription Fees</h3>
                            <p>Recurring monthly charges per resource</p>
                        </div>
                    </div>
                    <div className="dc-card-body">
                        <div className="dc-field">
                            <label>
                                <Smartphone size={14} />
                                WhatsApp Device
                            </label>
                            <div className="dc-input-group">
                                <span className="dc-input-prefix">$</span>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={charges.subscriptionFees.DEVICE}
                                    onChange={e => updateField('subscriptionFees', 'DEVICE', e.target.value)}
                                />
                                <span className="dc-input-suffix">/ mo</span>
                            </div>
                            <span className="dc-field-hint">1st month free for new users</span>
                        </div>
                        <div className="dc-field">
                            <label>
                                <Bot size={14} />
                                Telegram Bot
                            </label>
                            <div className="dc-input-group">
                                <span className="dc-input-prefix">$</span>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={charges.subscriptionFees.TELEGRAM_BOT}
                                    onChange={e => updateField('subscriptionFees', 'TELEGRAM_BOT', e.target.value)}
                                />
                                <span className="dc-input-suffix">/ mo</span>
                            </div>
                        </div>
                        <div className="dc-field">
                            <label>
                                <Globe size={14} />
                                SMM Panel
                            </label>
                            <div className="dc-input-group">
                                <span className="dc-input-prefix">$</span>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={charges.subscriptionFees.SMM_PANEL}
                                    onChange={e => updateField('subscriptionFees', 'SMM_PANEL', e.target.value)}
                                />
                                <span className="dc-input-suffix">/ mo</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Other Settings Section */}
                <div className="dc-card">
                    <div className="dc-card-header">
                        <div className="dc-card-icon" style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)' }}>
                            <Zap size={20} />
                        </div>
                        <div>
                            <h3>Other Settings</h3>
                            <p>Thresholds and defaults</p>
                        </div>
                    </div>
                    <div className="dc-card-body">
                        <div className="dc-field">
                            <label>
                                <AlertCircle size={14} />
                                Low Balance Threshold
                            </label>
                            <div className="dc-input-group">
                                <span className="dc-input-prefix">$</span>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={charges.other.low_balance_threshold}
                                    onChange={e => updateField('other', 'low_balance_threshold', e.target.value)}
                                />
                            </div>
                            <span className="dc-field-hint">Alert email sent when balance drops below this</span>
                        </div>
                        <div className="dc-field">
                            <label>
                                <Bell size={14} />
                                Low Credit Notification (WhatsApp/Telegram)
                            </label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <button
                                    className={`dc-toggle ${charges.other.low_credit_notify_enabled ? 'active' : ''}`}
                                    onClick={() => updateField('other', 'low_credit_notify_enabled', !charges.other.low_credit_notify_enabled)}
                                    style={{ minWidth: 'auto' }}
                                >
                                    {charges.other.low_credit_notify_enabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                                    <span style={{ marginLeft: '0.4rem', fontSize: '0.85rem' }}>
                                        {charges.other.low_credit_notify_enabled ? 'Enabled' : 'Disabled'}
                                    </span>
                                </button>
                                <div className="dc-input-group" style={{ maxWidth: '120px' }}>
                                    <input
                                        type="number"
                                        step="1"
                                        min="1"
                                        value={charges.other.low_credit_notify_threshold}
                                        onChange={e => updateField('other', 'low_credit_notify_threshold', e.target.value)}
                                        disabled={!charges.other.low_credit_notify_enabled}
                                    />
                                    <span className="dc-input-suffix">cr</span>
                                </div>
                            </div>
                            <span className="dc-field-hint">Send WhatsApp/Telegram alert when credits drop below threshold (once per 24h)</span>
                        </div>
                        <div className="dc-field">
                            <label>
                                <DollarSign size={14} />
                                Default User Credit
                            </label>
                            <div className="dc-input-group">
                                <span className="dc-input-prefix">$</span>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={charges.other.default_user_credit}
                                    onChange={e => updateField('other', 'default_user_credit', e.target.value)}
                                />
                            </div>
                            <span className="dc-field-hint">Initial wallet credit for new user accounts</span>
                        </div>
                        <div className="dc-field">
                            <label>
                                <MessageSquare size={14} />
                                Free Signup Credits — Support
                            </label>
                            <div className="dc-input-group">
                                <span className="dc-input-prefix">🎁</span>
                                <input
                                    type="number"
                                    step="1"
                                    min="0"
                                    value={charges.other.free_signup_support_credits}
                                    onChange={e => updateField('other', 'free_signup_support_credits', e.target.value)}
                                />
                            </div>
                            <span className="dc-field-hint">Free support credits given on signup (bot replies)</span>
                        </div>
                        <div className="dc-field">
                            <label>
                                <Smartphone size={14} />
                                Free Signup Credits — WhatsApp Marketing
                            </label>
                            <div className="dc-input-group">
                                <span className="dc-input-prefix">🎁</span>
                                <input
                                    type="number"
                                    step="1"
                                    min="0"
                                    value={charges.other.free_signup_whatsapp_credits}
                                    onChange={e => updateField('other', 'free_signup_whatsapp_credits', e.target.value)}
                                />
                            </div>
                            <span className="dc-field-hint">Free WhatsApp marketing credits on signup</span>
                        </div>
                        <div className="dc-field">
                            <label>
                                <SendHorizontal size={14} />
                                Free Signup Credits — Telegram Marketing
                            </label>
                            <div className="dc-input-group">
                                <span className="dc-input-prefix">🎁</span>
                                <input
                                    type="number"
                                    step="1"
                                    min="0"
                                    value={charges.other.free_signup_telegram_credits}
                                    onChange={e => updateField('other', 'free_signup_telegram_credits', e.target.value)}
                                />
                            </div>
                            <span className="dc-field-hint">Free Telegram marketing credits on signup</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Per-Message Type Charges (Section 2.1) */}
            <div className="dc-packages-section">
                <div className="dc-section-header">
                    <div>
                        <h2><ArrowRightLeft size={22} /> Per-Message Type Charges</h2>
                        <p>Set individual credit charges per message type. WhatsApp and Telegram have independent settings.</p>
                    </div>
                </div>

                {charges.messageTypeRates && Object.keys(charges.messageTypeRates).length > 0 ? (
                    <div className="dc-table-wrapper">
                        <table className="dc-table">
                            <thead>
                                <tr>
                                    <th>Message Type</th>
                                    <th style={{width: '100px', textAlign: 'center'}}>Enabled</th>
                                    <th style={{width: '140px'}}>Default Charge</th>
                                    <th>Notes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {/* WhatsApp Section */}
                                <tr className="dc-section-divider">
                                    <td colSpan={4}>
                                        <div className="dc-divider-label">
                                            <Smartphone size={14} />
                                            <span>WhatsApp</span>
                                        </div>
                                    </td>
                                </tr>
                                {Object.entries(charges.messageTypeRates)
                                    .filter(([key]) => MESSAGE_TYPE_LABELS[key]?.platform === 'wa')
                                    .map(([key, config]) => (
                                        <tr key={key} className={!config.enabled ? 'dc-row-inactive' : ''}>
                                            <td>
                                                <span className="dc-type-label">{MESSAGE_TYPE_LABELS[key]?.label || key}</span>
                                            </td>
                                            <td style={{textAlign: 'center'}}>
                                                <button
                                                    className={`dc-toggle ${config.enabled ? 'active' : ''}`}
                                                    onClick={() => {
                                                        updateField('messageTypeRates', key, { ...config, enabled: !config.enabled })
                                                    }}
                                                >
                                                    {config.enabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                                                </button>
                                            </td>
                                            <td>
                                                <div className="dc-input-group dc-input-compact">
                                                    <input
                                                        type="number"
                                                        step="0.1"
                                                        min="0"
                                                        value={config.rate}
                                                        onChange={e => {
                                                            updateField('messageTypeRates', key, { ...config, rate: e.target.value })
                                                        }}
                                                        disabled={!config.enabled}
                                                    />
                                                    <span className="dc-input-suffix">cr</span>
                                                </div>
                                            </td>
                                            <td><span className="dc-type-note">{MESSAGE_TYPE_LABELS[key]?.note}</span></td>
                                        </tr>
                                    ))}

                                {/* Telegram Section */}
                                <tr className="dc-section-divider">
                                    <td colSpan={4}>
                                        <div className="dc-divider-label">
                                            <SendHorizontal size={14} />
                                            <span>Telegram</span>
                                        </div>
                                    </td>
                                </tr>
                                {Object.entries(charges.messageTypeRates)
                                    .filter(([key]) => MESSAGE_TYPE_LABELS[key]?.platform === 'tg')
                                    .map(([key, config]) => (
                                        <tr key={key} className={!config.enabled ? 'dc-row-inactive' : ''}>
                                            <td>
                                                <span className="dc-type-label">{MESSAGE_TYPE_LABELS[key]?.label || key}</span>
                                            </td>
                                            <td style={{textAlign: 'center'}}>
                                                <button
                                                    className={`dc-toggle ${config.enabled ? 'active' : ''}`}
                                                    onClick={() => {
                                                        updateField('messageTypeRates', key, { ...config, enabled: !config.enabled })
                                                    }}
                                                >
                                                    {config.enabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                                                </button>
                                            </td>
                                            <td>
                                                <div className="dc-input-group dc-input-compact">
                                                    <input
                                                        type="number"
                                                        step="0.1"
                                                        min="0"
                                                        value={config.rate}
                                                        onChange={e => {
                                                            updateField('messageTypeRates', key, { ...config, rate: e.target.value })
                                                        }}
                                                        disabled={!config.enabled}
                                                    />
                                                    <span className="dc-input-suffix">cr</span>
                                                </div>
                                            </td>
                                            <td><span className="dc-type-note">{MESSAGE_TYPE_LABELS[key]?.note}</span></td>
                                        </tr>
                                    ))}

                                {/* Other Section */}
                                <tr className="dc-section-divider">
                                    <td colSpan={4}>
                                        <div className="dc-divider-label">
                                            <Globe size={14} />
                                            <span>Other</span>
                                        </div>
                                    </td>
                                </tr>
                                {Object.entries(charges.messageTypeRates)
                                    .filter(([key]) => MESSAGE_TYPE_LABELS[key]?.platform === 'other')
                                    .map(([key, config]) => (
                                        <tr key={key} className={!config.enabled ? 'dc-row-inactive' : ''}>
                                            <td>
                                                <span className="dc-type-label">{MESSAGE_TYPE_LABELS[key]?.label || key}</span>
                                            </td>
                                            <td style={{textAlign: 'center'}}>
                                                <button
                                                    className={`dc-toggle ${config.enabled ? 'active' : ''}`}
                                                    onClick={() => {
                                                        updateField('messageTypeRates', key, { ...config, enabled: !config.enabled })
                                                    }}
                                                >
                                                    {config.enabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                                                </button>
                                            </td>
                                            <td>
                                                <div className="dc-input-group dc-input-compact">
                                                    <input
                                                        type="number"
                                                        step="0.1"
                                                        min="0"
                                                        value={config.rate}
                                                        onChange={e => {
                                                            updateField('messageTypeRates', key, { ...config, rate: e.target.value })
                                                        }}
                                                        disabled={!config.enabled}
                                                    />
                                                    <span className="dc-input-suffix">cr</span>
                                                </div>
                                            </td>
                                            <td><span className="dc-type-note">{MESSAGE_TYPE_LABELS[key]?.note}</span></td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="dc-empty">
                        <Zap size={40} />
                        <h4>Loading message type rates...</h4>
                    </div>
                )}
            </div>

            {/* Credit Packages Table */}
            <div className="dc-packages-section">
                <div className="dc-section-header">
                    <div>
                        <h2><Package size={22} /> Credit Packages</h2>
                        <p>Manage credit packages from the <a href="/admin/credit-packages" className="dc-link">Credit Packages</a> page</p>
                    </div>
                    <span className="dc-badge">{charges.creditPackages.length} packages</span>
                </div>

                {charges.creditPackages.length === 0 ? (
                    <div className="dc-empty">
                        <Package size={40} />
                        <h4>No Credit Packages</h4>
                        <p>Create credit packages from the admin panel</p>
                    </div>
                ) : (
                    <div className="dc-table-wrapper">
                        <table className="dc-table">
                            <thead>
                                <tr>
                                    <th>Package</th>
                                    <th>Category</th>
                                    <th>Price</th>
                                    <th>Credits</th>
                                    <th>Bonus</th>
                                    <th>Discount</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {charges.creditPackages.map(pkg => (
                                    <tr key={pkg.id} className={!pkg.isActive ? 'dc-row-inactive' : ''}>
                                        <td>
                                            <div className="dc-pkg-name">
                                                <span>{pkg.name}</span>
                                                {pkg.isFeatured && <Tag size={12} className="dc-featured-icon" />}
                                            </div>
                                            {pkg.description && <small className="dc-pkg-desc">{pkg.description}</small>}
                                        </td>
                                        <td>
                                            <span className="dc-category-badge">{pkg.category}</span>
                                        </td>
                                        <td className="dc-price">${pkg.price.toFixed(2)}</td>
                                        <td>{pkg.credits.toLocaleString()}</td>
                                        <td>
                                            {pkg.bonusCredits > 0 ? (
                                                <span className="dc-bonus">+{pkg.bonusCredits.toLocaleString()}</span>
                                            ) : '—'}
                                        </td>
                                        <td>
                                            {pkg.discountPct > 0 ? (
                                                <span className="dc-discount">{pkg.discountPct}%</span>
                                            ) : '—'}
                                        </td>
                                        <td>
                                            <span className={`dc-status ${pkg.isActive ? 'active' : 'inactive'}`}>
                                                {pkg.isActive ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Credit Deduction Log (Section 2.1) */}
            <div className="dc-packages-section">
                <div
                    className="dc-section-header"
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => setLogExpanded(!logExpanded)}
                >
                    <div>
                        <h2><BarChart3 size={22} /> Credit Deduction Log</h2>
                        <p>Running log of credit deductions per message type for admin review</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {logData.summary?.totalTransactions > 0 && (
                            <span className="dc-badge">
                                {logData.summary.totalTransactions} deductions • {logData.summary.totalDeducted.toFixed(2)} credits total
                            </span>
                        )}
                        {logExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </div>
                </div>

                {logExpanded && (
                    <div>
                        {/* Filters Row */}
                        <div style={{
                            display: 'flex', gap: '0.75rem', flexWrap: 'wrap',
                            padding: '0.75rem 1rem', background: 'var(--bg-secondary)',
                            borderRadius: 'var(--radius-md)', marginBottom: '1rem',
                            alignItems: 'center', border: '1px solid var(--border-color)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <Filter size={14} style={{ color: 'var(--text-muted)' }} />
                                <select
                                    className="form-select"
                                    value={logFilter.type}
                                    onChange={e => {
                                        setLogFilter(prev => ({ ...prev, type: e.target.value }))
                                        setLogPagination(prev => ({ ...prev, page: 1 }))
                                    }}
                                    style={{ fontSize: '0.8rem', padding: '4px 8px', minWidth: '180px' }}
                                >
                                    <option value="all">All Types</option>
                                    <optgroup label="WhatsApp">
                                        {Object.entries(MESSAGE_TYPE_LABELS)
                                            .filter(([, v]) => v.platform === 'wa')
                                            .map(([key, v]) => (
                                                <option key={key} value={key}>{v.label}</option>
                                            ))}
                                    </optgroup>
                                    <optgroup label="Telegram">
                                        {Object.entries(MESSAGE_TYPE_LABELS)
                                            .filter(([, v]) => v.platform === 'tg')
                                            .map(([key, v]) => (
                                                <option key={key} value={key}>{v.label}</option>
                                            ))}
                                    </optgroup>
                                </select>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <Search size={14} style={{ color: 'var(--text-muted)' }} />
                                <input
                                    className="form-input"
                                    placeholder="Search description..."
                                    value={logFilter.search}
                                    onChange={e => setLogFilter(prev => ({ ...prev, search: e.target.value }))}
                                    onKeyDown={e => { if (e.key === 'Enter') { setLogPagination(prev => ({ ...prev, page: 1 })); fetchDeductionLog(1) } }}
                                    style={{ fontSize: '0.8rem', padding: '4px 8px', maxWidth: '180px' }}
                                />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <Clock size={14} style={{ color: 'var(--text-muted)' }} />
                                <input
                                    type="date"
                                    className="form-input"
                                    value={logFilter.from}
                                    onChange={e => setLogFilter(prev => ({ ...prev, from: e.target.value }))}
                                    style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                                />
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>→</span>
                                <input
                                    type="date"
                                    className="form-input"
                                    value={logFilter.to}
                                    onChange={e => setLogFilter(prev => ({ ...prev, to: e.target.value }))}
                                    style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                                />
                            </div>
                            <button
                                className="dc-btn dc-btn-ghost"
                                onClick={() => { setLogPagination(prev => ({ ...prev, page: 1 })); fetchDeductionLog(1); fetchDeductionSummary() }}
                                style={{ fontSize: '0.8rem', padding: '4px 12px' }}
                            >
                                <RefreshCw size={14} /> Apply
                            </button>
                        </div>

                        {/* Summary Breakdown */}
                        {summaryData && summaryData.breakdown && summaryData.breakdown.length > 0 && (
                            <div style={{
                                marginBottom: '1rem', padding: '0.75rem 1rem',
                                background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--border-color)'
                            }}>
                                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <BarChart3 size={14} /> Deduction Breakdown by Type
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                                        ({summaryData.grandTotal.toFixed(2)} credits total)
                                    </span>
                                </h4>
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    {summaryData.breakdown.slice(0, 10).map(item => (
                                        <div key={item.type} style={{
                                            padding: '4px 10px', borderRadius: '20px',
                                            background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
                                            fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px'
                                        }}>
                                            <span style={{ fontWeight: 600 }}>{item.type}</span>
                                            <span style={{ color: 'var(--text-muted)' }}>×{item.count}</span>
                                            <span style={{ color: '#ef4444', fontWeight: 600 }}>-{item.total.toFixed(1)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Transactions Table */}
                        {logLoading ? (
                            <div className="dc-loading" style={{ minHeight: '150px' }}>
                                <Loader2 className="dc-spinner" size={24} />
                                <p style={{ fontSize: '0.85rem' }}>Loading deductions...</p>
                            </div>
                        ) : logData.transactions && logData.transactions.length > 0 ? (
                            <>
                                <div className="dc-table-wrapper">
                                    <table className="dc-table">
                                        <thead>
                                            <tr>
                                                <th>Time</th>
                                                <th>User</th>
                                                <th>Type / Description</th>
                                                <th style={{ textAlign: 'right' }}>Amount</th>
                                                <th style={{ textAlign: 'right' }}>Balance After</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {logData.transactions.map(tx => (
                                                <tr key={tx.id}>
                                                    <td style={{ fontSize: '0.75rem', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                                                        {new Date(tx.createdAt).toLocaleString()}
                                                    </td>
                                                    <td>
                                                        <span style={{ fontWeight: 600, fontSize: '0.8rem' }}>
                                                            {tx.user?.username || tx.user?.name || tx.userId?.slice(0, 8)}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span className="dc-type-label" style={{ fontSize: '0.8rem' }}>
                                                            {tx.description}
                                                        </span>
                                                    </td>
                                                    <td style={{ textAlign: 'right', color: '#ef4444', fontWeight: 600, fontSize: '0.85rem' }}>
                                                        -{tx.amount.toFixed(2)}
                                                    </td>
                                                    <td style={{ textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                        {tx.balanceAfter.toFixed(2)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Pagination */}
                                {logPagination.totalPages > 1 && (
                                    <div style={{
                                        display: 'flex', justifyContent: 'center', gap: '0.5rem',
                                        padding: '0.75rem 0', alignItems: 'center'
                                    }}>
                                        <button
                                            className="dc-btn dc-btn-ghost"
                                            disabled={logPagination.page <= 1}
                                            onClick={() => setLogPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                                            style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                                        >
                                            ← Prev
                                        </button>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                            Page {logPagination.page} of {logPagination.totalPages}
                                        </span>
                                        <button
                                            className="dc-btn dc-btn-ghost"
                                            disabled={logPagination.page >= logPagination.totalPages}
                                            onClick={() => setLogPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                                            style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                                        >
                                            Next →
                                        </button>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="dc-empty">
                                <BarChart3 size={40} />
                                <h4>No Deductions Found</h4>
                                <p>No credit deductions match the current filters</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Floating save bar */}
            {hasChanges && (
                <div className="dc-floating-bar">
                    <span>You have unsaved changes</span>
                    <div className="dc-floating-actions">
                        <button className="dc-btn dc-btn-ghost" onClick={handleReset}>Discard</button>
                        <button className="dc-btn dc-btn-save has-changes" onClick={handleSave} disabled={saving}>
                            {saving ? <Loader2 className="dc-spinner" size={16} /> : <Save size={16} />}
                            Save Changes
                        </button>
                    </div>
                </div>
            )}

            <style>{styles}</style>
        </div>
    )
}

const styles = `
    .dc-page {
        padding: 1.5rem;
        max-width: 1200px;
        margin: 0 auto;
        position: relative;
        min-height: 100vh;
    }

    /* Loading */
    .dc-loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1rem;
        min-height: 400px;
        color: var(--text-secondary);
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }
    .dc-spinner {
        animation: spin 1s linear infinite;
    }

    /* Header */
    .dc-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 1.5rem;
        flex-wrap: wrap;
        gap: 1rem;
    }
    .dc-header-left {
        display: flex;
        align-items: center;
        gap: 1rem;
    }
    .dc-header-icon {
        width: 52px;
        height: 52px;
        border-radius: 14px;
        background: linear-gradient(135deg, #10b981, #059669);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);
    }
    .dc-header h1 {
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--text-primary);
        margin: 0;
    }
    .dc-header p {
        font-size: 0.875rem;
        color: var(--text-secondary);
        margin: 0.15rem 0 0;
    }
    .dc-header-actions {
        display: flex;
        gap: 0.5rem;
    }

    /* Buttons */
    .dc-btn {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.6rem 1.2rem;
        border-radius: 10px;
        font-size: 0.875rem;
        font-weight: 600;
        border: none;
        cursor: pointer;
        transition: all 0.2s ease;
        font-family: inherit;
    }
    .dc-btn-ghost {
        background: var(--bg-tertiary);
        color: var(--text-secondary);
        border: 1px solid var(--border-color);
    }
    .dc-btn-ghost:hover {
        background: var(--bg-card-hover);
        color: var(--text-primary);
    }
    .dc-btn-save {
        background: var(--bg-tertiary);
        color: var(--text-secondary);
        border: 1px solid var(--border-color);
        opacity: 0.6;
    }
    .dc-btn-save.has-changes {
        background: linear-gradient(135deg, #10b981, #059669);
        color: white;
        border: none;
        opacity: 1;
        box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);
    }
    .dc-btn-save.has-changes:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 20px rgba(16, 185, 129, 0.4);
    }
    .dc-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none !important;
    }

    /* Alerts */
    .dc-alert {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.875rem 1.25rem;
        border-radius: 12px;
        margin-bottom: 1.25rem;
        font-size: 0.875rem;
        font-weight: 500;
        animation: slideDown 0.3s ease;
    }
    @keyframes slideDown {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
    }
    .dc-alert-error {
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.25);
        color: #ef4444;
    }
    .dc-alert-success {
        background: rgba(16, 185, 129, 0.1);
        border: 1px solid rgba(16, 185, 129, 0.25);
        color: #10b981;
    }

    /* Overview Cards */
    .dc-overview {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1rem;
        margin-bottom: 1.5rem;
    }
    .dc-overview-card {
        display: flex;
        align-items: center;
        gap: 0.875rem;
        padding: 1rem 1.25rem;
        background: var(--bg-card);
        border: 1px solid var(--border-color);
        border-radius: 14px;
        transition: all 0.2s ease;
    }
    .dc-overview-card:hover {
        border-color: var(--border-color-hover);
        transform: translateY(-2px);
        box-shadow: 0 4px 20px rgba(0,0,0,0.1);
    }
    .dc-overview-icon {
        width: 42px;
        height: 42px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        flex-shrink: 0;
    }
    .dc-overview-info {
        display: flex;
        flex-direction: column;
    }
    .dc-overview-label {
        font-size: 0.75rem;
        color: var(--text-secondary);
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.03em;
    }
    .dc-overview-value {
        font-size: 1.125rem;
        font-weight: 700;
        color: var(--text-primary);
    }

    /* Grid */
    .dc-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
        gap: 1.25rem;
        margin-bottom: 1.5rem;
    }

    /* Cards */
    .dc-card {
        background: var(--bg-card);
        border: 1px solid var(--border-color);
        border-radius: 16px;
        overflow: hidden;
        transition: all 0.25s ease;
    }
    .dc-card:hover {
        border-color: var(--border-color-hover);
        box-shadow: 0 4px 25px rgba(0,0,0,0.08);
    }
    .dc-card-header {
        display: flex;
        align-items: center;
        gap: 0.875rem;
        padding: 1.25rem 1.25rem 0.75rem;
    }
    .dc-card-icon {
        width: 40px;
        height: 40px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        flex-shrink: 0;
    }
    .dc-card-header h3 {
        font-size: 1rem;
        font-weight: 700;
        color: var(--text-primary);
        margin: 0;
    }
    .dc-card-header p {
        font-size: 0.75rem;
        color: var(--text-secondary);
        margin: 0.1rem 0 0;
    }
    .dc-card-body {
        padding: 0.75rem 1.25rem 1.25rem;
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    /* Fields */
    .dc-field {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
    }
    .dc-field label {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--text-secondary);
    }
    .dc-field-hint {
        font-size: 0.7rem;
        color: var(--text-muted, var(--text-secondary));
        opacity: 0.7;
        font-style: italic;
    }
    .dc-input-group {
        display: flex;
        align-items: center;
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        border-radius: 10px;
        overflow: hidden;
        transition: all 0.2s ease;
    }
    .dc-input-group:focus-within {
        border-color: #10b981;
        box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
    }
    .dc-input-prefix {
        padding: 0.6rem 0 0.6rem 0.875rem;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--text-secondary);
        flex-shrink: 0;
    }
    .dc-input-suffix {
        padding: 0.6rem 0.875rem 0.6rem 0;
        font-size: 0.75rem;
        font-weight: 500;
        color: var(--text-muted, var(--text-secondary));
        opacity: 0.6;
        flex-shrink: 0;
    }
    .dc-input-group input {
        flex: 1;
        border: none;
        background: transparent;
        padding: 0.6rem 0.5rem;
        font-size: 0.95rem;
        font-weight: 600;
        color: var(--text-primary);
        outline: none;
        font-family: 'JetBrains Mono', monospace;
        min-width: 0;
    }
    .dc-input-group input::-webkit-inner-spin-button,
    .dc-input-group input::-webkit-outer-spin-button {
        opacity: 1;
    }

    /* Packages section */
    .dc-packages-section {
        background: var(--bg-card);
        border: 1px solid var(--border-color);
        border-radius: 16px;
        padding: 1.5rem;
        margin-bottom: 5rem;
    }
    .dc-section-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        margin-bottom: 1.25rem;
        flex-wrap: wrap;
        gap: 0.75rem;
    }
    .dc-section-header h2 {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 1.15rem;
        font-weight: 700;
        color: var(--text-primary);
        margin: 0;
    }
    .dc-section-header p {
        font-size: 0.8rem;
        color: var(--text-secondary);
        margin: 0.25rem 0 0;
    }
    .dc-link {
        color: #10b981;
        text-decoration: none;
        font-weight: 600;
    }
    .dc-link:hover { text-decoration: underline; }
    .dc-badge {
        display: inline-flex;
        align-items: center;
        padding: 0.3rem 0.75rem;
        border-radius: 20px;
        font-size: 0.75rem;
        font-weight: 600;
        background: rgba(99, 102, 241, 0.1);
        color: #6366f1;
        border: 1px solid rgba(99, 102, 241, 0.2);
    }

    /* Table */
    .dc-table-wrapper {
        overflow-x: auto;
        border-radius: 12px;
        border: 1px solid var(--border-color);
    }
    .dc-table {
        width: 100%;
        border-collapse: collapse;
    }
    .dc-table thead th {
        padding: 0.75rem 1rem;
        text-align: left;
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        background: var(--bg-tertiary);
        border-bottom: 1px solid var(--border-color);
    }
    .dc-table tbody td {
        padding: 0.75rem 1rem;
        font-size: 0.875rem;
        color: var(--text-primary);
        border-bottom: 1px solid var(--border-color);
    }
    .dc-table tbody tr:last-child td {
        border-bottom: none;
    }
    .dc-table tbody tr:hover {
        background: var(--bg-card-hover, rgba(0,0,0,0.02));
    }
    .dc-row-inactive {
        opacity: 0.5;
    }
    .dc-pkg-name {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        font-weight: 600;
    }
    .dc-featured-icon {
        color: #f59e0b;
    }
    .dc-pkg-desc {
        display: block;
        color: var(--text-secondary);
        font-size: 0.75rem;
        margin-top: 0.15rem;
    }
    .dc-price {
        font-weight: 700;
        font-family: 'JetBrains Mono', monospace;
        color: #10b981 !important;
    }
    .dc-bonus {
        color: #10b981;
        font-weight: 600;
    }
    .dc-discount {
        background: rgba(239, 68, 68, 0.1);
        color: #ef4444;
        padding: 0.2rem 0.5rem;
        border-radius: 6px;
        font-size: 0.75rem;
        font-weight: 600;
    }
    .dc-category-badge {
        display: inline-flex;
        padding: 0.2rem 0.6rem;
        border-radius: 6px;
        font-size: 0.7rem;
        font-weight: 600;
        text-transform: uppercase;
        background: rgba(99, 102, 241, 0.1);
        color: #6366f1;
    }
    .dc-status {
        display: inline-flex;
        padding: 0.2rem 0.6rem;
        border-radius: 6px;
        font-size: 0.75rem;
        font-weight: 600;
    }
    .dc-status.active {
        background: rgba(16, 185, 129, 0.1);
        color: #10b981;
    }
    .dc-status.inactive {
        background: rgba(156, 163, 175, 0.1);
        color: #9ca3af;
    }

    /* Empty */
    .dc-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 2.5rem;
        color: var(--text-secondary);
        text-align: center;
        gap: 0.5rem;
    }
    .dc-empty h4 {
        margin: 0;
        font-size: 1rem;
        color: var(--text-primary);
    }
    .dc-empty p {
        margin: 0;
        font-size: 0.8rem;
    }

    /* Floating Save Bar */
    .dc-floating-bar {
        position: fixed;
        bottom: 1.5rem;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1.5rem;
        padding: 0.875rem 1.5rem;
        background: var(--bg-card);
        border: 1px solid var(--border-color);
        border-radius: 16px;
        box-shadow: 0 8px 30px rgba(0,0,0,0.15);
        z-index: 100;
        min-width: 420px;
        backdrop-filter: blur(12px);
        animation: floatUp 0.3s ease;
    }
    @keyframes floatUp {
        from { opacity: 0; transform: translateX(-50%) translateY(20px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
    .dc-floating-bar span {
        font-size: 0.875rem;
        color: var(--text-secondary);
        font-weight: 500;
    }
    .dc-floating-actions {
        display: flex;
        gap: 0.5rem;
    }

    /* Per-Message Type Charges */
    .dc-toggle {
        background: none;
        border: none;
        cursor: pointer;
        padding: 4px;
        border-radius: 6px;
        transition: all 0.2s ease;
        color: var(--text-secondary);
        display: inline-flex;
        align-items: center;
    }
    .dc-toggle:hover {
        background: var(--bg-tertiary);
    }
    .dc-toggle.active {
        color: #10b981;
    }
    .dc-section-divider td {
        padding: 0.5rem 1rem !important;
        background: var(--bg-tertiary);
        border-bottom: 1px solid var(--border-color);
    }
    .dc-divider-label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.75rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-secondary);
    }
    .dc-type-label {
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--text-primary);
    }
    .dc-type-note {
        font-size: 0.8rem;
        color: var(--text-secondary);
    }
    .dc-input-compact {
        max-width: 120px;
    }
    .dc-input-compact input {
        padding: 0.4rem 0.5rem !important;
        font-size: 0.875rem;
    }
    .dc-input-compact input:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }

    /* Responsive */
    @media (max-width: 768px) {
        .dc-page { padding: 1rem; }
        .dc-header { flex-direction: column; align-items: flex-start; }
        .dc-grid { grid-template-columns: 1fr; }
        .dc-overview { grid-template-columns: 1fr 1fr; }
        .dc-floating-bar {
            min-width: auto;
            left: 1rem;
            right: 1rem;
            transform: none;
            flex-direction: column;
            gap: 0.75rem;
        }
        @keyframes floatUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
    }
`
