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
            // First, get a download token (authenticated)
            const tokenRes = await api.post(`/invoices/${invoiceId}/download-token`)
            const downloadToken = tokenRes.data?.token
            
            if (!downloadToken) {
                console.error('Failed to get download token')
                return
            }
            
            // Use raw fetch with the token to get PDF binary
            // (can't use api interceptor — it unwraps response.data and corrupts binary)
            const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
            const response = await fetch(`${API_URL}/invoices/${invoiceId}/download?token=${downloadToken}`)
            
            if (!response.ok) {
                console.error('PDF download failed:', response.status)
                return
            }
            
            const blob = await response.blob()
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
                    <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560, borderRadius: 16, overflow: 'hidden' }}>
                        {/* Branded Header */}
                        <div style={{
                            background: 'linear-gradient(135deg, #6c5ce7 0%, #a55eea 100%)',
                            padding: '24px 28px',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'
                        }}>
                            <div>
                                <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', letterSpacing: '0.5px' }}>DICREWA</div>
                                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>SMM Automation Platform</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '1px' }}>Invoice</div>
                                <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', fontFamily: 'monospace', marginTop: 2 }}>{selectedInvoice.invoiceNumber}</div>
                                <button onClick={() => setShowModal(false)} style={{
                                    background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8,
                                    color: '#fff', padding: '4px 8px', cursor: 'pointer', marginTop: 8,
                                    fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto'
                                }}>
                                    <X size={14} /> Close
                                </button>
                            </div>
                        </div>

                        <div style={{ padding: '24px 28px' }}>
                            {/* Status + Date Row */}
                            <div style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border-color)'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    {getStatusBadge(selectedInvoice.status)}
                                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                        {formatDate(selectedInvoice.paidAt)}
                                    </span>
                                </div>
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    background: 'var(--bg-tertiary)', padding: '5px 12px',
                                    borderRadius: 8, fontSize: 13
                                }}>
                                    <span>{getMethodIcon(selectedInvoice.method)}</span>
                                    <span style={{ fontWeight: 500 }}>{selectedInvoice.method}</span>
                                </div>
                            </div>

                            {/* Bill To Section */}
                            {selectedInvoice.user && (
                                <div style={{
                                    background: 'var(--bg-secondary)', borderRadius: 10,
                                    padding: '14px 16px', marginBottom: 20,
                                    border: '1px solid var(--border-color)'
                                }}>
                                    <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '1px', marginBottom: 6, fontWeight: 600 }}>Bill To</div>
                                    <div style={{ fontSize: 14, fontWeight: 600 }}>{selectedInvoice.user.name || selectedInvoice.user.username || 'Customer'}</div>
                                    {selectedInvoice.user.email && (
                                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{selectedInvoice.user.email}</div>
                                    )}
                                </div>
                            )}

                            {/* Line Items */}
                            <div style={{
                                borderRadius: 10, overflow: 'hidden',
                                border: '1px solid var(--border-color)', marginBottom: 20
                            }}>
                                {/* Items Header */}
                                <div style={{
                                    display: 'grid', gridTemplateColumns: '1fr auto auto',
                                    gap: 12, padding: '10px 16px',
                                    background: 'var(--bg-tertiary)',
                                    fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
                                    textTransform: 'uppercase', letterSpacing: '0.5px'
                                }}>
                                    <span>Description</span>
                                    <span style={{ textAlign: 'center', minWidth: 40 }}>Qty</span>
                                    <span style={{ textAlign: 'right', minWidth: 70 }}>Amount</span>
                                </div>
                                {/* Item Rows */}
                                {(selectedInvoice.items || []).map((item, i) => (
                                    <div key={i} style={{
                                        display: 'grid', gridTemplateColumns: '1fr auto auto',
                                        gap: 12, padding: '12px 16px',
                                        borderTop: '1px solid var(--border-color)',
                                        background: i % 2 === 0 ? 'transparent' : 'var(--bg-secondary)',
                                        fontSize: 13
                                    }}>
                                        <span style={{ color: 'var(--text-primary)' }}>{item.description}</span>
                                        <span style={{ textAlign: 'center', minWidth: 40, color: 'var(--text-secondary)' }}>
                                            {item.quantity || 1}
                                        </span>
                                        <span style={{ textAlign: 'right', minWidth: 70, fontWeight: 500 }}>
                                            {formatCurrency(item.amount, selectedInvoice.currency)}
                                        </span>
                                    </div>
                                ))}
                                {/* Total Row */}
                                <div style={{
                                    display: 'flex', justifyContent: 'space-between',
                                    padding: '14px 16px',
                                    borderTop: '2px solid #6c5ce7',
                                    background: 'rgba(108, 92, 231, 0.05)'
                                }}>
                                    <strong style={{ fontSize: 15 }}>Total</strong>
                                    <strong style={{ fontSize: 17, color: '#6c5ce7' }}>
                                        {formatCurrency(selectedInvoice.amount, selectedInvoice.currency)}
                                    </strong>
                                </div>
                            </div>

                            {/* Download Button */}
                            <button
                                className="btn btn-primary"
                                style={{
                                    width: '100%', padding: '12px',
                                    background: 'linear-gradient(135deg, #6c5ce7, #a55eea)',
                                    border: 'none', borderRadius: 10,
                                    fontSize: 14, fontWeight: 600,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                                }}
                                onClick={() => handleDownload(selectedInvoice.id)}
                            >
                                <Download size={16} /> Download PDF
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default Invoices
