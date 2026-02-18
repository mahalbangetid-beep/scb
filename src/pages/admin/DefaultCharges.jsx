import { useState, useEffect } from 'react'
import {
    DollarSign, Save, Loader2, AlertCircle, CheckCircle2,
    MessageSquare, Smartphone, Bot, Globe, CreditCard,
    Zap, Package, RefreshCw,
    SendHorizontal, Users, Shield, Tag
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
        other: { low_balance_threshold: 5.00, default_user_credit: 0 }
    })

    // Original charges for diff checking
    const [originalCharges, setOriginalCharges] = useState(null)

    useEffect(() => {
        fetchCharges()
    }, [])

    useEffect(() => {
        if (success || error) {
            const timer = setTimeout(() => { setSuccess(null); setError(null) }, 4000)
            return () => clearTimeout(timer)
        }
    }, [success, error])

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
                    payload.other[k] = parseFloat(v)
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
                        <span className="dc-overview-value">${parseFloat(charges.messageRates.wa_message_rate || 0).toFixed(4)}</span>
                    </div>
                </div>
                <div className="dc-overview-card">
                    <div className="dc-overview-icon" style={{ background: 'linear-gradient(135deg, #0088cc, #005580)' }}>
                        <SendHorizontal size={20} />
                    </div>
                    <div className="dc-overview-info">
                        <span className="dc-overview-label">TG Message</span>
                        <span className="dc-overview-value">${parseFloat(charges.messageRates.tg_message_rate || 0).toFixed(4)}</span>
                    </div>
                </div>
                <div className="dc-overview-card">
                    <div className="dc-overview-icon" style={{ background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)' }}>
                        <Users size={20} />
                    </div>
                    <div className="dc-overview-info">
                        <span className="dc-overview-label">Group Msg</span>
                        <span className="dc-overview-value">${parseFloat(charges.messageRates.group_message_rate || 0).toFixed(4)}</span>
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
                                <span className="dc-input-prefix">$</span>
                                <input
                                    type="number"
                                    step="0.001"
                                    min="0"
                                    value={charges.messageRates.wa_message_rate}
                                    onChange={e => updateField('messageRates', 'wa_message_rate', e.target.value)}
                                />
                                <span className="dc-input-suffix">/ msg</span>
                            </div>
                        </div>
                        <div className="dc-field">
                            <label>
                                <SendHorizontal size={14} />
                                Telegram Message Rate
                            </label>
                            <div className="dc-input-group">
                                <span className="dc-input-prefix">$</span>
                                <input
                                    type="number"
                                    step="0.001"
                                    min="0"
                                    value={charges.messageRates.tg_message_rate}
                                    onChange={e => updateField('messageRates', 'tg_message_rate', e.target.value)}
                                />
                                <span className="dc-input-suffix">/ msg</span>
                            </div>
                        </div>
                        <div className="dc-field">
                            <label>
                                <Users size={14} />
                                Group Message Rate
                            </label>
                            <div className="dc-input-group">
                                <span className="dc-input-prefix">$</span>
                                <input
                                    type="number"
                                    step="0.001"
                                    min="0"
                                    value={charges.messageRates.group_message_rate}
                                    onChange={e => updateField('messageRates', 'group_message_rate', e.target.value)}
                                />
                                <span className="dc-input-suffix">/ msg</span>
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
                            <span className="dc-field-hint">Initial credit for new user accounts</span>
                        </div>
                    </div>
                </div>
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
