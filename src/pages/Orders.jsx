import { useState, useEffect, useRef } from 'react'
import {
    Package, Search, Filter, RefreshCw, RotateCcw, XCircle,
    Zap, CheckCircle2, Clock, AlertCircle, Loader2, X,
    ChevronDown, ExternalLink, Copy, ArrowUpDown, Users, Hash, UserCheck,
    FileText, Save, Link2, ClipboardCopy
} from 'lucide-react'
import api from '../services/api'

const STATUS_COLORS = {
    'PENDING': { bg: 'rgba(251, 191, 36, 0.1)', color: '#fbbf24' },
    'IN_PROGRESS': { bg: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' },
    'PROCESSING': { bg: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' },
    'COMPLETED': { bg: 'rgba(34, 197, 94, 0.1)', color: '#22c55e' },
    'PARTIAL': { bg: 'rgba(251, 146, 60, 0.1)', color: '#fb923c' },
    'CANCELLED': { bg: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' },
    'REFUNDED': { bg: 'rgba(168, 85, 247, 0.1)', color: '#a855f7' }
}

export default function Orders() {
    const [orders, setOrders] = useState([])
    const [panels, setPanels] = useState([])
    const [loading, setLoading] = useState(true)
    const [stats, setStats] = useState(null)
    const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 })
    const [filters, setFilters] = useState({
        panelId: '',
        status: '',
        search: ''
    })
    const [selectedOrders, setSelectedOrders] = useState([])
    const [showDetailModal, setShowDetailModal] = useState(null)
    const [actionLoading, setActionLoading] = useState(null)
    const [error, setError] = useState(null)
    const [successMsg, setSuccessMsg] = useState(null)
    const [showCopyMenu, setShowCopyMenu] = useState(false)
    const [memoText, setMemoText] = useState('')
    const [memoSaving, setMemoSaving] = useState(false)
    const [statusOverriding, setStatusOverriding] = useState(false)
    const copyMenuRef = useRef(null)

    // Close copy menu when clicking outside
    useEffect(() => {
        if (!showCopyMenu) return
        const handleClickOutside = (e) => {
            if (copyMenuRef.current && !copyMenuRef.current.contains(e.target)) {
                setShowCopyMenu(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [showCopyMenu])

    useEffect(() => {
        fetchPanels()
        fetchStats()
    }, [])

    useEffect(() => {
        fetchOrders()
    }, [filters, pagination.page])

    const fetchPanels = async () => {
        try {
            const res = await api.get('/panels?limit=100')
            setPanels(res.data || [])
        } catch (err) {
            console.error('Failed to fetch panels:', err)
        }
    }

    const fetchStats = async () => {
        try {
            const res = await api.get('/orders/stats')
            setStats(res.data)
        } catch (err) {
            console.error('Failed to fetch stats:', err)
        }
    }

    const fetchOrders = async () => {
        try {
            setLoading(true)
            const params = new URLSearchParams({
                page: pagination.page,
                limit: pagination.limit,
                ...(filters.panelId && { panelId: filters.panelId }),
                ...(filters.status && { status: filters.status }),
                ...(filters.search && { search: filters.search })
            })
            const res = await api.get(`/orders?${params}`)
            setOrders(res.data || [])
            setPagination(prev => ({
                ...prev,
                total: res.pagination?.total || 0,
                totalPages: res.pagination?.totalPages || 0
            }))
        } catch (err) {
            setError(err.message || 'Failed to fetch orders')
        } finally {
            setLoading(false)
        }
    }

    const handleRefill = async (orderId) => {
        setActionLoading(orderId)
        try {
            await api.post(`/orders/${orderId}/refill`)
            fetchOrders()
            fetchStats()
        } catch (err) {
            setError(err.error?.message || err.message || 'Refill failed')
        } finally {
            setActionLoading(null)
        }
    }

    const handleCancel = async (orderId) => {
        if (!confirm('Are you sure you want to cancel this order?')) return

        setActionLoading(orderId)
        try {
            await api.post(`/orders/${orderId}/cancel`)
            fetchOrders()
            fetchStats()
        } catch (err) {
            setError(err.error?.message || err.message || 'Cancel failed')
        } finally {
            setActionLoading(null)
        }
    }

    const handleSpeedUp = async (orderId) => {
        setActionLoading(orderId)
        try {
            await api.post(`/orders/${orderId}/speed-up`)
            fetchOrders()
        } catch (err) {
            setError(err.error?.message || err.message || 'Speed-up failed')
        } finally {
            setActionLoading(null)
        }
    }

    const handleCheckStatus = async (orderId) => {
        setActionLoading(orderId)
        try {
            await api.get(`/orders/${orderId}/status`)
            fetchOrders()
        } catch (err) {
            setError(err.error?.message || err.message || 'Status check failed')
        } finally {
            setActionLoading(null)
        }
    }

    const handleBulkAction = async (action) => {
        if (selectedOrders.length === 0) {
            setError('No orders selected')
            return
        }

        setActionLoading('bulk')
        try {
            if (action === 'status') {
                await api.post('/orders/bulk-status', { orderIds: selectedOrders })
            } else if (action === 'refill') {
                await api.post('/orders/bulk-refill', { orderIds: selectedOrders })
            }
            fetchOrders()
            fetchStats()
            setSelectedOrders([])
        } catch (err) {
            setError(err.error?.message || err.message || 'Bulk action failed')
        } finally {
            setActionLoading(null)
        }
    }

    const toggleSelectOrder = (orderId) => {
        setSelectedOrders(prev =>
            prev.includes(orderId)
                ? prev.filter(id => id !== orderId)
                : [...prev, orderId]
        )
    }

    const toggleSelectAll = () => {
        if (selectedOrders.length === orders.length) {
            setSelectedOrders([])
        } else {
            setSelectedOrders(orders.map(o => o.id))
        }
    }

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text)
    }

    // Bulk Copy handler
    const handleBulkCopy = async (field) => {
        if (selectedOrders.length === 0) {
            setError('No orders selected')
            return
        }
        try {
            const res = await api.post('/orders/bulk-copy', { orderIds: selectedOrders, field })
            const text = res.data?.text || ''
            if (text) {
                await navigator.clipboard.writeText(text)
                setSuccessMsg(`Copied ${res.data.count} ${field === 'externalOrderId' ? 'Order IDs' : field === 'providerOrderId' ? 'External IDs' : 'Links'} to clipboard`)
                setTimeout(() => setSuccessMsg(null), 3000)
            } else {
                setError('No data to copy')
            }
        } catch (err) {
            setError(err.error?.message || err.message || 'Copy failed')
        }
        setShowCopyMenu(false)
    }

    // Manual status override
    const handleStatusOverride = async (orderId, newStatus) => {
        if (newStatus === showDetailModal?.status) return
        setStatusOverriding(true)
        try {
            const res = await api.patch(`/orders/${orderId}/status-override`, { status: newStatus })
            const updated = res.data
            setShowDetailModal(prev => prev ? { ...prev, status: updated.status, statusOverride: updated.statusOverride, statusOverrideBy: updated.statusOverrideBy, statusOverrideAt: updated.statusOverrideAt } : null)
            setSuccessMsg(`Status changed to ${newStatus}`)
            setTimeout(() => setSuccessMsg(null), 3000)
            fetchOrders()
            fetchStats()
        } catch (err) {
            setError(err.error?.message || err.message || 'Status override failed')
        } finally {
            setStatusOverriding(false)
        }
    }

    // Save staff memo
    const handleSaveMemo = async (orderId) => {
        setMemoSaving(true)
        try {
            await api.patch(`/orders/${orderId}/memo`, { memo: memoText })
            setShowDetailModal(prev => prev ? { ...prev, staffMemo: memoText || null } : null)
            setSuccessMsg(memoText ? 'Memo saved' : 'Memo cleared')
            setTimeout(() => setSuccessMsg(null), 3000)
        } catch (err) {
            setError(err.error?.message || err.message || 'Failed to save memo')
        } finally {
            setMemoSaving(false)
        }
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Orders</h1>
                    <p className="page-subtitle">Manage your SMM panel orders</p>
                </div>
                <div className="header-actions">
                    <button
                        className="btn btn-secondary"
                        onClick={() => { fetchOrders(); fetchStats(); }}
                        disabled={loading}
                    >
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Stats */}
            {stats && (
                <div className="stats-row">
                    <div className="stat-card">
                        <Package size={20} />
                        <div>
                            <span className="stat-value">{stats.total}</span>
                            <span className="stat-label">Total</span>
                        </div>
                    </div>
                    <div className="stat-card pending">
                        <Clock size={20} />
                        <div>
                            <span className="stat-value">{stats.pending}</span>
                            <span className="stat-label">Pending</span>
                        </div>
                    </div>
                    <div className="stat-card progress">
                        <Loader2 size={20} />
                        <div>
                            <span className="stat-value">{stats.inProgress}</span>
                            <span className="stat-label">In Progress</span>
                        </div>
                    </div>
                    <div className="stat-card completed">
                        <CheckCircle2 size={20} />
                        <div>
                            <span className="stat-value">{stats.completed}</span>
                            <span className="stat-label">Completed</span>
                        </div>
                    </div>
                    <div className="stat-card partial">
                        <AlertCircle size={20} />
                        <div>
                            <span className="stat-value">{stats.partial}</span>
                            <span className="stat-label">Partial</span>
                        </div>
                    </div>
                    <div className="stat-card cancelled">
                        <XCircle size={20} />
                        <div>
                            <span className="stat-value">{stats.cancelled}</span>
                            <span className="stat-label">Cancelled</span>
                        </div>
                    </div>
                </div>
            )}

            {error && (
                <div className="alert alert-error">
                    <AlertCircle size={18} />
                    <span>{error}</span>
                    <button onClick={() => setError(null)}><X size={16} /></button>
                </div>
            )}

            {/* Filters */}
            <div className="filters-row">
                <div className="search-box">
                    <Search size={18} />
                    <input
                        type="text"
                        placeholder="Search by Order ID or Link..."
                        value={filters.search}
                        onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                    />
                </div>
                <select
                    className="form-select"
                    value={filters.panelId}
                    onChange={(e) => setFilters({ ...filters, panelId: e.target.value })}
                >
                    <option value="">All Panels</option>
                    {panels.map(p => (
                        <option key={p.id} value={p.id}>{p.alias}</option>
                    ))}
                </select>
                <select
                    className="form-select"
                    value={filters.status}
                    onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                >
                    <option value="">All Status</option>
                    <option value="PENDING">Pending</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="PARTIAL">Partial</option>
                    <option value="CANCELLED">Cancelled</option>
                    <option value="REFUNDED">Refunded</option>
                </select>
            </div>

            {/* Success Message */}
            {successMsg && (
                <div className="alert alert-success" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e' }}>
                    <CheckCircle2 size={18} />
                    <span>{successMsg}</span>
                    <button onClick={() => setSuccessMsg(null)}><X size={16} /></button>
                </div>
            )}

            {/* Bulk Actions */}
            {selectedOrders.length > 0 && (
                <div className="bulk-actions">
                    <span>{selectedOrders.length} orders selected</span>
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleBulkAction('status')}
                        disabled={actionLoading === 'bulk'}
                    >
                        <RefreshCw size={14} />
                        Check Status
                    </button>
                    <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleBulkAction('refill')}
                        disabled={actionLoading === 'bulk'}
                    >
                        <RotateCcw size={14} />
                        Bulk Refill
                    </button>

                    {/* Bulk Copy Dropdown */}
                    <div style={{ position: 'relative' }} ref={copyMenuRef}>
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setShowCopyMenu(!showCopyMenu)}
                        >
                            <ClipboardCopy size={14} />
                            Copy
                            <ChevronDown size={12} />
                        </button>
                        {showCopyMenu && (
                            <div style={{
                                position: 'absolute', top: '100%', left: 0, marginTop: '4px',
                                background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                                borderRadius: 'var(--radius-md)', padding: '4px', zIndex: 50,
                                minWidth: '180px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)'
                            }}>
                                <button
                                    className="btn btn-ghost btn-sm"
                                    style={{ width: '100%', justifyContent: 'flex-start', padding: '8px 12px' }}
                                    onClick={() => handleBulkCopy('externalOrderId')}
                                >
                                    <Hash size={14} /> Copy Order IDs
                                </button>
                                <button
                                    className="btn btn-ghost btn-sm"
                                    style={{ width: '100%', justifyContent: 'flex-start', padding: '8px 12px' }}
                                    onClick={() => handleBulkCopy('providerOrderId')}
                                >
                                    <Users size={14} /> Copy External IDs
                                </button>
                                <button
                                    className="btn btn-ghost btn-sm"
                                    style={{ width: '100%', justifyContent: 'flex-start', padding: '8px 12px' }}
                                    onClick={() => handleBulkCopy('link')}
                                >
                                    <Link2 size={14} /> Copy Links
                                </button>
                            </div>
                        )}
                    </div>

                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => { setSelectedOrders([]); setShowCopyMenu(false); }}
                    >
                        Clear
                    </button>
                </div>
            )}

            {/* Orders Table */}
            <div className="table-container">
                <table className="table">
                    <thead>
                        <tr>
                            <th>
                                <input
                                    type="checkbox"
                                    checked={selectedOrders.length === orders.length && orders.length > 0}
                                    onChange={toggleSelectAll}
                                />
                            </th>
                            <th>Order ID</th>
                            <th>Panel</th>
                            <th>Provider</th>
                            <th>Service</th>
                            <th>Link</th>
                            <th>Qty</th>
                            <th>Status</th>
                            <th>Charge</th>
                            <th><FileText size={14} title="Memo" /></th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan="11" className="loading-cell">
                                    <div>
                                        <Loader2 className="animate-spin" size={32} />
                                        <span>Loading orders...</span>
                                    </div>
                                </td>
                            </tr>
                        ) : orders.length === 0 ? (
                            <tr>
                                <td colSpan="11" className="empty-cell">
                                    <div>
                                        <Package size={48} />
                                        <span>No orders found</span>
                                    </div>
                                </td>
                            </tr>
                        ) : orders.map(order => (
                            <tr key={order.id}>
                                <td>
                                    <input
                                        type="checkbox"
                                        checked={selectedOrders.includes(order.id)}
                                        onChange={() => toggleSelectOrder(order.id)}
                                    />
                                </td>
                                <td>
                                    <div className="order-id-cell">
                                        <span>{order.externalOrderId}</span>
                                        <button
                                            className="btn-icon"
                                            onClick={() => copyToClipboard(order.externalOrderId)}
                                        >
                                            <Copy size={12} />
                                        </button>
                                    </div>
                                </td>
                                <td>
                                    <span className="panel-alias">{order.panel?.alias || 'N/A'}</span>
                                </td>
                                <td>
                                    <div className="provider-cell">
                                        {order.providerName ? (
                                            <>
                                                <span className="provider-name">{order.providerName}</span>
                                                {order.externalProviderId && (
                                                    <div className="provider-id">
                                                        <Hash size={10} />
                                                        <span>{order.externalProviderId}</span>
                                                        <button
                                                            className="btn-icon"
                                                            onClick={() => copyToClipboard(order.externalProviderId)}
                                                            title="Copy Provider Order ID"
                                                        >
                                                            <Copy size={10} />
                                                        </button>
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <span className="text-muted">—</span>
                                        )}
                                    </div>
                                </td>
                                <td>
                                    <div className="service-cell">
                                        {order.serviceName || order.serviceId || 'N/A'}
                                    </div>
                                </td>
                                <td>
                                    <div className="link-cell">
                                        {order.link ? (
                                            <>
                                                <span>{order.link.substring(0, 25)}...</span>
                                                <a href={order.link} target="_blank" rel="noopener noreferrer">
                                                    <ExternalLink size={12} />
                                                </a>
                                            </>
                                        ) : 'N/A'}
                                    </div>
                                </td>
                                <td>{order.quantity || 'N/A'}</td>
                                <td>
                                    <span
                                        className="status-badge"
                                        style={{
                                            background: STATUS_COLORS[order.status]?.bg,
                                            color: STATUS_COLORS[order.status]?.color
                                        }}
                                    >
                                        {order.status}
                                    </span>
                                </td>
                                <td>${order.charge?.toFixed(2) || '0.00'}</td>
                                {/* Memo indicator */}
                                <td>
                                    {order.staffMemo && (
                                        <span title={order.staffMemo} style={{ cursor: 'help', marginRight: '4px' }}>
                                            <FileText size={12} style={{ color: '#f59e0b' }} />
                                        </span>
                                    )}
                                </td>
                                <td>
                                    <div className="action-buttons">
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => { setShowDetailModal(order); setMemoText(order.staffMemo || ''); }}
                                            title="View Details"
                                        >
                                            <ExternalLink size={14} />
                                        </button>
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => handleCheckStatus(order.id)}
                                            disabled={actionLoading === order.id}
                                            title="Check Status"
                                        >
                                            {actionLoading === order.id ? (
                                                <Loader2 className="animate-spin" size={14} />
                                            ) : (
                                                <RefreshCw size={14} />
                                            )}
                                        </button>
                                        {order.status === 'COMPLETED' && (
                                            <button
                                                className="btn btn-ghost btn-sm"
                                                onClick={() => handleRefill(order.id)}
                                                disabled={actionLoading === order.id}
                                                title="Refill"
                                            >
                                                <RotateCcw size={14} />
                                            </button>
                                        )}
                                        {['PENDING', 'IN_PROGRESS', 'PROCESSING'].includes(order.status) && (
                                            <>
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => handleSpeedUp(order.id)}
                                                    disabled={actionLoading === order.id}
                                                    title="Speed Up"
                                                >
                                                    <Zap size={14} />
                                                </button>
                                                <button
                                                    className="btn btn-ghost btn-sm text-danger"
                                                    onClick={() => handleCancel(order.id)}
                                                    disabled={actionLoading === order.id}
                                                    title="Cancel"
                                                >
                                                    <XCircle size={14} />
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

            {/* Pagination */}
            {pagination.totalPages > 1 && (
                <div className="pagination">
                    <button
                        className="btn btn-secondary btn-sm"
                        disabled={pagination.page === 1}
                        onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                    >
                        Previous
                    </button>
                    <span>Page {pagination.page} of {pagination.totalPages}</span>
                    <button
                        className="btn btn-secondary btn-sm"
                        disabled={pagination.page === pagination.totalPages}
                        onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                    >
                        Next
                    </button>
                </div>
            )}

            {/* Order Detail Modal */}
            {showDetailModal && (
                <div className="modal-overlay open" onClick={() => setShowDetailModal(null)}>
                    <div className="modal order-detail-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Order Details</h3>
                            <button className="modal-close" onClick={() => setShowDetailModal(null)}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            {/* Order Info Section */}
                            <div className="detail-section">
                                <h4><Package size={16} /> Order Information</h4>
                                <div className="detail-grid">
                                    <div className="detail-item">
                                        <span className="detail-label">Panel Order ID</span>
                                        <div className="detail-value copyable">
                                            <span>{showDetailModal.externalOrderId}</span>
                                            <button className="btn-icon" onClick={() => copyToClipboard(showDetailModal.externalOrderId)}>
                                                <Copy size={12} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="detail-item">
                                        <span className="detail-label">Panel</span>
                                        <span className="detail-value">{showDetailModal.panel?.alias || 'N/A'}</span>
                                    </div>
                                    <div className="detail-item">
                                        <span className="detail-label">Service</span>
                                        <span className="detail-value">{showDetailModal.serviceName || showDetailModal.serviceId || 'N/A'}</span>
                                    </div>
                                    <div className="detail-item">
                                        <span className="detail-label">Status</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span
                                                className="status-badge"
                                                style={{
                                                    background: STATUS_COLORS[showDetailModal.status]?.bg,
                                                    color: STATUS_COLORS[showDetailModal.status]?.color
                                                }}
                                            >
                                                {showDetailModal.status}
                                            </span>
                                            {showDetailModal.statusOverride && (
                                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                                    (overridden by {showDetailModal.statusOverrideBy})
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="detail-item">
                                        <span className="detail-label">Manual Status Override</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <select
                                                className="form-select"
                                                style={{ fontSize: '0.8125rem', padding: '4px 8px', minWidth: '140px' }}
                                                value={showDetailModal.status}
                                                disabled={statusOverriding}
                                                onChange={(e) => handleStatusOverride(showDetailModal.id, e.target.value)}
                                            >
                                                <option value="PENDING">Pending</option>
                                                <option value="IN_PROGRESS">In Progress</option>
                                                <option value="PROCESSING">Processing</option>
                                                <option value="COMPLETED">Completed</option>
                                                <option value="PARTIAL">Partial</option>
                                                <option value="CANCELLED">Cancelled</option>
                                                <option value="REFUNDED">Refunded</option>
                                            </select>
                                            {statusOverriding && <Loader2 className="animate-spin" size={14} />}
                                        </div>
                                    </div>
                                    <div className="detail-item full-width">
                                        <span className="detail-label">Link</span>
                                        <div className="detail-value copyable">
                                            <span>{showDetailModal.link || 'N/A'}</span>
                                            {showDetailModal.link && (
                                                <>
                                                    <button className="btn-icon" onClick={() => copyToClipboard(showDetailModal.link)}>
                                                        <Copy size={12} />
                                                    </button>
                                                    <a href={showDetailModal.link} target="_blank" rel="noopener noreferrer" className="btn-icon">
                                                        <ExternalLink size={12} />
                                                    </a>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Quantity Info */}
                            <div className="detail-section">
                                <h4><Hash size={16} /> Quantity & Charge</h4>
                                <div className="detail-grid">
                                    <div className="detail-item">
                                        <span className="detail-label">Quantity</span>
                                        <span className="detail-value">{showDetailModal.quantity || 'N/A'}</span>
                                    </div>
                                    <div className="detail-item">
                                        <span className="detail-label">Start Count</span>
                                        <span className="detail-value">{showDetailModal.startCount ?? 'N/A'}</span>
                                    </div>
                                    <div className="detail-item">
                                        <span className="detail-label">Remains</span>
                                        <span className="detail-value">{showDetailModal.remains ?? 'N/A'}</span>
                                    </div>
                                    <div className="detail-item">
                                        <span className="detail-label">Charge</span>
                                        <span className="detail-value">${showDetailModal.charge?.toFixed(2) || '0.00'}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Provider Info Section */}
                            <div className="detail-section provider-section">
                                <h4><Users size={16} /> Provider Information</h4>
                                {showDetailModal.providerName ? (
                                    <div className="detail-grid">
                                        <div className="detail-item">
                                            <span className="detail-label">Provider Name</span>
                                            <span className="detail-value highlight">{showDetailModal.providerName}</span>
                                        </div>
                                        <div className="detail-item">
                                            <span className="detail-label">Provider Order ID</span>
                                            <div className="detail-value copyable highlight">
                                                <span>{showDetailModal.externalProviderId || 'N/A'}</span>
                                                {showDetailModal.externalProviderId && (
                                                    <button className="btn-icon" onClick={() => copyToClipboard(showDetailModal.externalProviderId)}>
                                                        <Copy size={12} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="no-provider-info">
                                        Provider information not available. Enable Admin API on the panel to get provider-level data.
                                    </p>
                                )}
                            </div>

                            {/* Claim Status Section */}
                            <div className="detail-section claim-section">
                                <h4><UserCheck size={16} /> Claim Status</h4>
                                <div className="detail-grid">
                                    <div className="detail-item">
                                        <span className="detail-label">Claimed By</span>
                                        <span className="detail-value">
                                            {showDetailModal.claimedByWhatsapp || showDetailModal.claimedBy ||
                                                <span className="text-muted">Not claimed</span>}
                                        </span>
                                    </div>
                                    <div className="detail-item">
                                        <span className="detail-label">Claim Token</span>
                                        <span className="detail-value">
                                            {showDetailModal.claimToken || <span className="text-muted">—</span>}
                                        </span>
                                    </div>
                                    <div className="detail-item">
                                        <span className="detail-label">Last Updated</span>
                                        <span className="detail-value">
                                            {showDetailModal.updatedAt ? new Date(showDetailModal.updatedAt).toLocaleString() : 'N/A'}
                                        </span>
                                    </div>
                                    <div className="detail-item">
                                        <span className="detail-label">Created</span>
                                        <span className="detail-value">
                                            {showDetailModal.createdAt ? new Date(showDetailModal.createdAt).toLocaleString() : 'N/A'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Staff Memo Section */}
                            <div className="detail-section">
                                <h4><FileText size={16} /> Staff Memo</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    <textarea
                                        value={memoText}
                                        onChange={(e) => setMemoText(e.target.value)}
                                        placeholder="Add internal notes for this order..."
                                        maxLength={1000}
                                        style={{
                                            width: '100%', minHeight: '80px', padding: '0.625rem',
                                            background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)',
                                            borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
                                            fontSize: '0.8125rem', resize: 'vertical', outline: 'none',
                                            fontFamily: 'inherit'
                                        }}
                                    />
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                            {memoText.length}/1000
                                        </span>
                                        <button
                                            className="btn btn-primary btn-sm"
                                            onClick={() => handleSaveMemo(showDetailModal.id)}
                                            disabled={memoSaving || memoText === (showDetailModal.staffMemo || '')}
                                        >
                                            {memoSaving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                                            Save Memo
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowDetailModal(null)}>
                                Close
                            </button>
                            {showDetailModal.status !== 'COMPLETED' && showDetailModal.status !== 'CANCELLED' && (
                                <button
                                    className="btn btn-primary"
                                    onClick={() => { handleCheckStatus(showDetailModal.id); setShowDetailModal(null); }}
                                >
                                    <RefreshCw size={16} />
                                    Check Status
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                /* Stats Row - Modern Grid */
                .stats-row {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
                    gap: var(--spacing-md);
                    margin-bottom: var(--spacing-xl);
                }

                .stat-card {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-md);
                    padding: var(--spacing-lg);
                    background: var(--bg-secondary);
                    border-radius: var(--radius-lg);
                    border: 1px solid var(--border-color);
                    transition: all 0.2s;
                }
                .stat-card:hover {
                    border-color: var(--primary-500);
                    transform: translateY(-2px);
                }
                .stat-card svg {
                    color: var(--text-muted);
                }
                .stat-card > div {
                    display: flex;
                    flex-direction: column;
                }
                .stat-card .stat-value {
                    font-size: 1.5rem;
                    font-weight: 700;
                    color: var(--text-primary);
                    line-height: 1;
                }
                .stat-card .stat-label {
                    font-size: 0.75rem;
                    color: var(--text-secondary);
                    margin-top: 4px;
                }
                .stat-card.pending svg { color: #fbbf24; }
                .stat-card.progress svg { color: #3b82f6; }
                .stat-card.completed svg { color: #22c55e; }
                .stat-card.partial svg { color: #fb923c; }
                .stat-card.cancelled svg { color: #ef4444; }

                /* Filters Row - Clean Design */
                .filters-row {
                    display: flex;
                    gap: var(--spacing-md);
                    margin-bottom: var(--spacing-lg);
                    flex-wrap: wrap;
                    align-items: center;
                }

                .search-box {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-sm) var(--spacing-md);
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-md);
                    flex: 1;
                    min-width: 280px;
                    transition: all 0.2s;
                }
                .search-box:focus-within {
                    border-color: var(--primary-500);
                    box-shadow: 0 0 0 3px rgba(37, 211, 102, 0.1);
                }
                .search-box input {
                    flex: 1;
                    background: transparent;
                    border: none;
                    padding: var(--spacing-xs) 0;
                    color: var(--text-primary);
                    outline: none;
                    font-size: 0.875rem;
                }
                .search-box input::placeholder {
                    color: var(--text-muted);
                }
                .search-box svg {
                    color: var(--text-muted);
                    flex-shrink: 0;
                }

                .filters-row .form-select {
                    min-width: 150px;
                    padding: var(--spacing-sm) var(--spacing-md);
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-md);
                    color: var(--text-primary);
                    font-size: 0.875rem;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .filters-row .form-select:focus {
                    border-color: var(--primary-500);
                    outline: none;
                }

                .bulk-actions {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-md);
                    padding: var(--spacing-md);
                    background: var(--bg-secondary);
                    border: 1px solid var(--primary-500);
                    border-radius: var(--radius-md);
                    margin-bottom: var(--spacing-lg);
                }

                .bulk-actions span {
                    font-weight: 500;
                }

                .order-id-cell {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-xs);
                }

                .btn-icon {
                    background: none;
                    border: none;
                    padding: 4px;
                    cursor: pointer;
                    color: var(--text-secondary);
                    border-radius: var(--radius-sm);
                }

                .btn-icon:hover {
                    background: var(--bg-tertiary);
                    color: var(--primary-500);
                }

                .panel-alias {
                    padding: 2px 8px;
                    background: var(--bg-tertiary);
                    border-radius: var(--radius-sm);
                    font-size: 0.875rem;
                }

                .service-cell {
                    max-width: 150px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .link-cell {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-xs);
                    max-width: 200px;
                }

                .link-cell span {
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .link-cell a {
                    color: var(--primary-500);
                }

                .status-badge {
                    padding: 4px 10px;
                    border-radius: var(--radius-sm);
                    font-size: 0.75rem;
                    font-weight: 500;
                }

                .action-buttons {
                    display: flex;
                    gap: var(--spacing-xs);
                }

                .text-danger {
                    color: #ef4444 !important;
                }

                .loading-cell, .empty-cell {
                    text-align: center;
                    padding: var(--spacing-3xl) var(--spacing-lg) !important;
                    color: var(--text-secondary);
                }

                .empty-cell {
                    display: table-cell !important;
                    vertical-align: middle;
                }
                .empty-cell > div {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: var(--spacing-md);
                    padding: var(--spacing-xl) 0;
                }
                .empty-cell svg {
                    color: var(--text-muted);
                    opacity: 0.5;
                }
                .empty-cell span {
                    font-size: 0.9rem;
                }

                .loading-cell {
                    display: table-cell !important;
                }
                .loading-cell > div {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: var(--spacing-md);
                }

                .pagination {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: var(--spacing-md);
                    margin-top: var(--spacing-lg);
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

                .alert button {
                    margin-left: auto;
                    background: none;
                    border: none;
                    cursor: pointer;
                    color: inherit;
                }

                .header-actions {
                    display: flex;
                    gap: var(--spacing-md);
                }

                .provider-cell {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                    max-width: 140px;
                }

                .provider-name {
                    font-size: 0.8rem;
                    font-weight: 500;
                    color: var(--text-primary);
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .provider-id {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 0.7rem;
                    color: var(--text-secondary);
                    background: var(--bg-tertiary);
                    padding: 2px 6px;
                    border-radius: var(--radius-sm);
                    width: fit-content;
                }

                .provider-id .btn-icon {
                    padding: 2px;
                    margin-left: 2px;
                }

                .text-muted {
                    color: var(--text-tertiary);
                    font-style: italic;
                }

                /* Make table more compact for extra columns */
                .table th, .table td {
                    padding: var(--spacing-sm) var(--spacing-md);
                    font-size: 0.875rem;
                }

                .table th:first-child, .table td:first-child {
                    width: 40px;
                    padding-left: var(--spacing-sm);
                }

                /* Order Detail Modal */
                .order-detail-modal {
                    max-width: 600px;
                    width: 95%;
                }

                .detail-section {
                    padding: var(--spacing-md);
                    background: var(--bg-tertiary);
                    border-radius: var(--radius-md);
                    margin-bottom: var(--spacing-md);
                }

                .detail-section h4 {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    margin-bottom: var(--spacing-md);
                    color: var(--text-primary);
                    font-size: 0.95rem;
                }

                .detail-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: var(--spacing-md);
                }

                .detail-item {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }

                .detail-item.full-width {
                    grid-column: span 2;
                }

                .detail-label {
                    font-size: 0.75rem;
                    color: var(--text-secondary);
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                .detail-value {
                    font-size: 0.9rem;
                    color: var(--text-primary);
                    word-break: break-all;
                }

                .detail-value.copyable {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-xs);
                }

                .detail-value.highlight {
                    color: var(--primary-500);
                    font-weight: 500;
                }

                .provider-section {
                    border-left: 3px solid var(--primary-500);
                }

                .claim-section {
                    border-left: 3px solid #22c55e;
                }

                .no-provider-info {
                    color: var(--text-secondary);
                    font-size: 0.85rem;
                    padding: var(--spacing-md);
                    background: var(--bg-secondary);
                    border-radius: var(--radius-sm);
                    text-align: center;
                }

                .modal-footer {
                    display: flex;
                    justify-content: flex-end;
                    gap: var(--spacing-md);
                    padding: var(--spacing-lg);
                    border-top: 1px solid var(--border-color);
                }
            `}</style>
        </div >
    )
}
