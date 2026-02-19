import { useState, useEffect } from 'react'
import {
    FileText, Download, Eye, Calendar, DollarSign,
    CreditCard, Search, ChevronLeft, ChevronRight,
    RefreshCw, Loader2, X, ExternalLink, Receipt
} from 'lucide-react'
import api from '../services/api'

const Invoices = () => {
    const [invoices, setInvoices] = useState([])
    const [loading, setLoading] = useState(true)
    const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 })
    const [search, setSearch] = useState('')
    const [selectedInvoice, setSelectedInvoice] = useState(null)
    const [showModal, setShowModal] = useState(false)

    useEffect(() => {
        fetchInvoices()
    }, [pagination.page])

    const fetchInvoices = async () => {
        try {
            setLoading(true)
            const res = await api.get(`/invoices?page=${pagination.page}&limit=${pagination.limit}`)
            setInvoices(res.data || [])
            setPagination(prev => ({ ...prev, ...res.pagination }))
        } catch (err) {
            console.error('Failed to load invoices:', err)
        } finally {
            setLoading(false)
        }
    }

    const handleView = async (invoice) => {
        try {
            const res = await api.get(`/invoices/${invoice.id}`)
            setSelectedInvoice(res.data)
            setShowModal(true)
        } catch (err) {
            console.error('Failed to load invoice:', err)
        }
    }

    const handleDownload = async (invoiceId) => {
        try {
            const res = await api.get(`/invoices/${invoiceId}/download`, {
                responseType: 'blob'
            })
            // api interceptor returns response.data, so res is the blob
            const blob = res instanceof Blob ? res : new Blob([res])
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `invoice-${invoiceId}.pdf`
            document.body.appendChild(a)
            a.click()
            a.remove()
            window.URL.revokeObjectURL(url)
        } catch (err) {
            console.error('Failed to download invoice:', err)
        }
    }

    const formatDate = (date) => {
        return new Date(date).toLocaleDateString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric'
        })
    }

    const formatCurrency = (amount, currency = 'USD') => {
        return `$${(amount || 0).toFixed(2)} ${currency}`
    }

    const getStatusBadge = (status) => {
        const styles = {
            PAID: { bg: 'rgba(46, 213, 115, 0.15)', color: '#2ed573', label: 'Paid' },
            VOID: { bg: 'rgba(255, 71, 87, 0.15)', color: '#ff4757', label: 'Void' },
            REFUNDED: { bg: 'rgba(255, 165, 2, 0.15)', color: '#ffa502', label: 'Refunded' }
        }
        const s = styles[status] || styles.PAID
        return (
            <span style={{
                background: s.bg, color: s.color, padding: '4px 12px',
                borderRadius: '20px', fontSize: '12px', fontWeight: 600
            }}>
                {s.label}
            </span>
        )
    }

    const getMethodIcon = (method) => {
        const icons = {
            'BINANCE': '💎',
            'CRYPTOMUS': '🪙',
            'ESEWA': '📱',
            'MANUAL': '🏦',
            'VOUCHER': '🎟️'
        }
        return icons[method] || '💳'
    }

    const filtered = invoices.filter(inv =>
        !search || inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
        (inv.method || '').toLowerCase().includes(search.toLowerCase())
    )

    return (
        <div className="page-container">
            <div className="page-header">
                <div className="header-content">
                    <div className="header-title-section">
                        <h1><Receipt size={28} style={{ marginRight: 10, color: 'var(--primary)' }} /> Invoices</h1>
                        <p className="subtitle">View and download your payment invoices</p>
                    </div>
                    <button className="btn btn-secondary" onClick={fetchInvoices} disabled={loading}>
                        <RefreshCw size={16} className={loading ? 'spinning' : ''} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="stats-grid" style={{ marginBottom: 24 }}>
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'rgba(108, 92, 231, 0.15)', color: '#6c5ce7' }}>
                        <FileText size={22} />
                    </div>
                    <div className="stat-info">
                        <span className="stat-label">Total Invoices</span>
                        <span className="stat-value">{pagination.total}</span>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'rgba(46, 213, 115, 0.15)', color: '#2ed573' }}>
                        <DollarSign size={22} />
                    </div>
                    <div className="stat-info">
                        <span className="stat-label">Total Spent</span>
                        <span className="stat-value">
                            ${invoices.reduce((sum, inv) => sum + (inv.amount || 0), 0).toFixed(2)}
                        </span>
                    </div>
                </div>
            </div>

            {/* Search */}
            <div className="search-section" style={{ marginBottom: 20 }}>
                <div className="search-box">
                    <Search size={18} />
                    <input
                        type="text"
                        placeholder="Search by invoice number or method..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            {/* Table */}
            {loading ? (
                <div className="loading-state">
                    <Loader2 size={32} className="spinning" />
                    <p>Loading invoices...</p>
                </div>
            ) : filtered.length === 0 ? (
                <div className="empty-state">
                    <FileText size={48} />
                    <h3>No invoices yet</h3>
                    <p>Invoices will appear here after you make a payment</p>
                </div>
            ) : (
                <>
                    <div className="table-container">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Invoice #</th>
                                    <th>Date</th>
                                    <th>Method</th>
                                    <th>Amount</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(inv => (
                                    <tr key={inv.id}>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <FileText size={16} style={{ color: 'var(--primary)' }} />
                                                <strong style={{ fontSize: 13, fontFamily: 'monospace' }}>{inv.invoiceNumber}</strong>
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <Calendar size={14} style={{ opacity: 0.5 }} />
                                                {formatDate(inv.paidAt)}
                                            </div>
                                        </td>
                                        <td>
                                            <span style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                                background: 'var(--bg-tertiary)', padding: '4px 10px',
                                                borderRadius: 6, fontSize: 13
                                            }}>
                                                {getMethodIcon(inv.method)} {inv.method || 'N/A'}
                                            </span>
                                        </td>
                                        <td>
                                            <strong style={{ color: 'var(--success)', fontSize: 14 }}>
                                                {formatCurrency(inv.amount, inv.currency)}
                                            </strong>
                                        </td>
                                        <td>{getStatusBadge(inv.status)}</td>
                                        <td>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <button
                                                    className="btn btn-sm btn-ghost"
                                                    onClick={() => handleView(inv)}
                                                    title="View Details"
                                                >
                                                    <Eye size={15} />
                                                </button>
                                                <button
                                                    className="btn btn-sm btn-ghost"
                                                    onClick={() => handleDownload(inv.id)}
                                                    title="Download Invoice"
                                                >
                                                    <Download size={15} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {pagination.totalPages > 1 && (
                        <div className="pagination" style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
                            <button
                                className="btn btn-sm btn-secondary"
                                disabled={pagination.page <= 1}
                                onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                            >
                                <ChevronLeft size={16} /> Prev
                            </button>
                            <span style={{
                                display: 'flex', alignItems: 'center', gap: 4,
                                padding: '4px 12px', background: 'var(--bg-tertiary)',
                                borderRadius: 6, fontSize: 13
                            }}>
                                Page {pagination.page} of {pagination.totalPages}
                            </span>
                            <button
                                className="btn btn-sm btn-secondary"
                                disabled={pagination.page >= pagination.totalPages}
                                onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                            >
                                Next <ChevronRight size={16} />
                            </button>
                        </div>
                    )}
                </>
            )}

            {/* Invoice Detail Modal */}
            {showModal && selectedInvoice && (
                <div className="modal-overlay open" onClick={() => setShowModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 550 }}>
                        <div className="modal-header">
                            <h3><FileText size={20} /> Invoice {selectedInvoice.invoiceNumber}</h3>
                            <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="modal-body" style={{ padding: 24 }}>
                            <div style={{
                                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
                                marginBottom: 20
                            }}>
                                <div>
                                    <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Invoice Number</label>
                                    <strong style={{ fontFamily: 'monospace' }}>{selectedInvoice.invoiceNumber}</strong>
                                </div>
                                <div>
                                    <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Status</label>
                                    {getStatusBadge(selectedInvoice.status)}
                                </div>
                                <div>
                                    <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Payment Date</label>
                                    {formatDate(selectedInvoice.paidAt)}
                                </div>
                                <div>
                                    <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Payment Method</label>
                                    {getMethodIcon(selectedInvoice.method)} {selectedInvoice.method}
                                </div>
                            </div>

                            <div style={{
                                background: 'var(--bg-secondary)', borderRadius: 8,
                                padding: 16, marginBottom: 16
                            }}>
                                <h4 style={{ marginBottom: 12, fontSize: 14 }}>Line Items</h4>
                                {(selectedInvoice.items || []).map((item, i) => (
                                    <div key={i} style={{
                                        display: 'flex', justifyContent: 'space-between',
                                        padding: '8px 0', borderBottom: '1px solid var(--border-color)'
                                    }}>
                                        <span>{item.description}</span>
                                        <strong>{formatCurrency(item.amount, selectedInvoice.currency)}</strong>
                                    </div>
                                ))}
                                <div style={{
                                    display: 'flex', justifyContent: 'space-between',
                                    padding: '12px 0 0', marginTop: 8
                                }}>
                                    <strong style={{ fontSize: 15 }}>Total</strong>
                                    <strong style={{ fontSize: 16, color: 'var(--primary)' }}>
                                        {formatCurrency(selectedInvoice.amount, selectedInvoice.currency)}
                                    </strong>
                                </div>
                            </div>

                            <button
                                className="btn btn-primary"
                                style={{ width: '100%' }}
                                onClick={() => handleDownload(selectedInvoice.id)}
                            >
                                <Download size={16} /> Download Invoice
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default Invoices
