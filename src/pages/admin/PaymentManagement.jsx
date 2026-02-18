import { useState, useEffect, useMemo } from 'react'
import {
    CreditCard, CheckCircle2, XCircle, Clock, Eye,
    Loader2, AlertCircle, X, Search, DollarSign,
    TrendingUp, Calendar, ChevronLeft, ChevronRight,
    ArrowUpDown, User, Hash, RefreshCw
} from 'lucide-react'
import api from '../../services/api'

export default function PaymentManagement() {
    const [payments, setPayments] = useState([])
    const [loading, setLoading] = useState(true)
    const [statusFilter, setStatusFilter] = useState('COMPLETED')
    const [searchQuery, setSearchQuery] = useState('')
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')
    const [sortField, setSortField] = useState('createdAt')
    const [sortDir, setSortDir] = useState('desc')
    const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 0 })
    const [selectedPayment, setSelectedPayment] = useState(null)
    const [showModal, setShowModal] = useState(false)
    const [error, setError] = useState(null)
    const [success, setSuccess] = useState(null)
    const [actionLoading, setActionLoading] = useState(false)
    const [rejectReason, setRejectReason] = useState('')
    const [stats, setStats] = useState({ completed: 0, pending: 0, rejected: 0, all: 0 })
    const [refreshKey, setRefreshKey] = useState(0)

    useEffect(() => {
        fetchPayments()
    }, [pagination.page, statusFilter, refreshKey])

    // Fetch stats only on mount
    useEffect(() => {
        fetchStats()
    }, [])

    useEffect(() => {
        if (success || error) {
            const t = setTimeout(() => { setSuccess(null); setError(null) }, 4000)
            return () => clearTimeout(t)
        }
    }, [success, error])

    const fetchPayments = async () => {
        try {
            setLoading(true)
            const params = new URLSearchParams({
                page: pagination.page.toString(),
                limit: pagination.limit.toString()
            })
            if (statusFilter) params.append('status', statusFilter)

            const res = await api.get(`/wallet/admin/payments?${params}`)
            const data = res.data || []
            setPayments(data)
            if (res.pagination) {
                setPagination(prev => ({
                    ...prev,
                    total: res.pagination.total,
                    totalPages: res.pagination.totalPages || Math.ceil(res.pagination.total / prev.limit)
                }))
            }
        } catch (err) {
            setError(err.error?.message || err.message || 'Failed to fetch payments')
        } finally {
            setLoading(false)
        }
    }

    const fetchStats = async () => {
        try {
            // Get counts for each status
            const [completedRes, pendingRes, rejectedRes, allRes] = await Promise.all([
                api.get('/wallet/admin/payments?status=COMPLETED&limit=1'),
                api.get('/wallet/admin/payments?status=PENDING&limit=1'),
                api.get('/wallet/admin/payments?status=REJECTED&limit=1'),
                api.get('/wallet/admin/payments?limit=1'),
            ])
            setStats({
                completed: completedRes.pagination?.total || 0,
                pending: pendingRes.pagination?.total || 0,
                rejected: rejectedRes.pagination?.total || 0,
                all: allRes.pagination?.total || 0,
            })
        } catch { /* ignore stats error */ }
    }

    // Client-side search filter (within loaded page)
    const filteredPayments = useMemo(() => {
        if (!searchQuery.trim()) return payments
        const q = searchQuery.toLowerCase()
        return payments.filter(p =>
            p.reference?.toLowerCase().includes(q) ||
            p.user?.name?.toLowerCase().includes(q) ||
            p.user?.username?.toLowerCase().includes(q) ||
            p.user?.email?.toLowerCase().includes(q) ||
            p.method?.toLowerCase().includes(q) ||
            String(p.amount).includes(q)
        )
    }, [payments, searchQuery])

    // Client-side date filter
    const dateFilteredPayments = useMemo(() => {
        let result = filteredPayments
        if (dateFrom) {
            const from = new Date(dateFrom)
            result = result.filter(p => new Date(p.createdAt) >= from)
        }
        if (dateTo) {
            const to = new Date(dateTo)
            to.setHours(23, 59, 59, 999)
            result = result.filter(p => new Date(p.createdAt) <= to)
        }
        return result
    }, [filteredPayments, dateFrom, dateTo])

    // Client-side sort
    const sortedPayments = useMemo(() => {
        const sorted = [...dateFilteredPayments]
        sorted.sort((a, b) => {
            let valA, valB
            switch (sortField) {
                case 'amount': valA = a.amount; valB = b.amount; break
                case 'createdAt': valA = new Date(a.createdAt); valB = new Date(b.createdAt); break
                case 'user': valA = (a.user?.name || '').toLowerCase(); valB = (b.user?.name || '').toLowerCase(); break
                default: valA = a.createdAt; valB = b.createdAt
            }
            if (valA < valB) return sortDir === 'asc' ? -1 : 1
            if (valA > valB) return sortDir === 'asc' ? 1 : -1
            return 0
        })
        return sorted
    }, [dateFilteredPayments, sortField, sortDir])

    const handleApprove = async (paymentId) => {
        setActionLoading(true)
        try {
            await api.put(`/wallet/admin/payments/${paymentId}/approve`)
            setSuccess('Payment approved successfully')
            setError(null)
            fetchPayments()
            fetchStats()
            setShowModal(false)
        } catch (err) {
            setError(err.error?.message || err.message || 'Failed to approve')
            setSuccess(null)
        } finally {
            setActionLoading(false)
        }
    }

    const handleReject = async (paymentId) => {
        setActionLoading(true)
        try {
            await api.put(`/wallet/admin/payments/${paymentId}/reject`, {
                reason: rejectReason
            })
            setSuccess('Payment rejected')
            setError(null)
            fetchPayments()
            fetchStats()
            setShowModal(false)
            setRejectReason('')
        } catch (err) {
            setError(err.error?.message || err.message || 'Failed to reject')
            setSuccess(null)
        } finally {
            setActionLoading(false)
        }
    }

    const openPaymentModal = (payment) => {
        setSelectedPayment(payment)
        setShowModal(true)
        setRejectReason('')
    }

    const toggleSort = (field) => {
        if (sortField === field) {
            setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
        } else {
            setSortField(field)
            setSortDir('desc')
        }
    }

    const formatCurrency = (amount) => `$${(amount || 0).toFixed(2)}`
    const formatDate = (date) => {
        const d = new Date(date)
        return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    }
    const formatTime = (date) => {
        const d = new Date(date)
        return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    }

    const statusConfig = {
        COMPLETED: { bg: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: 'rgba(16, 185, 129, 0.25)', icon: CheckCircle2, label: 'Completed' },
        PENDING: { bg: 'rgba(251, 191, 36, 0.1)', color: '#fbbf24', border: 'rgba(251, 191, 36, 0.25)', icon: Clock, label: 'Pending' },
        REJECTED: { bg: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'rgba(239, 68, 68, 0.25)', icon: XCircle, label: 'Rejected' },
        FAILED: { bg: 'rgba(156, 163, 175, 0.1)', color: '#9ca3af', border: 'rgba(156, 163, 175, 0.25)', icon: XCircle, label: 'Failed' },
        CANCELLED: { bg: 'rgba(156, 163, 175, 0.1)', color: '#6b7280', border: 'rgba(156, 163, 175, 0.25)', icon: XCircle, label: 'Cancelled' }
    }

    const getStatusBadge = (status) => {
        const cfg = statusConfig[status] || statusConfig.PENDING
        const Icon = cfg.icon
        return (
            <span className="pm-status" style={{ background: cfg.bg, color: cfg.color, borderColor: cfg.border }}>
                <Icon size={12} />
                {cfg.label}
            </span>
        )
    }

    const getMethodBadge = (method) => {
        const colors = {
            BINANCE: '#F0B90B',
            CRYPTOMUS: '#6366f1',
            ESEWA: '#60BB46',
            TIKKART: '#3b82f6',
            MANUAL: '#8b5cf6',
            BANK_TRANSFER: '#0ea5e9',
            CRYPTO: '#f59e0b',
            VOUCHER: '#10b981'
        }
        return (
            <span className="pm-method" style={{ color: colors[method] || '#9ca3af' }}>
                {method?.replaceAll('_', ' ') || '—'}
            </span>
        )
    }

    return (
        <div className="pm-page">
            {/* Header */}
            <div className="pm-header">
                <div className="pm-header-left">
                    <div className="pm-header-icon">
                        <CreditCard size={28} />
                    </div>
                    <div>
                        <h1>Payment Management</h1>
                        <p>Monitor and manage all payment transactions</p>
                    </div>
                </div>
                <button className="pm-btn pm-btn-ghost" onClick={() => { setPagination(p => ({ ...p, page: 1 })); setRefreshKey(k => k + 1); fetchStats() }}>
                    <RefreshCw size={16} /> Refresh
                </button>
            </div>

            {/* Notifications */}
            {error && (
                <div className="pm-alert pm-alert-error">
                    <AlertCircle size={18} />
                    <span>{error}</span>
                    <button onClick={() => setError(null)}><X size={14} /></button>
                </div>
            )}
            {success && (
                <div className="pm-alert pm-alert-success">
                    <CheckCircle2 size={18} />
                    <span>{success}</span>
                </div>
            )}

            {/* Stats Cards */}
            <div className="pm-stats">
                <div className={`pm-stat-card ${statusFilter === 'COMPLETED' ? 'active' : ''}`} onClick={() => { setStatusFilter('COMPLETED'); setPagination(p => ({ ...p, page: 1 })) }}>
                    <div className="pm-stat-icon" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                        <CheckCircle2 size={20} />
                    </div>
                    <div className="pm-stat-info">
                        <span className="pm-stat-label">Completed</span>
                        <span className="pm-stat-value">{stats.completed}</span>
                    </div>
                </div>
                <div className={`pm-stat-card ${statusFilter === 'PENDING' ? 'active' : ''}`} onClick={() => { setStatusFilter('PENDING'); setPagination(p => ({ ...p, page: 1 })) }}>
                    <div className="pm-stat-icon" style={{ background: 'linear-gradient(135deg, #fbbf24, #d97706)' }}>
                        <Clock size={20} />
                    </div>
                    <div className="pm-stat-info">
                        <span className="pm-stat-label">Pending</span>
                        <span className="pm-stat-value">{stats.pending}</span>
                        {stats.pending > 0 && <span className="pm-stat-alert">{stats.pending} awaiting</span>}
                    </div>
                </div>
                <div className={`pm-stat-card ${statusFilter === 'REJECTED' ? 'active' : ''}`} onClick={() => { setStatusFilter('REJECTED'); setPagination(p => ({ ...p, page: 1 })) }}>
                    <div className="pm-stat-icon" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
                        <XCircle size={20} />
                    </div>
                    <div className="pm-stat-info">
                        <span className="pm-stat-label">Rejected</span>
                        <span className="pm-stat-value">{stats.rejected}</span>
                    </div>
                </div>
                <div className={`pm-stat-card ${statusFilter === '' ? 'active' : ''}`} onClick={() => { setStatusFilter(''); setPagination(p => ({ ...p, page: 1 })) }}>
                    <div className="pm-stat-icon" style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)' }}>
                        <TrendingUp size={20} />
                    </div>
                    <div className="pm-stat-info">
                        <span className="pm-stat-label">All Payments</span>
                        <span className="pm-stat-value">{stats.all || (stats.completed + stats.pending + stats.rejected)}</span>
                    </div>
                </div>
            </div>

            {/* Filters Bar */}
            <div className="pm-filters">
                <div className="pm-search">
                    <Search size={16} />
                    <input
                        type="text"
                        placeholder="Search by reference, user, method..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="pm-date-filters">
                    <div className="pm-date-input">
                        <Calendar size={14} />
                        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                    </div>
                    <span className="pm-date-sep">to</span>
                    <div className="pm-date-input">
                        <Calendar size={14} />
                        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                    </div>
                    {(dateFrom || dateTo) && (
                        <button className="pm-btn-clear" onClick={() => { setDateFrom(''); setDateTo('') }}>
                            <X size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* Table */}
            {loading ? (
                <div className="pm-loading">
                    <Loader2 className="pm-spinner" size={32} />
                    <p>Loading payments...</p>
                </div>
            ) : sortedPayments.length === 0 ? (
                <div className="pm-empty">
                    <CreditCard size={48} />
                    <h3>No Payments Found</h3>
                    <p>No {statusFilter || ''} payment records match your filters</p>
                </div>
            ) : (
                <div className="pm-table-container">
                    <table className="pm-table">
                        <thead>
                            <tr>
                                <th className="pm-th-id">
                                    <Hash size={13} /> ID / Reference
                                </th>
                                <th className="pm-th-sortable" onClick={() => toggleSort('user')}>
                                    <User size={13} /> User
                                    {sortField === 'user' && <ArrowUpDown size={12} className="pm-sort-icon" />}
                                </th>
                                <th className="pm-th-sortable" onClick={() => toggleSort('amount')}>
                                    <DollarSign size={13} /> Amount
                                    {sortField === 'amount' && <ArrowUpDown size={12} className="pm-sort-icon" />}
                                </th>
                                <th>Method</th>
                                <th>Status</th>
                                <th className="pm-th-sortable" onClick={() => toggleSort('createdAt')}>
                                    <Calendar size={13} /> Date
                                    {sortField === 'createdAt' && <ArrowUpDown size={12} className="pm-sort-icon" />}
                                </th>
                                <th className="pm-th-actions">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedPayments.map(payment => (
                                <tr key={payment.id} className={payment.status === 'PENDING' ? 'pm-row-pending' : ''}>
                                    <td>
                                        <div className="pm-cell-ref">
                                            <span className="pm-ref-code">{payment.reference || payment.id?.substring(0, 10)}</span>
                                            {payment.transactionId && (
                                                <span className="pm-tx-id">TX: {payment.transactionId.length > 12 ? payment.transactionId.substring(0, 12) + '...' : payment.transactionId}</span>
                                            )}
                                        </div>
                                    </td>
                                    <td>
                                        <div className="pm-cell-user">
                                            <span className="pm-user-name">{payment.user?.name || payment.user?.username || '—'}</span>
                                            <span className="pm-user-email">{payment.user?.email || ''}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <span className="pm-amount">{formatCurrency(payment.amount)}</span>
                                    </td>
                                    <td>{getMethodBadge(payment.method)}</td>
                                    <td>{getStatusBadge(payment.status)}</td>
                                    <td>
                                        <div className="pm-cell-date">
                                            <span>{formatDate(payment.createdAt)}</span>
                                            <span className="pm-time">{formatTime(payment.createdAt)}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="pm-actions">
                                            <button className="pm-action-btn" onClick={() => openPaymentModal(payment)} title="View Details">
                                                <Eye size={15} />
                                            </button>
                                            {payment.status === 'PENDING' && (
                                                <>
                                                    <button className="pm-action-btn pm-approve" onClick={() => openPaymentModal(payment)} disabled={actionLoading} title="Approve">
                                                        <CheckCircle2 size={15} />
                                                    </button>
                                                    <button className="pm-action-btn pm-reject" onClick={() => openPaymentModal(payment)} title="Reject">
                                                        <XCircle size={15} />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Pagination */}
            {pagination.totalPages > 1 && (
                <div className="pm-pagination">
                    <span className="pm-page-info">
                        Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
                    </span>
                    <div className="pm-page-btns">
                        <button
                            className="pm-page-btn"
                            disabled={pagination.page <= 1}
                            onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                        >
                            <ChevronLeft size={16} /> Previous
                        </button>
                        {/* Page numbers */}
                        {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                            const startPage = Math.max(1, Math.min(pagination.page - 2, pagination.totalPages - 4))
                            const pageNum = startPage + i
                            if (pageNum > pagination.totalPages) return null
                            return (
                                <button
                                    key={pageNum}
                                    className={`pm-page-num ${pagination.page === pageNum ? 'active' : ''}`}
                                    onClick={() => setPagination(p => ({ ...p, page: pageNum }))}
                                >
                                    {pageNum}
                                </button>
                            )
                        })}
                        <button
                            className="pm-page-btn"
                            disabled={pagination.page >= pagination.totalPages}
                            onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                        >
                            Next <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* Payment Detail Modal */}
            {showModal && selectedPayment && (
                <div className="pm-modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="pm-modal" onClick={e => e.stopPropagation()}>
                        <div className="pm-modal-header">
                            <h2>Payment Details</h2>
                            <button className="pm-modal-close" onClick={() => setShowModal(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="pm-modal-body">
                            {/* Amount highlight */}
                            <div className="pm-detail-amount">
                                <DollarSign size={24} />
                                <span>{formatCurrency(selectedPayment.amount)}</span>
                                {getStatusBadge(selectedPayment.status)}
                            </div>

                            <div className="pm-detail-grid">
                                <div className="pm-detail-item">
                                    <span className="pm-detail-label">Reference</span>
                                    <span className="pm-detail-value">{selectedPayment.reference || '—'}</span>
                                </div>
                                <div className="pm-detail-item">
                                    <span className="pm-detail-label">Transaction ID</span>
                                    <span className="pm-detail-value">{selectedPayment.transactionId || '—'}</span>
                                </div>
                                <div className="pm-detail-item">
                                    <span className="pm-detail-label">Method</span>
                                    <span className="pm-detail-value">{getMethodBadge(selectedPayment.method)}</span>
                                </div>
                                <div className="pm-detail-item">
                                    <span className="pm-detail-label">Currency</span>
                                    <span className="pm-detail-value">{selectedPayment.currency || 'USD'}</span>
                                </div>
                                <div className="pm-detail-item">
                                    <span className="pm-detail-label">User</span>
                                    <span className="pm-detail-value">{selectedPayment.user?.name || selectedPayment.user?.username || '—'}</span>
                                </div>
                                <div className="pm-detail-item">
                                    <span className="pm-detail-label">Email</span>
                                    <span className="pm-detail-value">{selectedPayment.user?.email || '—'}</span>
                                </div>
                                <div className="pm-detail-item">
                                    <span className="pm-detail-label">Created</span>
                                    <span className="pm-detail-value">{new Date(selectedPayment.createdAt).toLocaleString()}</span>
                                </div>
                                {selectedPayment.completedAt && (
                                    <div className="pm-detail-item">
                                        <span className="pm-detail-label">Completed</span>
                                        <span className="pm-detail-value">{new Date(selectedPayment.completedAt).toLocaleString()}</span>
                                    </div>
                                )}
                                {selectedPayment.processedBy && (
                                    <div className="pm-detail-item">
                                        <span className="pm-detail-label">Processed By</span>
                                        <span className="pm-detail-value">{selectedPayment.processedBy}</span>
                                    </div>
                                )}
                                {selectedPayment.notes && (
                                    <div className="pm-detail-item pm-detail-full">
                                        <span className="pm-detail-label">Notes</span>
                                        <span className="pm-detail-value">{selectedPayment.notes}</span>
                                    </div>
                                )}
                            </div>

                            {/* Actions for PENDING */}
                            {selectedPayment.status === 'PENDING' && (
                                <div className="pm-modal-actions-section">
                                    <hr className="pm-divider" />
                                    <div className="pm-reject-form">
                                        <label>Rejection Reason (optional)</label>
                                        <textarea
                                            value={rejectReason}
                                            onChange={e => setRejectReason(e.target.value)}
                                            placeholder="Enter reason for rejection..."
                                            rows={3}
                                        />
                                    </div>
                                    <div className="pm-modal-actions">
                                        <button
                                            className="pm-btn pm-btn-reject"
                                            onClick={() => handleReject(selectedPayment.id)}
                                            disabled={actionLoading}
                                        >
                                            {actionLoading ? <Loader2 className="pm-spinner" size={16} /> : <XCircle size={16} />}
                                            Reject
                                        </button>
                                        <button
                                            className="pm-btn pm-btn-approve"
                                            onClick={() => handleApprove(selectedPayment.id)}
                                            disabled={actionLoading}
                                        >
                                            {actionLoading ? <Loader2 className="pm-spinner" size={16} /> : <CheckCircle2 size={16} />}
                                            Approve
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <style>{styles}</style>
        </div>
    )
}

const styles = `
    .pm-page {
        padding: 1.5rem;
        max-width: 1400px;
        margin: 0 auto;
    }

    /* Header */
    .pm-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 1.5rem;
        flex-wrap: wrap;
        gap: 1rem;
    }
    .pm-header-left {
        display: flex;
        align-items: center;
        gap: 1rem;
    }
    .pm-header-icon {
        width: 52px;
        height: 52px;
        border-radius: 14px;
        background: linear-gradient(135deg, #6366f1, #4f46e5);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        box-shadow: 0 4px 15px rgba(99, 102, 241, 0.3);
    }
    .pm-header h1 {
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--text-primary);
        margin: 0;
    }
    .pm-header p {
        font-size: 0.875rem;
        color: var(--text-secondary);
        margin: 0.15rem 0 0;
    }

    /* Buttons */
    .pm-btn {
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
    .pm-btn-ghost {
        background: var(--bg-tertiary);
        color: var(--text-secondary);
        border: 1px solid var(--border-color);
    }
    .pm-btn-ghost:hover {
        background: var(--bg-card-hover);
        color: var(--text-primary);
    }
    .pm-btn-approve {
        background: linear-gradient(135deg, #10b981, #059669);
        color: white;
    }
    .pm-btn-approve:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3); }
    .pm-btn-reject {
        background: var(--bg-tertiary);
        color: #ef4444;
        border: 1px solid rgba(239, 68, 68, 0.3);
    }
    .pm-btn-reject:hover { background: rgba(239, 68, 68, 0.1); }
    .pm-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none !important; }

    /* Alerts */
    .pm-alert {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.875rem 1.25rem;
        border-radius: 12px;
        margin-bottom: 1.25rem;
        font-size: 0.875rem;
        font-weight: 500;
        animation: pmSlideDown 0.3s ease;
    }
    @keyframes pmSlideDown {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
    }
    .pm-alert-error {
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.25);
        color: #ef4444;
    }
    .pm-alert-success {
        background: rgba(16, 185, 129, 0.1);
        border: 1px solid rgba(16, 185, 129, 0.25);
        color: #10b981;
    }
    .pm-alert button {
        margin-left: auto;
        background: none;
        border: none;
        cursor: pointer;
        color: inherit;
        padding: 2px;
    }

    @keyframes pmSpin { to { transform: rotate(360deg); } }
    .pm-spinner { animation: pmSpin 1s linear infinite; }

    /* Stats Cards */
    .pm-stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1rem;
        margin-bottom: 1.25rem;
    }
    .pm-stat-card {
        display: flex;
        align-items: center;
        gap: 0.875rem;
        padding: 1rem 1.25rem;
        background: var(--bg-card);
        border: 1px solid var(--border-color);
        border-radius: 14px;
        cursor: pointer;
        transition: all 0.2s ease;
    }
    .pm-stat-card:hover {
        border-color: var(--border-color-hover);
        transform: translateY(-2px);
        box-shadow: 0 4px 20px rgba(0,0,0,0.08);
    }
    .pm-stat-card.active {
        border-color: #6366f1;
        box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
    }
    .pm-stat-icon {
        width: 42px;
        height: 42px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        flex-shrink: 0;
    }
    .pm-stat-info {
        display: flex;
        flex-direction: column;
    }
    .pm-stat-label {
        font-size: 0.75rem;
        color: var(--text-secondary);
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.03em;
    }
    .pm-stat-value {
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--text-primary);
    }
    .pm-stat-alert {
        font-size: 0.7rem;
        color: #fbbf24;
        font-weight: 600;
    }

    /* Filters */
    .pm-filters {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin-bottom: 1.25rem;
        flex-wrap: wrap;
    }
    .pm-search {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex: 1;
        min-width: 240px;
        padding: 0.6rem 1rem;
        background: var(--bg-card);
        border: 1px solid var(--border-color);
        border-radius: 10px;
        transition: all 0.2s ease;
    }
    .pm-search:focus-within {
        border-color: #6366f1;
        box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
    }
    .pm-search svg { color: var(--text-secondary); flex-shrink: 0; }
    .pm-search input {
        flex: 1;
        border: none;
        background: transparent;
        font-size: 0.875rem;
        color: var(--text-primary);
        outline: none;
        font-family: inherit;
    }
    .pm-date-filters {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    .pm-date-input {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.55rem 0.75rem;
        background: var(--bg-card);
        border: 1px solid var(--border-color);
        border-radius: 10px;
    }
    .pm-date-input svg { color: var(--text-secondary); flex-shrink: 0; }
    .pm-date-input input {
        border: none;
        background: transparent;
        font-size: 0.8rem;
        color: var(--text-primary);
        outline: none;
        font-family: inherit;
        width: 120px;
    }
    .pm-date-input input::-webkit-calendar-picker-indicator {
        filter: invert(0.5);
    }
    .pm-date-sep {
        font-size: 0.8rem;
        color: var(--text-secondary);
    }
    .pm-btn-clear {
        padding: 0.4rem;
        background: rgba(239, 68, 68, 0.1);
        border: none;
        border-radius: 6px;
        color: #ef4444;
        cursor: pointer;
        display: flex;
    }
    .pm-btn-clear:hover { background: rgba(239, 68, 68, 0.2); }

    /* Loading / Empty */
    .pm-loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1rem;
        min-height: 300px;
        color: var(--text-secondary);
    }
    .pm-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 3rem;
        color: var(--text-secondary);
        text-align: center;
        gap: 0.5rem;
        background: var(--bg-card);
        border: 1px solid var(--border-color);
        border-radius: 16px;
    }
    .pm-empty h3 { margin: 0; font-size: 1.1rem; color: var(--text-primary); }
    .pm-empty p { margin: 0; font-size: 0.85rem; }

    /* Table */
    .pm-table-container {
        background: var(--bg-card);
        border: 1px solid var(--border-color);
        border-radius: 16px;
        overflow: hidden;
    }
    .pm-table {
        width: 100%;
        border-collapse: collapse;
    }
    .pm-table thead th {
        padding: 0.8rem 1rem;
        text-align: left;
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        background: var(--bg-tertiary);
        border-bottom: 1px solid var(--border-color);
        white-space: nowrap;
    }
    .pm-table thead th svg {
        vertical-align: middle;
        margin-right: 0.25rem;
    }
    .pm-th-sortable {
        cursor: pointer;
        user-select: none;
    }
    .pm-th-sortable:hover { color: var(--text-primary); }
    .pm-sort-icon { margin-left: 0.25rem; opacity: 0.5; }
    .pm-th-actions { text-align: center; width: 120px; }
    .pm-table tbody tr {
        border-bottom: 1px solid var(--border-color);
        transition: background 0.15s ease;
    }
    .pm-table tbody tr:last-child { border-bottom: none; }
    .pm-table tbody tr:hover { background: var(--bg-card-hover, rgba(0,0,0,0.02)); }
    .pm-row-pending { background: rgba(251, 191, 36, 0.03); }
    .pm-table tbody td {
        padding: 0.75rem 1rem;
        font-size: 0.875rem;
        color: var(--text-primary);
        vertical-align: middle;
    }

    /* Cell styles */
    .pm-cell-ref {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
    }
    .pm-ref-code {
        font-weight: 600;
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.8rem;
    }
    .pm-tx-id {
        font-size: 0.7rem;
        color: var(--text-secondary);
        font-family: 'JetBrains Mono', monospace;
    }
    .pm-cell-user {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
    }
    .pm-user-name { font-weight: 600; font-size: 0.85rem; }
    .pm-user-email { font-size: 0.7rem; color: var(--text-secondary); }
    .pm-amount {
        font-weight: 700;
        font-size: 0.95rem;
        color: #10b981;
        font-family: 'JetBrains Mono', monospace;
    }
    .pm-cell-date {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
        font-size: 0.8rem;
    }
    .pm-time { font-size: 0.7rem; color: var(--text-secondary); }

    /* Status badge */
    .pm-status {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 0.25rem 0.6rem;
        border-radius: 6px;
        font-size: 0.7rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.02em;
        border: 1px solid;
    }

    /* Method badge */
    .pm-method {
        font-weight: 600;
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.02em;
    }

    /* Action buttons */
    .pm-actions {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.35rem;
    }
    .pm-action-btn {
        padding: 0.4rem;
        border: none;
        background: var(--bg-tertiary);
        border-radius: 8px;
        cursor: pointer;
        color: var(--text-secondary);
        transition: all 0.15s ease;
        display: flex;
    }
    .pm-action-btn:hover { color: var(--text-primary); background: var(--bg-card-hover); }
    .pm-action-btn.pm-approve { color: #10b981; }
    .pm-action-btn.pm-approve:hover { background: rgba(16, 185, 129, 0.15); }
    .pm-action-btn.pm-reject { color: #ef4444; }
    .pm-action-btn.pm-reject:hover { background: rgba(239, 68, 68, 0.15); }
    .pm-action-btn:disabled { opacity: 0.4; cursor: not-allowed; }

    /* Pagination */
    .pm-pagination {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: 1.25rem;
        flex-wrap: wrap;
        gap: 0.75rem;
    }
    .pm-page-info {
        font-size: 0.8rem;
        color: var(--text-secondary);
    }
    .pm-page-btns {
        display: flex;
        align-items: center;
        gap: 0.35rem;
    }
    .pm-page-btn {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.45rem 0.85rem;
        border-radius: 8px;
        font-size: 0.8rem;
        font-weight: 500;
        border: 1px solid var(--border-color);
        background: var(--bg-card);
        color: var(--text-secondary);
        cursor: pointer;
        transition: all 0.15s ease;
    }
    .pm-page-btn:hover:not(:disabled) { color: var(--text-primary); border-color: var(--border-color-hover); }
    .pm-page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .pm-page-num {
        padding: 0.45rem 0.7rem;
        border-radius: 8px;
        font-size: 0.8rem;
        font-weight: 600;
        border: 1px solid transparent;
        background: none;
        color: var(--text-secondary);
        cursor: pointer;
        transition: all 0.15s ease;
    }
    .pm-page-num:hover { color: var(--text-primary); background: var(--bg-tertiary); }
    .pm-page-num.active {
        background: #6366f1;
        color: white;
        border-color: #6366f1;
    }

    /* Modal */
    .pm-modal-overlay {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        animation: pmFadeIn 0.2s ease;
    }
    @keyframes pmFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
    .pm-modal {
        background: var(--bg-card);
        border: 1px solid var(--border-color);
        border-radius: 16px;
        width: 90%;
        max-width: 560px;
        max-height: 90vh;
        overflow-y: auto;
        animation: pmSlideUp 0.3s ease;
    }
    @keyframes pmSlideUp {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
    }
    .pm-modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 1.25rem 1.5rem;
        border-bottom: 1px solid var(--border-color);
    }
    .pm-modal-header h2 {
        font-size: 1.1rem;
        font-weight: 700;
        color: var(--text-primary);
        margin: 0;
    }
    .pm-modal-close {
        background: none;
        border: none;
        cursor: pointer;
        color: var(--text-secondary);
        padding: 4px;
        border-radius: 6px;
    }
    .pm-modal-close:hover { color: var(--text-primary); background: var(--bg-tertiary); }
    .pm-modal-body {
        padding: 1.5rem;
    }

    /* Detail amount */
    .pm-detail-amount {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 1rem 1.25rem;
        background: linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(16, 185, 129, 0.02));
        border: 1px solid rgba(16, 185, 129, 0.2);
        border-radius: 12px;
        margin-bottom: 1.25rem;
    }
    .pm-detail-amount svg { color: #10b981; }
    .pm-detail-amount > span:first-of-type {
        font-size: 1.75rem;
        font-weight: 800;
        color: #10b981;
        font-family: 'JetBrains Mono', monospace;
    }
    .pm-detail-amount > .pm-status { margin-left: auto; }

    /* Detail grid */
    .pm-detail-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.75rem;
    }
    .pm-detail-item {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        padding: 0.6rem 0.75rem;
        background: var(--bg-tertiary);
        border-radius: 8px;
    }
    .pm-detail-full { grid-column: 1 / -1; }
    .pm-detail-label {
        font-size: 0.7rem;
        font-weight: 600;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.03em;
    }
    .pm-detail-value {
        font-size: 0.85rem;
        color: var(--text-primary);
        font-weight: 500;
        word-break: break-all;
    }

    /* Modal actions */
    .pm-modal-actions-section { margin-top: 1.25rem; }
    .pm-divider {
        border: none;
        border-top: 1px solid var(--border-color);
        margin: 0 0 1rem;
    }
    .pm-reject-form {
        margin-bottom: 1rem;
    }
    .pm-reject-form label {
        display: block;
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--text-secondary);
        margin-bottom: 0.5rem;
    }
    .pm-reject-form textarea {
        width: 100%;
        padding: 0.6rem 0.75rem;
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        border-radius: 10px;
        color: var(--text-primary);
        font-family: inherit;
        font-size: 0.85rem;
        resize: vertical;
        outline: none;
    }
    .pm-reject-form textarea:focus {
        border-color: #6366f1;
        box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
    }
    .pm-modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
    }

    /* Responsive */
    @media (max-width: 768px) {
        .pm-page { padding: 1rem; }
        .pm-header { flex-direction: column; align-items: flex-start; }
        .pm-stats { grid-template-columns: 1fr 1fr; }
        .pm-filters { flex-direction: column; }
        .pm-search { width: 100%; }
        .pm-date-filters { width: 100%; }
        .pm-table-container { overflow-x: auto; }
        .pm-table { min-width: 700px; }
        .pm-detail-grid { grid-template-columns: 1fr; }
        .pm-pagination { flex-direction: column; align-items: flex-start; }
    }
`
