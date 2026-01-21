import { useState, useEffect } from 'react'
import {
    CreditCard, CheckCircle2, XCircle, Clock, Eye,
    Loader2, AlertCircle, X, Search, DollarSign
} from 'lucide-react'
import api from '../../services/api'

export default function PaymentManagement() {
    const [payments, setPayments] = useState([])
    const [loading, setLoading] = useState(true)
    const [statusFilter, setStatusFilter] = useState('PENDING')
    const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 })
    const [selectedPayment, setSelectedPayment] = useState(null)
    const [showModal, setShowModal] = useState(false)
    const [error, setError] = useState(null)
    const [success, setSuccess] = useState(null)
    const [actionLoading, setActionLoading] = useState(false)
    const [rejectReason, setRejectReason] = useState('')

    useEffect(() => {
        fetchPayments()
    }, [pagination.page, statusFilter])

    const fetchPayments = async () => {
        try {
            setLoading(true)
            const params = new URLSearchParams({
                page: pagination.page.toString(),
                limit: pagination.limit.toString()
            })
            if (statusFilter) params.append('status', statusFilter)

            const res = await api.get(`/wallet/admin/payments?${params}`)
            setPayments(res.data || [])
            if (res.pagination) {
                setPagination(prev => ({ ...prev, total: res.pagination.total }))
            }
        } catch (err) {
            setError(err.message || 'Failed to fetch payments')
        } finally {
            setLoading(false)
        }
    }

    const handleApprove = async (paymentId) => {
        setActionLoading(true)
        try {
            await api.put(`/wallet/admin/payments/${paymentId}/approve`)
            setSuccess('Payment approved successfully')
            fetchPayments()
            setShowModal(false)
        } catch (err) {
            setError(err.error?.message || err.message)
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
            fetchPayments()
            setShowModal(false)
            setRejectReason('')
        } catch (err) {
            setError(err.error?.message || err.message)
        } finally {
            setActionLoading(false)
        }
    }

    const openPaymentModal = (payment) => {
        setSelectedPayment(payment)
        setShowModal(true)
        setRejectReason('')
    }

    const getStatusIcon = (status) => {
        switch (status) {
            case 'COMPLETED': return <CheckCircle2 size={16} className="text-success" />
            case 'REJECTED': return <XCircle size={16} className="text-danger" />
            default: return <Clock size={16} className="text-warning" />
        }
    }

    const getStatusBadge = (status) => {
        const styles = {
            PENDING: { bg: 'rgba(251, 191, 36, 0.1)', color: '#fbbf24' },
            COMPLETED: { bg: 'rgba(34, 197, 94, 0.1)', color: '#22c55e' },
            REJECTED: { bg: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }
        }
        const style = styles[status] || styles.PENDING
        return (
            <span className="status-badge" style={{ background: style.bg, color: style.color }}>
                {getStatusIcon(status)}
                {status}
            </span>
        )
    }

    const formatCurrency = (amount) => `$${(amount || 0).toFixed(2)}`

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Payment Management</h1>
                    <p className="page-subtitle">Review and process payment requests</p>
                </div>
            </div>

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

            {/* Filter Tabs */}
            <div className="filter-tabs">
                {['PENDING', 'COMPLETED', 'REJECTED', ''].map(status => (
                    <button
                        key={status}
                        className={`filter-tab ${statusFilter === status ? 'active' : ''}`}
                        onClick={() => setStatusFilter(status)}
                    >
                        {status || 'All'}
                        {status === 'PENDING' && payments.filter(p => p.status === 'PENDING').length > 0 && (
                            <span className="badge-count">
                                {payments.filter(p => p.status === 'PENDING').length}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="loading-container">
                    <Loader2 className="animate-spin" size={32} />
                    <p>Loading payments...</p>
                </div>
            ) : payments.length === 0 ? (
                <div className="empty-state">
                    <CreditCard size={64} className="text-secondary" />
                    <h3>No Payments</h3>
                    <p>No payment requests found for the selected filter</p>
                </div>
            ) : (
                <div className="payments-list">
                    {payments.map(payment => (
                        <div key={payment.id} className="payment-card">
                            <div className="payment-main">
                                <div className="payment-icon">
                                    <DollarSign size={24} />
                                </div>
                                <div className="payment-info">
                                    <div className="payment-header">
                                        <span className="payment-ref">{payment.reference}</span>
                                        {getStatusBadge(payment.status)}
                                    </div>
                                    <div className="payment-user">
                                        <span>{payment.user?.name || payment.user?.username}</span>
                                        <span className="separator">•</span>
                                        <span>{payment.user?.email}</span>
                                    </div>
                                    <div className="payment-meta">
                                        <span className="payment-method">{payment.method}</span>
                                        <span className="separator">•</span>
                                        <span>{new Date(payment.createdAt).toLocaleString()}</span>
                                    </div>
                                </div>
                                <div className="payment-amount">
                                    {formatCurrency(payment.amount)}
                                </div>
                            </div>

                            {payment.status === 'PENDING' && (
                                <div className="payment-actions">
                                    <button
                                        className="btn btn-success btn-sm"
                                        onClick={() => handleApprove(payment.id)}
                                        disabled={actionLoading}
                                    >
                                        <CheckCircle2 size={16} />
                                        Approve
                                    </button>
                                    <button
                                        className="btn btn-danger btn-sm"
                                        onClick={() => openPaymentModal(payment)}
                                    >
                                        <XCircle size={16} />
                                        Reject
                                    </button>
                                    <button
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => openPaymentModal(payment)}
                                    >
                                        <Eye size={16} />
                                        View
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Payment Modal */}
            {showModal && selectedPayment && (
                <div className="modal-overlay open" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Payment Details</h2>
                            <button className="modal-close" onClick={() => setShowModal(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="modal-body">
                            <div className="payment-details">
                                <div className="detail-row">
                                    <span className="label">Reference</span>
                                    <span className="value">{selectedPayment.reference}</span>
                                </div>
                                <div className="detail-row">
                                    <span className="label">Amount</span>
                                    <span className="value highlight">{formatCurrency(selectedPayment.amount)}</span>
                                </div>
                                <div className="detail-row">
                                    <span className="label">Method</span>
                                    <span className="value">{selectedPayment.method}</span>
                                </div>
                                <div className="detail-row">
                                    <span className="label">Status</span>
                                    <span className="value">{getStatusBadge(selectedPayment.status)}</span>
                                </div>
                                <div className="detail-row">
                                    <span className="label">User</span>
                                    <span className="value">{selectedPayment.user?.name || selectedPayment.user?.username}</span>
                                </div>
                                <div className="detail-row">
                                    <span className="label">Email</span>
                                    <span className="value">{selectedPayment.user?.email}</span>
                                </div>
                                <div className="detail-row">
                                    <span className="label">Created</span>
                                    <span className="value">{new Date(selectedPayment.createdAt).toLocaleString()}</span>
                                </div>
                            </div>

                            {selectedPayment.status === 'PENDING' && (
                                <>
                                    <hr style={{ margin: 'var(--spacing-lg) 0', borderColor: 'var(--border-color)' }} />

                                    <div className="form-group">
                                        <label className="form-label">Rejection Reason (optional)</label>
                                        <textarea
                                            className="form-textarea"
                                            value={rejectReason}
                                            onChange={(e) => setRejectReason(e.target.value)}
                                            placeholder="Enter reason for rejection..."
                                            rows={3}
                                        />
                                    </div>

                                    <div className="modal-actions">
                                        <button
                                            className="btn btn-danger"
                                            onClick={() => handleReject(selectedPayment.id)}
                                            disabled={actionLoading}
                                        >
                                            {actionLoading ? <Loader2 className="animate-spin" size={18} /> : 'Reject'}
                                        </button>
                                        <button
                                            className="btn btn-success"
                                            onClick={() => handleApprove(selectedPayment.id)}
                                            disabled={actionLoading}
                                        >
                                            {actionLoading ? <Loader2 className="animate-spin" size={18} /> : 'Approve'}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .filter-tabs {
                    display: flex;
                    gap: var(--spacing-sm);
                    margin-bottom: var(--spacing-lg);
                    background: var(--bg-secondary);
                    border-radius: var(--radius-lg);
                    padding: var(--spacing-xs);
                }

                .filter-tab {
                    padding: var(--spacing-sm) var(--spacing-lg);
                    border: none;
                    background: none;
                    color: var(--text-secondary);
                    border-radius: var(--radius-md);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-xs);
                }

                .filter-tab:hover {
                    color: var(--text-primary);
                }

                .filter-tab.active {
                    background: var(--primary-500);
                    color: white;
                }

                .badge-count {
                    background: rgba(255, 255, 255, 0.2);
                    padding: 2px 6px;
                    border-radius: 10px;
                    font-size: 0.75rem;
                }

                .filter-tab.active .badge-count {
                    background: rgba(255, 255, 255, 0.3);
                }

                .payments-list {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-md);
                }

                .payment-card {
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-lg);
                    overflow: hidden;
                }

                .payment-main {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-md);
                    padding: var(--spacing-lg);
                }

                .payment-icon {
                    width: 48px;
                    height: 48px;
                    background: rgba(37, 211, 102, 0.1);
                    color: var(--primary-500);
                    border-radius: var(--radius-md);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .payment-info {
                    flex: 1;
                }

                .payment-header {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    margin-bottom: var(--spacing-xs);
                }

                .payment-ref {
                    font-weight: 600;
                }

                .payment-user {
                    font-size: 0.875rem;
                    margin-bottom: var(--spacing-xs);
                }

                .payment-meta {
                    font-size: 0.75rem;
                    color: var(--text-secondary);
                }

                .separator {
                    margin: 0 var(--spacing-xs);
                    color: var(--text-secondary);
                }

                .payment-method {
                    background: var(--bg-tertiary);
                    padding: 2px 6px;
                    border-radius: var(--radius-sm);
                }

                .payment-amount {
                    font-size: 1.5rem;
                    font-weight: 700;
                    color: var(--primary-500);
                }

                .payment-actions {
                    display: flex;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-md) var(--spacing-lg);
                    background: var(--bg-tertiary);
                    border-top: 1px solid var(--border-color);
                }

                .status-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    padding: 4px 10px;
                    border-radius: var(--radius-md);
                    font-size: 0.75rem;
                    font-weight: 500;
                }

                .text-success { color: #22c55e; }
                .text-danger { color: #ef4444; }
                .text-warning { color: #fbbf24; }
                .text-secondary { color: var(--text-secondary); }

                .btn-success {
                    background: #22c55e;
                    color: white;
                }
                .btn-success:hover { background: #16a34a; }

                .btn-danger {
                    background: #ef4444;
                    color: white;
                }
                .btn-danger:hover { background: #dc2626; }

                .payment-details {
                    background: var(--bg-tertiary);
                    border-radius: var(--radius-md);
                    padding: var(--spacing-md);
                }

                .detail-row {
                    display: flex;
                    justify-content: space-between;
                    padding: var(--spacing-sm) 0;
                    border-bottom: 1px solid var(--border-color);
                }

                .detail-row:last-child {
                    border-bottom: none;
                }

                .detail-row .label {
                    color: var(--text-secondary);
                }

                .detail-row .value.highlight {
                    font-size: 1.25rem;
                    font-weight: 700;
                    color: var(--primary-500);
                }

                .modal-actions {
                    display: flex;
                    justify-content: flex-end;
                    gap: var(--spacing-sm);
                    margin-top: var(--spacing-lg);
                }

                .form-textarea {
                    width: 100%;
                    padding: var(--spacing-sm) var(--spacing-md);
                    background: var(--bg-tertiary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-md);
                    color: var(--text-primary);
                    font-family: inherit;
                    resize: vertical;
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

                .loading-container {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    padding: var(--spacing-3xl);
                    color: var(--text-secondary);
                }

                .alert {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-md);
                    border-radius: var(--radius-md);
                    margin-bottom: var(--spacing-lg);
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
                }
            `}</style>
        </div>
    )
}
