import { useState, useEffect, useCallback } from 'react'
import {
    CreditCard, Search, Filter, RefreshCw, CheckCircle2, XCircle,
    AlertTriangle, Clock, Eye, X, Loader2, Settings, FileText,
    BarChart3, ArrowUpDown, ChevronLeft, ChevronRight, Download,
    ToggleLeft, ToggleRight, Shield, Activity
} from 'lucide-react'
import api from '../../services/api'

const TABS = [
    { id: 'transactions', label: 'Transactions', icon: CreditCard },
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'audit', label: 'Audit Logs', icon: FileText },
]

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

export default function FonepayManagement() {
    const [activeTab, setActiveTab] = useState('transactions')
    const [error, setError] = useState(null)
    const [success, setSuccess] = useState(null)

    // Auto-dismiss success
    useEffect(() => {
        if (success) {
            const t = setTimeout(() => setSuccess(null), 3000)
            return () => clearTimeout(t)
        }
    }, [success])

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <h1 className="page-title">💳 FonePay Management</h1>
                    <p className="page-subtitle">Manage FonePay payment verifications</p>
                </div>
            </div>

            {error && (
                <div className="fp-alert fp-alert-error">
                    <AlertTriangle size={18} />
                    <span>{error}</span>
                    <button onClick={() => setError(null)}><X size={16} /></button>
                </div>
            )}

            {success && (
                <div className="fp-alert fp-alert-success">
                    <CheckCircle2 size={18} />
                    <span>{success}</span>
                    <button onClick={() => setSuccess(null)}><X size={16} /></button>
                </div>
            )}

            {/* Tab Navigation */}
            <div className="fp-tabs">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        className={`fp-tab ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        <tab.icon size={16} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            {activeTab === 'transactions' && (
                <TransactionsTab setError={setError} setSuccess={setSuccess} />
            )}
            {activeTab === 'settings' && (
                <SettingsTab setError={setError} setSuccess={setSuccess} />
            )}
            {activeTab === 'audit' && (
                <AuditLogsTab setError={setError} setSuccess={setSuccess} />
            )}

            <style>{fonepayStyles}</style>
        </div>
    )
}

// ==================== TRANSACTIONS TAB ====================

function TransactionsTab({ setError, setSuccess }) {
    const [transactions, setTransactions] = useState([])
    const [loading, setLoading] = useState(true)
    const [stats, setStats] = useState(null)
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('all')
    const [page, setPage] = useState(1)
    const [pagination, setPagination] = useState(null)
    const [selectedTxn, setSelectedTxn] = useState(null)
    const [actionLoading, setActionLoading] = useState(false)
    const [actionModal, setActionModal] = useState(null) // { type: 'approve'|'reject', txn }
    const [actionNote, setActionNote] = useState('')

    const fetchTransactions = useCallback(async () => {
        try {
            setLoading(true)
            const params = new URLSearchParams({ page, limit: 20 })
            if (statusFilter !== 'all') params.append('status', statusFilter)
            if (search) params.append('search', search)

            const res = await api.get(`/fonepay/transactions?${params}`)
            setTransactions(res.data || [])
            setPagination(res.pagination)
        } catch (err) {
            setError(err.message || 'Failed to fetch transactions')
        } finally {
            setLoading(false)
        }
    }, [page, statusFilter, search, setError])

    const fetchStats = useCallback(async () => {
        try {
            const res = await api.get('/fonepay/stats')
            setStats(res.data)
        } catch (err) {
            console.error('Failed to fetch stats:', err)
        }
    }, [])

    useEffect(() => { fetchTransactions() }, [fetchTransactions])
    useEffect(() => { fetchStats() }, [fetchStats])

    const handleAction = async () => {
        if (!actionModal) return
        setActionLoading(true)

        try {
            const { type, txn } = actionModal
            if (type === 'approve') {
                const res = await api.post(`/fonepay/transactions/${txn.id}/approve`, { note: actionNote })
                if (res.success === false) {
                    setError(res.message || 'Approval credit failed')
                    setActionLoading(false)
                    fetchTransactions()
                    fetchStats()
                    return
                }
                setSuccess(res.message || `Transaction ${txn.txnId} approved`)
            } else {
                if (!actionNote.trim()) {
                    setError('Rejection reason is required')
                    setActionLoading(false)
                    return
                }
                await api.post(`/fonepay/transactions/${txn.id}/reject`, { reason: actionNote })
                setSuccess(`Transaction ${txn.txnId} rejected`)
            }
            setActionModal(null)
            setActionNote('')
            fetchTransactions()
            fetchStats()
        } catch (err) {
            setError(err?.error || err?.message || (typeof err === 'string' ? err : 'Action failed'))
        } finally {
            setActionLoading(false)
        }
    }

    return (
        <>
            {/* Stats Cards */}
            {stats && (
                <div className="fp-stats-grid">
                    <div className="fp-stat-card">
                        <div className="fp-stat-icon" style={{ background: 'rgba(96, 165, 250, 0.1)', color: '#60a5fa' }}>
                            <Activity size={20} />
                        </div>
                        <div className="fp-stat-info">
                            <span className="fp-stat-value">{stats.today.count}</span>
                            <span className="fp-stat-label">Today</span>
                        </div>
                        <div className="fp-stat-amount">{stats.today.totalAmount.toLocaleString()}</div>
                    </div>
                    <div className="fp-stat-card">
                        <div className="fp-stat-icon" style={{ background: 'rgba(52, 211, 153, 0.1)', color: '#34d399' }}>
                            <BarChart3 size={20} />
                        </div>
                        <div className="fp-stat-info">
                            <span className="fp-stat-value">{stats.week.count}</span>
                            <span className="fp-stat-label">This Week</span>
                        </div>
                        <div className="fp-stat-amount">{stats.week.totalAmount.toLocaleString()}</div>
                    </div>
                    <div className="fp-stat-card">
                        <div className="fp-stat-icon" style={{ background: 'rgba(251, 191, 36, 0.1)', color: '#fbbf24' }}>
                            <CreditCard size={20} />
                        </div>
                        <div className="fp-stat-info">
                            <span className="fp-stat-value">{stats.month.count}</span>
                            <span className="fp-stat-label">This Month</span>
                        </div>
                        <div className="fp-stat-amount">{stats.month.totalAmount.toLocaleString()}</div>
                    </div>
                    <div className="fp-stat-card">
                        <div className="fp-stat-icon" style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e' }}>
                            <Shield size={20} />
                        </div>
                        <div className="fp-stat-info">
                            <span className="fp-stat-value">{stats.successRate}%</span>
                            <span className="fp-stat-label">Success Rate</span>
                        </div>
                        <div className="fp-stat-amount">{stats.recentFailures} failures today</div>
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="fp-filters">
                <div className="search-box">
                    <Search size={18} />
                    <input
                        type="text"
                        placeholder="Search TXN ID, WA number, username..."
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                    />
                </div>
                <select
                    className="form-input fp-select"
                    value={statusFilter}
                    onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
                >
                    <option value="all">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="verifying">Verifying</option>
                    <option value="verified">Verified</option>
                    <option value="credited">Credited</option>
                    <option value="rejected">Rejected</option>
                    <option value="failed">Failed</option>
                    <option value="credit_unconfirmed">Credit Unconfirmed ⚠️</option>
                </select>
                <button className="btn btn-secondary btn-sm" onClick={() => { fetchTransactions(); fetchStats() }}>
                    <RefreshCw size={16} />
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
                <div className="empty-state">
                    <CreditCard size={64} style={{ color: 'var(--text-secondary)' }} />
                    <h3>No Transactions</h3>
                    <p>FonePay transactions will appear here</p>
                </div>
            ) : (
                <>
                    <div className="fp-table-wrapper">
                        <table className="fp-table">
                            <thead>
                                <tr>
                                    <th>Status</th>
                                    <th>TXN ID</th>
                                    <th>WA Number</th>
                                    <th>Username</th>
                                    <th>Amount</th>
                                    <th>Panel</th>
                                    <th>Time</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {transactions.map(txn => {
                                    const statusStyle = STATUS_COLORS[txn.status] || STATUS_COLORS.pending
                                    const StatusIcon = STATUS_ICONS[txn.status] || Clock
                                    return (
                                        <tr key={txn.id}>
                                            <td>
                                                <span className="fp-status-badge" style={{
                                                    background: statusStyle.bg,
                                                    color: statusStyle.color,
                                                    border: `1px solid ${statusStyle.border}`
                                                }}>
                                                    <StatusIcon size={14} />
                                                    {txn.status}
                                                </span>
                                            </td>
                                            <td><code className="fp-txn-code">{txn.txnId}</code></td>
                                            <td>{txn.whatsappNumber}</td>
                                            <td><strong>{txn.panelUsername}</strong></td>
                                            <td className="fp-amount">
                                                {txn.amountEntered.toLocaleString()}
                                                {txn.amountVerified && txn.amountVerified !== txn.amountEntered && (
                                                    <span className="fp-amount-mismatch"> ({txn.amountVerified})</span>
                                                )}
                                            </td>
                                            <td>{txn.panel?.alias || txn.panel?.name || '—'}</td>
                                            <td className="fp-time">{new Date(txn.createdAt).toLocaleString()}</td>
                                            <td>
                                                <div className="fp-actions">
                                                    <button className="btn btn-ghost btn-sm" onClick={() => setSelectedTxn(txn)} title="View details">
                                                        <Eye size={16} />
                                                    </button>
                                                    {txn.status !== 'credited' && txn.status !== 'credit_unconfirmed' && (
                                                        <>
                                                            <button
                                                                className="btn btn-ghost btn-sm fp-btn-approve"
                                                                onClick={() => { setActionModal({ type: 'approve', txn }); setActionNote('') }}
                                                                title="Approve"
                                                            >
                                                                <CheckCircle2 size={16} />
                                                            </button>
                                                            <button
                                                                className="btn btn-ghost btn-sm fp-btn-reject"
                                                                onClick={() => { setActionModal({ type: 'reject', txn }); setActionNote('') }}
                                                                title="Reject"
                                                            >
                                                                <XCircle size={16} />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {pagination && pagination.totalPages > 1 && (
                        <div className="fp-pagination">
                            <span>{pagination.total} transactions</span>
                            <div className="fp-pagination-controls">
                                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={16} /></button>
                                <span>Page {page} of {pagination.totalPages}</span>
                                <button disabled={page >= pagination.totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight size={16} /></button>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Detail Modal */}
            {selectedTxn && (
                <div className="modal-overlay open" onClick={() => setSelectedTxn(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Transaction Details</h2>
                            <button className="modal-close" onClick={() => setSelectedTxn(null)}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            <div className="fp-detail-grid">
                                <DetailRow label="TXN ID" value={selectedTxn.txnId} mono />
                                <DetailRow label="Status" value={selectedTxn.status} />
                                <DetailRow label="WA Number" value={selectedTxn.whatsappNumber} />
                                <DetailRow label="Username" value={selectedTxn.panelUsername} />
                                <DetailRow label="Amount Entered" value={selectedTxn.amountEntered} />
                                <DetailRow label="Amount Verified" value={selectedTxn.amountVerified || '—'} />
                                <DetailRow label="Panel" value={selectedTxn.panel?.alias || selectedTxn.panel?.name || '—'} />
                                <DetailRow label="Source" value={selectedTxn.source} />
                                <DetailRow label="Created" value={new Date(selectedTxn.createdAt).toLocaleString()} />
                                {selectedTxn.verifiedAt && <DetailRow label="Verified At" value={new Date(selectedTxn.verifiedAt).toLocaleString()} />}
                                {selectedTxn.creditedAt && <DetailRow label="Credited At" value={new Date(selectedTxn.creditedAt).toLocaleString()} />}
                                {selectedTxn.rejectionReason && <DetailRow label="Rejection Reason" value={selectedTxn.rejectionReason} />}
                                {selectedTxn.adminActionBy && <DetailRow label="Admin Action By" value={selectedTxn.adminActionBy} />}
                                {selectedTxn.adminNote && <DetailRow label="Admin Note" value={selectedTxn.adminNote} />}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Approve/Reject Modal */}
            {actionModal && (
                <div className="modal-overlay open" onClick={() => setActionModal(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{actionModal.type === 'approve' ? '✅ Approve Transaction' : '❌ Reject Transaction'}</h2>
                            <button className="modal-close" onClick={() => setActionModal(null)}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            <div className="fp-detail-grid" style={{ marginBottom: 'var(--spacing-lg)' }}>
                                <DetailRow label="TXN ID" value={actionModal.txn.txnId} mono />
                                <DetailRow label="Username" value={actionModal.txn.panelUsername} />
                                <DetailRow label="Amount" value={actionModal.txn.amountEntered} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">
                                    {actionModal.type === 'approve' ? 'Note (optional)' : 'Reason (required)'}
                                </label>
                                <textarea
                                    className="form-input"
                                    value={actionNote}
                                    onChange={(e) => setActionNote(e.target.value)}
                                    placeholder={actionModal.type === 'approve' ? 'Optional note...' : 'Reason for rejection...'}
                                    rows={3}
                                    required={actionModal.type === 'reject'}
                                />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setActionModal(null)}>Cancel</button>
                            <button
                                className={`btn ${actionModal.type === 'approve' ? 'btn-primary' : 'btn-danger'}`}
                                onClick={handleAction}
                                disabled={actionLoading}
                            >
                                {actionLoading ? <Loader2 className="animate-spin" size={18} /> :
                                    actionModal.type === 'approve' ? 'Approve & Credit' : 'Reject'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

// ==================== SETTINGS TAB ====================

function SettingsTab({ setError, setSuccess }) {
    const [settings, setSettings] = useState(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [globalForm, setGlobalForm] = useState({
        enabled: false,
        maxAttemptsPerHour: 5,
        paymentExpiryHours: 24
    })

    useEffect(() => {
        fetchSettings()
    }, [])

    const fetchSettings = async () => {
        try {
            setLoading(true)
            const res = await api.get('/fonepay/settings')
            setSettings(res.data)
            if (res.data?.global) {
                setGlobalForm({
                    enabled: res.data.global.enabled,
                    maxAttemptsPerHour: res.data.global.maxAttemptsPerHour,
                    paymentExpiryHours: res.data.global.paymentExpiryHours
                })
            }
        } catch (err) {
            setError(err?.error || err?.message || 'Failed to fetch settings')
        } finally {
            setLoading(false)
        }
    }

    const togglePanel = async (panelId, currentEnabled) => {
        try {
            await api.patch(`/fonepay/panels/${panelId}/toggle`, { enabled: !currentEnabled })
            setSuccess(`FonePay ${!currentEnabled ? 'enabled' : 'disabled'} for panel`)
            fetchSettings()
        } catch (err) {
            setError(err?.error || err?.message || 'Failed to toggle')
        }
    }

    const saveGlobalSettings = async () => {
        try {
            setSaving(true)
            await api.patch('/fonepay/settings', globalForm)
            setSuccess('Global settings saved')
            fetchSettings()
        } catch (err) {
            setError(err?.error || err?.message || 'Failed to save settings')
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <div className="loading-container">
                <Loader2 className="animate-spin" size={32} />
                <p>Loading settings...</p>
            </div>
        )
    }

    if (!settings) return null

    return (
        <div className="fp-settings">
            {/* Global Toggle */}
            <div className="fp-settings-section">
                <h3>🌐 Global FonePay</h3>
                <p className="fp-settings-desc">Master toggle and global configuration for FonePay verification</p>

                <div className="fp-panel-item" style={{ marginBottom: 'var(--spacing-lg)' }}>
                    <div className="fp-panel-info">
                        <strong>FonePay Verification System</strong>
                        <span className="fp-panel-endpoints">
                            {globalForm.enabled ? 'System is accepting FonePay verifications' : 'All FonePay verifications are disabled'}
                        </span>
                    </div>
                    <button
                        className={`fp-toggle-btn ${globalForm.enabled ? 'active' : ''}`}
                        onClick={() => setGlobalForm(f => ({ ...f, enabled: !f.enabled }))}
                    >
                        {globalForm.enabled ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                        {globalForm.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                </div>

                <div className="fp-global-fields">
                    <div className="form-group">
                        <label className="form-label">Max Verification Attempts / Hour / Number</label>
                        <input
                            type="number"
                            className="form-input"
                            value={globalForm.maxAttemptsPerHour}
                            onChange={(e) => setGlobalForm(f => ({ ...f, maxAttemptsPerHour: parseInt(e.target.value) || 5 }))}
                            min={1}
                            max={100}
                            style={{ maxWidth: '200px' }}
                        />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Payment Expiry (hours)</label>
                        <input
                            type="number"
                            className="form-input"
                            value={globalForm.paymentExpiryHours}
                            onChange={(e) => setGlobalForm(f => ({ ...f, paymentExpiryHours: parseInt(e.target.value) || 24 }))}
                            min={1}
                            max={720}
                            style={{ maxWidth: '200px' }}
                        />
                    </div>
                    <button className="btn btn-primary" onClick={saveGlobalSettings} disabled={saving}>
                        {saving ? <Loader2 className="animate-spin" size={18} /> : 'Save Global Settings'}
                    </button>
                </div>
            </div>

            {/* Per-Panel Settings */}
            <div className="fp-settings-section">
                <h3>📡 Per-Panel FonePay Status</h3>
                <p className="fp-settings-desc">Enable/disable FonePay for each Rental Panel</p>

                {settings.panels.length === 0 ? (
                    <div className="fp-empty-panels">
                        <p>No Rental Panels found. FonePay only works with Rental Panels.</p>
                    </div>
                ) : (
                    <div className="fp-panel-list">
                        {settings.panels.map(panel => (
                            <div key={panel.id} className="fp-panel-item">
                                <div className="fp-panel-info">
                                    <strong>{panel.alias || panel.name}</strong>
                                    <span className="fp-panel-endpoints">
                                        Verify: {panel.fonepayVerifyEndpoint || '/adminapi/verify-payment'}
                                        {' | '}
                                        Fund: {panel.fonepayAddFundEndpoint || '/adminapi/add-fund'}
                                    </span>
                                </div>
                                <button
                                    className={`fp-toggle-btn ${panel.fonepayEnabled ? 'active' : ''}`}
                                    onClick={() => togglePanel(panel.id, panel.fonepayEnabled)}
                                >
                                    {panel.fonepayEnabled ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                                    {panel.fonepayEnabled ? 'Enabled' : 'Disabled'}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

// ==================== AUDIT LOGS TAB ====================

function AuditLogsTab({ setError }) {
    const [logs, setLogs] = useState([])
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [pagination, setPagination] = useState(null)
    const [search, setSearch] = useState('')
    const [resultFilter, setResultFilter] = useState('all')

    const fetchLogs = useCallback(async () => {
        try {
            setLoading(true)
            const params = new URLSearchParams({ page, limit: 50 })
            if (resultFilter !== 'all') params.append('result', resultFilter)
            if (search) params.append('search', search)

            const res = await api.get(`/fonepay/audit-logs?${params}`)
            setLogs(res.data || [])
            setPagination(res.pagination)
        } catch (err) {
            setError(err?.error || err?.message || 'Failed to fetch audit logs')
        } finally {
            setLoading(false)
        }
    }, [page, resultFilter, search, setError])

    useEffect(() => { fetchLogs() }, [fetchLogs])

    const exportCSV = () => {
        const escapeCSV = (val) => {
            const str = String(val ?? '')
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`
            }
            return str
        }
        const headers = ['Time', 'TXN ID', 'WA Number', 'Username', 'Amount Entered', 'API Amount', 'Result', 'Reason']
        const rows = logs.map(l => [
            new Date(l.createdAt).toISOString(),
            l.txnId, l.whatsappNumber, l.panelUsername,
            l.amountEntered, l.amountFromApi || '',
            l.verificationResult, l.failureReason || ''
        ])
        const csv = [headers, ...rows].map(r => r.map(escapeCSV).join(',')).join('\n')
        const blob = new Blob([csv], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `fonepay-audit-${new Date().toISOString().split('T')[0]}.csv`
        a.click()
        URL.revokeObjectURL(url)
    }

    const resultColors = {
        success: '#22c55e',
        txn_not_found: '#ef4444',
        txn_status_invalid: '#f97316',
        txn_expired: '#f97316',
        cross_panel: '#ef4444',
        amount_mismatch: '#f97316',
        already_used: '#a855f7',
        api_error: '#ef4444',
        mapping_not_found: '#6b7280',
        rate_limited: '#fbbf24',
        suspicious_activity: '#ef4444',
        credit_failed: '#ef4444',
        credit_unconfirmed: '#fb923c',
        manual_approve_credited: '#22c55e',
        manual_approve_credit_failed: '#ef4444',
        manual_reject: '#ef4444',
    }

    return (
        <>
            <div className="fp-filters">
                <div className="search-box">
                    <Search size={18} />
                    <input
                        type="text"
                        placeholder="Search TXN ID, WA number..."
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                    />
                </div>
                <select
                    className="form-input fp-select"
                    value={resultFilter}
                    onChange={(e) => { setResultFilter(e.target.value); setPage(1) }}
                >
                    <option value="all">All Results</option>
                    <option value="success">Success</option>
                    <option value="txn_not_found">TXN Not Found</option>
                    <option value="txn_status_invalid">TXN Status Invalid</option>
                    <option value="txn_expired">TXN Expired</option>
                    <option value="amount_mismatch">Amount Mismatch</option>
                    <option value="already_used">Already Used</option>
                    <option value="rate_limited">Rate Limited</option>
                    <option value="mapping_not_found">No Mapping</option>
                    <option value="suspicious_activity">Suspicious Activity</option>
                    <option value="api_error">API Error</option>
                    <option value="credit_failed">Credit Failed</option>
                    <option value="credit_unconfirmed">Credit Unconfirmed ⚠️</option>
                </select>
                <button className="btn btn-secondary btn-sm" onClick={exportCSV}>
                    <Download size={16} />
                    Export CSV
                </button>
                <button className="btn btn-secondary btn-sm" onClick={fetchLogs}>
                    <RefreshCw size={16} />
                </button>
            </div>

            {loading ? (
                <div className="loading-container">
                    <Loader2 className="animate-spin" size={32} />
                    <p>Loading audit logs...</p>
                </div>
            ) : logs.length === 0 ? (
                <div className="empty-state">
                    <FileText size={64} style={{ color: 'var(--text-secondary)' }} />
                    <h3>No Audit Logs</h3>
                    <p>Verification attempts will be logged here</p>
                </div>
            ) : (
                <>
                    <div className="fp-table-wrapper">
                        <table className="fp-table fp-table-compact">
                            <thead>
                                <tr>
                                    <th>Time</th>
                                    <th>Result</th>
                                    <th>TXN ID</th>
                                    <th>WA Number</th>
                                    <th>Username</th>
                                    <th>Amount</th>
                                    <th>API Amount</th>
                                    <th>Reason</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map(log => (
                                    <tr key={log.id} style={log.verificationResult !== 'success' ? { background: 'rgba(239,68,68,0.03)' } : {}}>
                                        <td className="fp-time">{new Date(log.createdAt).toLocaleString()}</td>
                                        <td>
                                            <span className="fp-result-badge" style={{
                                                color: resultColors[log.verificationResult] || '#6b7280'
                                            }}>
                                                {log.verificationResult}
                                            </span>
                                        </td>
                                        <td><code className="fp-txn-code">{log.txnId}</code></td>
                                        <td>{log.whatsappNumber}</td>
                                        <td>{log.panelUsername}</td>
                                        <td>{log.amountEntered}</td>
                                        <td>{log.amountFromApi || '—'}</td>
                                        <td className="fp-reason">{log.failureReason || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {pagination && pagination.totalPages > 1 && (
                        <div className="fp-pagination">
                            <span>{pagination.total} logs</span>
                            <div className="fp-pagination-controls">
                                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={16} /></button>
                                <span>Page {page} of {pagination.totalPages}</span>
                                <button disabled={page >= pagination.totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight size={16} /></button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </>
    )
}

// ==================== HELPER COMPONENTS ====================

function DetailRow({ label, value, mono }) {
    return (
        <div className="fp-detail-row">
            <span className="fp-detail-label">{label}</span>
            <span className={`fp-detail-value ${mono ? 'mono' : ''}`}>{value}</span>
        </div>
    )
}

// ==================== STYLES ====================

const fonepayStyles = `
    .fp-tabs {
        display: flex;
        gap: var(--spacing-xs);
        margin-bottom: var(--spacing-xl);
        border-bottom: 1px solid var(--border-color);
        padding-bottom: var(--spacing-xs);
    }

    .fp-tab {
        display: flex;
        align-items: center;
        gap: var(--spacing-xs);
        padding: var(--spacing-sm) var(--spacing-lg);
        background: none;
        border: none;
        border-radius: var(--radius-md) var(--radius-md) 0 0;
        cursor: pointer;
        color: var(--text-secondary);
        font-size: 0.9rem;
        transition: all 0.2s;
    }

    .fp-tab:hover {
        color: var(--text-primary);
        background: var(--bg-secondary);
    }

    .fp-tab.active {
        color: var(--primary-500);
        border-bottom: 2px solid var(--primary-500);
        font-weight: 600;
    }

    .fp-alert {
        display: flex;
        align-items: center;
        gap: var(--spacing-sm);
        padding: var(--spacing-md);
        border-radius: var(--radius-md);
        margin-bottom: var(--spacing-lg);
    }

    .fp-alert button {
        margin-left: auto;
        background: none;
        border: none;
        cursor: pointer;
        color: inherit;
    }

    .fp-alert-error {
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.3);
        color: #ef4444;
    }

    .fp-alert-success {
        background: rgba(34, 197, 94, 0.1);
        border: 1px solid rgba(34, 197, 94, 0.3);
        color: #22c55e;
    }

    .fp-stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: var(--spacing-md);
        margin-bottom: var(--spacing-xl);
    }

    .fp-stat-card {
        display: flex;
        align-items: center;
        gap: var(--spacing-md);
        padding: var(--spacing-lg);
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-lg);
    }

    .fp-stat-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border-radius: var(--radius-md);
    }

    .fp-stat-info {
        flex: 1;
        display: flex;
        flex-direction: column;
    }

    .fp-stat-value {
        font-size: 1.25rem;
        font-weight: 700;
    }

    .fp-stat-label {
        font-size: 0.75rem;
        color: var(--text-secondary);
    }

    .fp-stat-amount {
        font-size: 0.8rem;
        color: var(--text-secondary);
    }

    .fp-filters {
        display: flex;
        gap: var(--spacing-md);
        margin-bottom: var(--spacing-lg);
        flex-wrap: wrap;
        align-items: center;
    }

    .fp-select {
        width: auto;
        min-width: 150px;
    }

    .fp-table-wrapper {
        overflow-x: auto;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-lg);
        background: var(--bg-secondary);
    }

    .fp-table {
        width: 100%;
        border-collapse: collapse;
    }

    .fp-table th {
        text-align: left;
        padding: var(--spacing-md);
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-secondary);
        border-bottom: 1px solid var(--border-color);
        background: var(--bg-tertiary);
    }

    .fp-table td {
        padding: var(--spacing-md);
        border-bottom: 1px solid var(--border-color);
        font-size: 0.875rem;
    }

    .fp-table tr:last-child td {
        border-bottom: none;
    }

    .fp-table-compact td {
        padding: var(--spacing-sm) var(--spacing-md);
    }

    .fp-status-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 10px;
        border-radius: 999px;
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: capitalize;
    }

    .fp-result-badge {
        font-size: 0.75rem;
        font-weight: 600;
    }

    .fp-txn-code {
        font-family: monospace;
        font-size: 0.8rem;
        background: var(--bg-tertiary);
        padding: 2px 6px;
        border-radius: var(--radius-sm);
    }

    .fp-amount {
        font-weight: 600;
    }

    .fp-amount-mismatch {
        color: #f97316;
        font-size: 0.75rem;
    }

    .fp-time {
        font-size: 0.8rem;
        color: var(--text-secondary);
        white-space: nowrap;
    }

    .fp-reason {
        max-width: 200px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 0.8rem;
        color: var(--text-secondary);
    }

    .fp-actions {
        display: flex;
        gap: 2px;
    }

    .fp-btn-approve:hover { color: #22c55e !important; }
    .fp-btn-reject:hover { color: #ef4444 !important; }

    .btn-danger {
        background: #ef4444;
        color: white;
        border: none;
    }
    .btn-danger:hover {
        background: #dc2626;
    }

    .fp-pagination {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--spacing-md) 0;
        color: var(--text-secondary);
        font-size: 0.875rem;
    }

    .fp-pagination-controls {
        display: flex;
        align-items: center;
        gap: var(--spacing-sm);
    }

    .fp-pagination-controls button {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        background: var(--bg-secondary);
        cursor: pointer;
        color: var(--text-primary);
    }

    .fp-pagination-controls button:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }

    .fp-detail-grid {
        display: grid;
        gap: var(--spacing-sm);
    }

    .fp-detail-row {
        display: flex;
        justify-content: space-between;
        padding: var(--spacing-sm) 0;
        border-bottom: 1px solid var(--border-color);
    }

    .fp-detail-row:last-child {
        border-bottom: none;
    }

    .fp-detail-label {
        color: var(--text-secondary);
        font-size: 0.875rem;
    }

    .fp-detail-value {
        font-weight: 500;
    }

    .fp-detail-value.mono {
        font-family: monospace;
    }

    .fp-settings {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-xl);
    }

    .fp-global-fields {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-md);
        max-width: 400px;
    }

    .fp-settings-section {
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-lg);
        padding: var(--spacing-xl);
    }

    .fp-settings-section h3 {
        margin-bottom: var(--spacing-xs);
    }

    .fp-settings-desc {
        color: var(--text-secondary);
        font-size: 0.875rem;
        margin-bottom: var(--spacing-lg);
    }

    .fp-panel-list {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-md);
    }

    .fp-panel-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--spacing-md);
        background: var(--bg-tertiary);
        border-radius: var(--radius-md);
        border: 1px solid var(--border-color);
    }

    .fp-panel-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .fp-panel-endpoints {
        font-size: 0.75rem;
        color: var(--text-secondary);
        font-family: monospace;
    }

    .fp-toggle-btn {
        display: flex;
        align-items: center;
        gap: var(--spacing-xs);
        padding: var(--spacing-sm) var(--spacing-md);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        background: var(--bg-secondary);
        cursor: pointer;
        color: var(--text-secondary);
        font-weight: 500;
        transition: all 0.2s;
    }

    .fp-toggle-btn.active {
        color: #22c55e;
        border-color: rgba(34, 197, 94, 0.3);
        background: rgba(34, 197, 94, 0.1);
    }

    .fp-empty-panels {
        text-align: center;
        padding: var(--spacing-xl);
        color: var(--text-secondary);
    }

    .loading-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: var(--spacing-3xl);
        color: var(--text-secondary);
    }

    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: var(--spacing-3xl);
        text-align: center;
    }

    .empty-state h3 {
        margin-top: var(--spacing-lg);
        margin-bottom: var(--spacing-sm);
    }

    .empty-state p {
        color: var(--text-secondary);
    }
`
