import { useState, useEffect, useCallback } from 'react'
import {
    CreditCard, RefreshCw, CheckCircle2, XCircle,
    AlertTriangle, Clock, Loader2, Settings, Search,
    ToggleLeft, ToggleRight, Globe, Shield, Zap,
    TrendingUp, DollarSign, Activity
} from 'lucide-react'
import api from '../services/api'

const STATUS_COLORS = {
    pending: { bg: 'rgba(251, 191, 36, 0.1)', color: '#fbbf24', border: 'rgba(251, 191, 36, 0.3)' },
    verifying: { bg: 'rgba(96, 165, 250, 0.1)', color: '#60a5fa', border: 'rgba(96, 165, 250, 0.3)' },
    verified: { bg: 'rgba(52, 211, 153, 0.1)', color: '#34d399', border: 'rgba(52, 211, 153, 0.3)' },
    credited: { bg: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', border: 'rgba(34, 197, 94, 0.3)' },
    rejected: { bg: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'rgba(239, 68, 68, 0.3)' },
    failed: { bg: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'rgba(239, 68, 68, 0.3)' },
    credit_unconfirmed: { bg: 'rgba(251, 146, 60, 0.1)', color: '#fb923c', border: 'rgba(251, 146, 60, 0.3)' },
}

const STATUS_ICONS = {
    pending: Clock,
    verifying: Loader2,
    verified: CheckCircle2,
    credited: CheckCircle2,
    rejected: XCircle,
    failed: AlertTriangle,
    credit_unconfirmed: AlertTriangle,
}

export default function FonepayUser() {
    const [activeTab, setActiveTab] = useState('settings')
    const [error, setError] = useState(null)
    const [success, setSuccess] = useState(null)

    // Clear messages after timeout
    useEffect(() => {
        if (success) {
            const t = setTimeout(() => setSuccess(null), 3000)
            return () => clearTimeout(t)
        }
    }, [success])

    useEffect(() => {
        if (error) {
            const t = setTimeout(() => setError(null), 5000)
            return () => clearTimeout(t)
        }
    }, [error])

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <h1 className="page-title">💳 FonePay Settings</h1>
                    <p className="page-subtitle">Manage FonePay payment verification for your Rental Panels</p>
                </div>
            </div>

            {error && (
                <div className="alert alert-error" style={{ marginBottom: 'var(--spacing-md)' }}>
                    <AlertTriangle size={18} />
                    <span>{error}</span>
                </div>
            )}

            {success && (
                <div className="alert alert-success" style={{ marginBottom: 'var(--spacing-md)' }}>
                    <CheckCircle2 size={18} />
                    <span>{success}</span>
                </div>
            )}

            {/* Tabs */}
            <div className="fpu-tabs">
                <button
                    className={`fpu-tab ${activeTab === 'settings' ? 'active' : ''}`}
                    onClick={() => setActiveTab('settings')}
                >
                    <Settings size={16} />
                    Settings
                </button>
                <button
                    className={`fpu-tab ${activeTab === 'transactions' ? 'active' : ''}`}
                    onClick={() => setActiveTab('transactions')}
                >
                    <Activity size={16} />
                    Transactions
                </button>
            </div>

            {activeTab === 'settings' && <SettingsTab setError={setError} setSuccess={setSuccess} />}
            {activeTab === 'transactions' && <TransactionsTab setError={setError} />}

            <style>{fonepayUserStyles}</style>
        </div>
    )
}


// ==================== SETTINGS TAB ====================

function SettingsTab({ setError, setSuccess }) {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [globalForm, setGlobalForm] = useState({
        enabled: false,
        maxAttemptsPerHour: 5,
        paymentExpiryHours: 24
    })
    const [panels, setPanels] = useState([])
    const [stats, setStats] = useState(null)

    const fetchSettings = useCallback(async () => {
        try {
            setLoading(true)
            const [settingsRes, statsRes] = await Promise.all([
                api.get('/fonepay-user/settings'),
                api.get('/fonepay-user/stats').catch(() => null)
            ])

            if (settingsRes.success) {
                setGlobalForm(settingsRes.data.global)
                setPanels(settingsRes.data.panels || [])
            }

            if (statsRes?.success) {
                setStats(statsRes.data)
            }
        } catch (err) {
            setError(err.error || err.message || 'Failed to load settings')
        } finally {
            setLoading(false)
        }
    }, [setError])

    useEffect(() => {
        fetchSettings()
    }, [fetchSettings])

    const togglePanel = async (panelId, currentEnabled) => {
        try {
            await api.patch(`/fonepay-user/panels/${panelId}/toggle`, { enabled: !currentEnabled })
            setSuccess(`FonePay ${!currentEnabled ? 'enabled' : 'disabled'} for panel`)
            fetchSettings()
        } catch (err) {
            setError(err.error || err.message || 'Failed to toggle panel')
        }
    }

    const saveGlobalSettings = async () => {
        try {
            setSaving(true)
            await api.patch('/fonepay-user/settings', globalForm)
            setSuccess('FonePay settings saved successfully')
        } catch (err) {
            setError(err.error || err.message || 'Failed to save settings')
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <div className="loading-container">
                <Loader2 className="animate-spin" size={32} />
                <p>Loading FonePay settings...</p>
            </div>
        )
    }

    return (
        <div className="fpu-settings-layout">
            {/* Stats Cards (if data exists) */}
            {stats && (
                <div className="fpu-stats-grid">
                    <div className="fpu-stat-card">
                        <div className="fpu-stat-icon" style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e' }}>
                            <TrendingUp size={20} />
                        </div>
                        <div className="fpu-stat-info">
                            <span className="fpu-stat-value">{stats.today.count}</span>
                            <span className="fpu-stat-label">Today</span>
                        </div>
                    </div>
                    <div className="fpu-stat-card">
                        <div className="fpu-stat-icon" style={{ background: 'rgba(96, 165, 250, 0.1)', color: '#60a5fa' }}>
                            <Activity size={20} />
                        </div>
                        <div className="fpu-stat-info">
                            <span className="fpu-stat-value">{stats.week.count}</span>
                            <span className="fpu-stat-label">This Week</span>
                        </div>
                    </div>
                    <div className="fpu-stat-card">
                        <div className="fpu-stat-icon" style={{ background: 'rgba(168, 85, 247, 0.1)', color: '#a855f7' }}>
                            <DollarSign size={20} />
                        </div>
                        <div className="fpu-stat-info">
                            <span className="fpu-stat-value">{stats.month.totalAmount.toLocaleString()}</span>
                            <span className="fpu-stat-label">Month Total</span>
                        </div>
                    </div>
                    <div className="fpu-stat-card">
                        <div className="fpu-stat-icon" style={{ background: 'rgba(251, 191, 36, 0.1)', color: '#fbbf24' }}>
                            <CheckCircle2 size={20} />
                        </div>
                        <div className="fpu-stat-info">
                            <span className="fpu-stat-value">{stats.successRate}%</span>
                            <span className="fpu-stat-label">Success Rate</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Global Settings */}
            <div className="card">
                <div className="card-header" style={{ padding: '1.25rem' }}>
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Shield size={20} />
                        Global FonePay Settings
                    </h3>
                    <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                        Master toggle and configuration for FonePay verification
                    </p>
                </div>
                <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {/* Enable Toggle */}
                    <div className="fpu-toggle-row">
                        <div>
                            <strong>FonePay Verification</strong>
                            <p style={{ margin: 0, fontSize: '0.813rem', color: 'var(--text-secondary)' }}>
                                {globalForm.enabled ? 'System is accepting FonePay verifications' : 'All FonePay verifications are disabled'}
                            </p>
                        </div>
                        <button
                            className={`fpu-toggle-btn ${globalForm.enabled ? 'active' : ''}`}
                            onClick={() => setGlobalForm({ ...globalForm, enabled: !globalForm.enabled })}
                        >
                            {globalForm.enabled ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                        </button>
                    </div>

                    {/* Max Attempts */}
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Max Verification Attempts per Hour</label>
                        <input
                            type="number"
                            className="form-input"
                            value={globalForm.maxAttemptsPerHour}
                            onChange={(e) => setGlobalForm({ ...globalForm, maxAttemptsPerHour: parseInt(e.target.value) || 5 })}
                            min={1}
                            max={50}
                            style={{ maxWidth: '200px' }}
                        />
                        <p className="form-hint">Rate limit per WhatsApp number per hour</p>
                    </div>

                    {/* Payment Expiry */}
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Payment Expiry (hours)</label>
                        <input
                            type="number"
                            className="form-input"
                            value={globalForm.paymentExpiryHours}
                            onChange={(e) => setGlobalForm({ ...globalForm, paymentExpiryHours: parseInt(e.target.value) || 24 })}
                            min={1}
                            max={168}
                            style={{ maxWidth: '200px' }}
                        />
                        <p className="form-hint">Transactions older than this are rejected</p>
                    </div>

                    <button
                        className="btn btn-primary"
                        onClick={saveGlobalSettings}
                        disabled={saving}
                        style={{ alignSelf: 'flex-start' }}
                    >
                        {saving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                        Save Settings
                    </button>
                </div>
            </div>

            {/* Per-Panel Settings */}
            <div className="card">
                <div className="card-header" style={{ padding: '1.25rem' }}>
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Globe size={20} />
                        Rental Panel FonePay Status
                    </h3>
                    <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                        Enable or disable FonePay for each of your Rental Panels
                    </p>
                </div>
                <div style={{ padding: '1.25rem' }}>
                    {panels.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-secondary)' }}>
                            <Globe size={40} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
                            <p>No Rental Panels found.</p>
                            <p style={{ fontSize: '0.813rem' }}>FonePay only works with Rental Panels. Add a Rental Panel first in SMM Panels page.</p>
                        </div>
                    ) : (
                        <div className="fpu-panel-list">
                            {panels.map(panel => (
                                <div key={panel.id} className="fpu-panel-item">
                                    <div className="fpu-panel-info">
                                        <div className="fpu-panel-name">
                                            <Globe size={16} />
                                            <strong>{panel.alias || panel.name}</strong>
                                        </div>
                                        <span className="fpu-panel-url">{panel.url}</span>
                                    </div>
                                    <button
                                        className={`fpu-toggle-btn ${panel.fonepayEnabled ? 'active' : ''}`}
                                        onClick={() => togglePanel(panel.id, panel.fonepayEnabled)}
                                    >
                                        {panel.fonepayEnabled ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                                        <span style={{ fontSize: '0.813rem' }}>
                                            {panel.fonepayEnabled ? 'Enabled' : 'Disabled'}
                                        </span>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Info Card */}
            <div className="card" style={{ borderLeft: '3px solid var(--primary-500)' }}>
                <div style={{ padding: '1rem 1.25rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>ℹ️ How FonePay Works</strong>
                    <ul style={{ marginTop: '0.5rem', paddingLeft: '1.25rem', lineHeight: '1.8' }}>
                        <li>Users send payment details (TXNID + Amount) via WhatsApp</li>
                        <li>System auto-verifies via your Rental Panel Admin API</li>
                        <li>Funds are credited automatically upon successful verification</li>
                        <li>All transactions are logged for audit purposes</li>
                    </ul>
                </div>
            </div>
        </div>
    )
}


// ==================== TRANSACTIONS TAB ====================

function TransactionsTab({ setError }) {
    const [loading, setLoading] = useState(true)
    const [transactions, setTransactions] = useState([])
    const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 })
    const [searchTerm, setSearchTerm] = useState('')
    const [statusFilter, setStatusFilter] = useState('all')

    const fetchTransactions = useCallback(async () => {
        try {
            setLoading(true)
            const params = new URLSearchParams({
                page: pagination.page,
                limit: 20,
                ...(statusFilter !== 'all' && { status: statusFilter }),
                ...(searchTerm && { search: searchTerm })
            })

            const res = await api.get(`/fonepay-user/transactions?${params}`)
            if (res.success) {
                setTransactions(res.data)
                setPagination(res.pagination)
            }
        } catch (err) {
            setError(err.error || err.message || 'Failed to load transactions')
        } finally {
            setLoading(false)
        }
    }, [pagination.page, statusFilter, searchTerm, setError])

    useEffect(() => {
        fetchTransactions()
    }, [fetchTransactions])

    const formatDate = (date) => {
        if (!date) return '-'
        return new Date(date).toLocaleString()
    }

    return (
        <div>
            {/* Filters */}
            <div className="fpu-filters">
                <div className="fpu-search-wrap">
                    <Search size={16} />
                    <input
                        type="text"
                        placeholder="Search TXN ID, WA number, username..."
                        value={searchTerm}
                        onChange={(e) => {
                            setSearchTerm(e.target.value)
                            setPagination(p => ({ ...p, page: 1 }))
                        }}
                        className="form-input"
                    />
                </div>
                <select
                    value={statusFilter}
                    onChange={(e) => {
                        setStatusFilter(e.target.value)
                        setPagination(p => ({ ...p, page: 1 }))
                    }}
                    className="form-input"
                    style={{ width: 'auto', minWidth: '150px' }}
                >
                    <option value="all">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="verifying">Verifying</option>
                    <option value="verified">Verified</option>
                    <option value="credited">Credited</option>
                    <option value="rejected">Rejected</option>
                    <option value="failed">Failed</option>
                </select>
                <button className="btn btn-secondary btn-sm" onClick={fetchTransactions}>
                    <RefreshCw size={14} />
                    Refresh
                </button>
            </div>

            {/* Table */}
            {loading ? (
                <div className="loading-container">
                    <Loader2 className="animate-spin" size={32} />
                    <p>Loading transactions...</p>
                </div>
            ) : transactions.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                    <CreditCard size={40} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
                    <p style={{ color: 'var(--text-secondary)' }}>No transactions found</p>
                </div>
            ) : (
                <div className="fpu-table-wrapper">
                    <table className="fpu-table">
                        <thead>
                            <tr>
                                <th>TXN ID</th>
                                <th>WA Number</th>
                                <th>Username</th>
                                <th>Amount</th>
                                <th>Status</th>
                                <th>Panel</th>
                                <th>Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            {transactions.map(txn => {
                                const statusStyle = STATUS_COLORS[txn.status] || STATUS_COLORS.pending
                                const StatusIcon = STATUS_ICONS[txn.status] || Clock
                                return (
                                    <tr key={txn.id}>
                                        <td>
                                            <code className="fpu-txn-code">{txn.txnId}</code>
                                        </td>
                                        <td>{txn.whatsappNumber}</td>
                                        <td>{txn.panelUsername}</td>
                                        <td className="fpu-amount">{txn.amountEntered?.toLocaleString()}</td>
                                        <td>
                                            <span
                                                className="fpu-status-badge"
                                                style={{
                                                    background: statusStyle.bg,
                                                    color: statusStyle.color,
                                                    border: `1px solid ${statusStyle.border}`
                                                }}
                                            >
                                                <StatusIcon size={12} />
                                                {txn.status}
                                            </span>
                                        </td>
                                        <td>{txn.panel?.alias || txn.panel?.name || '-'}</td>
                                        <td className="fpu-time">{formatDate(txn.createdAt)}</td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Pagination */}
            {pagination.totalPages > 1 && (
                <div className="fpu-pagination">
                    <button
                        className="btn btn-secondary btn-sm"
                        disabled={pagination.page <= 1}
                        onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                    >
                        Previous
                    </button>
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                        Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
                    </span>
                    <button
                        className="btn btn-secondary btn-sm"
                        disabled={pagination.page >= pagination.totalPages}
                        onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                    >
                        Next
                    </button>
                </div>
            )}
        </div>
    )
}


// ==================== STYLES ====================

const fonepayUserStyles = `
    .fpu-tabs {
        display: flex;
        gap: var(--spacing-xs);
        margin-bottom: var(--spacing-xl);
        border-bottom: 1px solid var(--border-color);
        padding-bottom: var(--spacing-xs);
    }

    .fpu-tab {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        padding: 0.625rem 1rem;
        border: none;
        background: none;
        color: var(--text-secondary);
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        border-bottom: 2px solid transparent;
        transition: all 0.2s;
        font-family: inherit;
    }

    .fpu-tab:hover {
        color: var(--text-primary);
    }

    .fpu-tab.active {
        color: var(--primary-500);
        border-bottom-color: var(--primary-500);
    }

    .fpu-settings-layout {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-lg);
    }

    .fpu-stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: var(--spacing-md);
    }

    .fpu-stat-card {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 1rem;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-lg);
    }

    .fpu-stat-icon {
        width: 44px;
        height: 44px;
        border-radius: var(--radius-md);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }

    .fpu-stat-info {
        display: flex;
        flex-direction: column;
    }

    .fpu-stat-value {
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--text-primary);
    }

    .fpu-stat-label {
        font-size: 0.75rem;
        color: var(--text-secondary);
    }

    .fpu-toggle-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.75rem 1rem;
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-lg);
    }

    .fpu-toggle-btn {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        padding: 0.375rem 0.625rem;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        background: none;
        cursor: pointer;
        color: var(--text-secondary);
        font-weight: 500;
        transition: all 0.2s;
        font-family: inherit;
    }

    .fpu-toggle-btn.active {
        color: #22c55e;
        border-color: rgba(34, 197, 94, 0.3);
        background: rgba(34, 197, 94, 0.1);
    }

    .fpu-panel-list {
        display: flex;
        flex-direction: column;
        gap: 0.625rem;
    }

    .fpu-panel-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.875rem 1rem;
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-lg);
        gap: 1rem;
    }

    .fpu-panel-info {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        min-width: 0;
    }

    .fpu-panel-name {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        font-size: 0.875rem;
    }

    .fpu-panel-url {
        font-size: 0.75rem;
        color: var(--text-secondary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .fpu-filters {
        display: flex;
        gap: var(--spacing-md);
        margin-bottom: var(--spacing-lg);
        flex-wrap: wrap;
        align-items: center;
    }

    .fpu-search-wrap {
        position: relative;
        flex: 1;
        min-width: 200px;
    }

    .fpu-search-wrap svg {
        position: absolute;
        left: 0.75rem;
        top: 50%;
        transform: translateY(-50%);
        color: var(--text-secondary);
        pointer-events: none;
    }

    .fpu-search-wrap .form-input {
        padding-left: 2.25rem;
    }

    .fpu-table-wrapper {
        overflow-x: auto;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-lg);
        background: var(--bg-secondary);
    }

    .fpu-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.8125rem;
    }

    .fpu-table th {
        text-align: left;
        padding: 0.75rem 1rem;
        font-weight: 600;
        color: var(--text-secondary);
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        border-bottom: 1px solid var(--border-color);
        white-space: nowrap;
    }

    .fpu-table td {
        padding: 0.625rem 1rem;
        border-bottom: 1px solid var(--border-color);
        vertical-align: middle;
    }

    .fpu-table tbody tr:hover {
        background: var(--bg-tertiary);
    }

    .fpu-table tbody tr:last-child td {
        border-bottom: none;
    }

    .fpu-txn-code {
        font-family: monospace;
        font-size: 0.8rem;
        background: var(--bg-tertiary);
        padding: 2px 6px;
        border-radius: var(--radius-sm);
    }

    .fpu-amount {
        font-weight: 600;
    }

    .fpu-status-badge {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0.2rem 0.5rem;
        border-radius: 999px;
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: capitalize;
    }

    .fpu-time {
        font-size: 0.8rem;
        color: var(--text-secondary);
        white-space: nowrap;
    }

    .fpu-pagination {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--spacing-md);
        margin-top: var(--spacing-lg);
    }

    .alert-success {
        display: flex;
        align-items: center;
        gap: var(--spacing-sm);
        padding: var(--spacing-sm) var(--spacing-md);
        background: rgba(34, 197, 94, 0.1);
        border: 1px solid rgba(34, 197, 94, 0.3);
        color: #22c55e;
        border-radius: var(--radius-md);
        font-size: 0.875rem;
    }
`
