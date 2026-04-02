import { useState, useEffect } from 'react'
import {
    FileText, Download, Eye, Calendar, DollarSign,
    Search, ChevronLeft, ChevronRight,
    RefreshCw, Loader2, X, Receipt, Hash, CreditCard
} from 'lucide-react'
import api from '../services/api'

const Invoices = () => {
    const [invoices, setInvoices] = useState([])
    const [loading, setLoading] = useState(true)
    const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 })
    const [search, setSearch] = useState('')
    const [selectedInvoice, setSelectedInvoice] = useState(null)
    const [showModal, setShowModal] = useState(false)
    const [downloading, setDownloading] = useState(null)

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
            setDownloading(invoiceId)
            const tokenRes = await api.post(`/invoices/${invoiceId}/download-token`)
            const downloadToken = tokenRes.data?.token
            if (!downloadToken) return

            const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
            const response = await fetch(`${API_URL}/invoices/${invoiceId}/download?token=${downloadToken}`)
            if (!response.ok) return

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
        } finally {
            setDownloading(null)
        }
    }

    const formatDate = (date) => new Date(date).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric'
    })

    const formatCurrency = (amount, currency = 'USD') => `$${(amount || 0).toFixed(2)}`

    const getStatusBadge = (status) => {
        const styles = {
            PAID: { bg: 'rgba(16, 185, 129, 0.12)', color: '#10b981', label: 'Paid', icon: '✓' },
            VOID: { bg: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', label: 'Void', icon: '✕' },
            REFUNDED: { bg: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b', label: 'Refunded', icon: '↩' }
        }
        const s = styles[status] || styles.PAID
        return (
            <span className="inv-status-badge" style={{ background: s.bg, color: s.color }}>
                <span>{s.icon}</span> {s.label}
            </span>
        )
    }

    const getMethodBadge = (method) => {
        const styles = {
            'BINANCE': { bg: 'rgba(243, 186, 47, 0.12)', color: '#f3ba2f', icon: '💎' },
            'CRYPTOMUS': { bg: 'rgba(99, 102, 241, 0.12)', color: '#6366f1', icon: '🪙' },
            'ESEWA': { bg: 'rgba(96, 187, 70, 0.12)', color: '#60bb46', icon: '📱' },
            'MANUAL': { bg: 'rgba(107, 114, 128, 0.12)', color: '#6b7280', icon: '🏦' },
            'VOUCHER': { bg: 'rgba(168, 85, 247, 0.12)', color: '#a855f7', icon: '🎟️' }
        }
        const s = styles[method] || { bg: 'var(--bg-tertiary)', color: 'var(--text-secondary)', icon: '💳' }
        return (
            <span className="inv-method-badge" style={{ background: s.bg, color: s.color }}>
                {s.icon} {method || 'N/A'}
            </span>
        )
    }

    const filtered = invoices.filter(inv =>
        !search || inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
        (inv.method || '').toLowerCase().includes(search.toLowerCase())
    )

    return (
        <div className="inv-page">
            {/* Header */}
            <div className="inv-header">
                <div className="inv-header-left">
                    <div className="inv-header-icon">
                        <Receipt size={26} />
                    </div>
                    <div>
                        <h1 className="inv-title">Invoices</h1>
                        <p className="inv-subtitle">View and download your payment invoices</p>
                    </div>
                </div>
                <button className="inv-btn inv-btn-secondary" onClick={fetchInvoices} disabled={loading}>
                    <RefreshCw size={15} className={loading ? 'inv-spin' : ''} />
                    Refresh
                </button>
            </div>

            {/* Stats */}
            <div className="inv-stats">
                <div className="inv-stat-card">
                    <div className="inv-stat-icon inv-stat-purple">
                        <Hash size={20} />
                    </div>
                    <div className="inv-stat-content">
                        <span className="inv-stat-value">{pagination.total}</span>
                        <span className="inv-stat-label">Total Invoices</span>
                    </div>
                </div>
                <div className="inv-stat-card">
                    <div className="inv-stat-icon inv-stat-green">
                        <DollarSign size={20} />
                    </div>
                    <div className="inv-stat-content">
                        <span className="inv-stat-value">${invoices.reduce((s, i) => s + (i.amount || 0), 0).toFixed(2)}</span>
                        <span className="inv-stat-label">Total Spent</span>
                    </div>
                </div>
                <div className="inv-stat-card">
                    <div className="inv-stat-icon inv-stat-blue">
                        <CreditCard size={20} />
                    </div>
                    <div className="inv-stat-content">
                        <span className="inv-stat-value">{invoices.filter(i => i.status === 'PAID').length}</span>
                        <span className="inv-stat-label">Paid</span>
                    </div>
                </div>
            </div>

            {/* Search */}
            <div className="inv-search-bar">
                <Search size={17} className="inv-search-icon" />
                <input
                    type="text"
                    placeholder="Search by invoice number or method..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="inv-search-input"
                />
            </div>

            {/* Content */}
            {loading ? (
                <div className="inv-empty">
                    <Loader2 size={36} className="inv-spin" />
                    <p>Loading invoices...</p>
                </div>
            ) : filtered.length === 0 ? (
                <div className="inv-empty">
                    <div className="inv-empty-icon"><FileText size={40} /></div>
                    <h3>No invoices yet</h3>
                    <p>Invoices will appear here after you make a payment</p>
                </div>
            ) : (
                <>
                    {/* Invoice Cards (Mobile) + Table (Desktop) */}
                    <div className="inv-table-wrap">
                        <table className="inv-table">
                            <thead>
                                <tr>
                                    <th>Invoice</th>
                                    <th>Date</th>
                                    <th>Method</th>
                                    <th>Amount</th>
                                    <th>Status</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(inv => (
                                    <tr key={inv.id} className="inv-row">
                                        <td>
                                            <div className="inv-number-cell">
                                                <div className="inv-number-icon">
                                                    <FileText size={14} />
                                                </div>
                                                <span className="inv-number">{inv.invoiceNumber}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <span className="inv-date">
                                                <Calendar size={13} />
                                                {formatDate(inv.paidAt)}
                                            </span>
                                        </td>
                                        <td>{getMethodBadge(inv.method)}</td>
                                        <td>
                                            <span className="inv-amount">{formatCurrency(inv.amount, inv.currency)}</span>
                                        </td>
                                        <td>{getStatusBadge(inv.status)}</td>
                                        <td>
                                            <div className="inv-actions">
                                                <button className="inv-action-btn" onClick={() => handleView(inv)} title="View">
                                                    <Eye size={15} />
                                                </button>
                                                <button
                                                    className="inv-action-btn inv-action-download"
                                                    onClick={() => handleDownload(inv.id)}
                                                    title="Download PDF"
                                                    disabled={downloading === inv.id}
                                                >
                                                    {downloading === inv.id ? <Loader2 size={15} className="inv-spin" /> : <Download size={15} />}
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
                        <div className="inv-pagination">
                            <button
                                className="inv-page-btn"
                                disabled={pagination.page <= 1}
                                onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                            >
                                <ChevronLeft size={16} /> Previous
                            </button>
                            <span className="inv-page-info">
                                Page {pagination.page} of {pagination.totalPages}
                            </span>
                            <button
                                className="inv-page-btn"
                                disabled={pagination.page >= pagination.totalPages}
                                onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                            >
                                Next <ChevronRight size={16} />
                            </button>
                        </div>
                    )}
                </>
            )}

            {/* ── Invoice Detail Modal ── */}
            {showModal && selectedInvoice && (
                <div className="inv-overlay" onClick={() => setShowModal(false)}>
                    <div className="inv-modal" onClick={(e) => e.stopPropagation()}>
                        {/* Gradient Header */}
                        <div className="inv-modal-header">
                            <div>
                                <div className="inv-modal-brand">DICREWA</div>
                                <div className="inv-modal-tagline">SMM Automation Platform</div>
                            </div>
                            <div className="inv-modal-header-right">
                                <div className="inv-modal-label">INVOICE</div>
                                <div className="inv-modal-number">{selectedInvoice.invoiceNumber}</div>
                                <button className="inv-modal-close" onClick={() => setShowModal(false)}>
                                    <X size={16} />
                                </button>
                            </div>
                        </div>

                        <div className="inv-modal-body">
                            {/* Status + Date + Method */}
                            <div className="inv-modal-meta">
                                <div className="inv-modal-meta-left">
                                    {getStatusBadge(selectedInvoice.status)}
                                    <span className="inv-modal-date">
                                        <Calendar size={13} />
                                        {formatDate(selectedInvoice.paidAt)}
                                    </span>
                                </div>
                                {getMethodBadge(selectedInvoice.method)}
                            </div>

                            {/* Bill To */}
                            {selectedInvoice.user && (
                                <div className="inv-modal-billto">
                                    <div className="inv-modal-billto-label">Bill To</div>
                                    <div className="inv-modal-billto-name">{selectedInvoice.user.name || selectedInvoice.user.username || 'Customer'}</div>
                                    {selectedInvoice.user.email && (
                                        <div className="inv-modal-billto-email">{selectedInvoice.user.email}</div>
                                    )}
                                </div>
                            )}

                            {/* Line Items */}
                            <div className="inv-modal-items">
                                <div className="inv-modal-items-header">
                                    <span>Description</span>
                                    <span style={{ textAlign: 'center' }}>Qty</span>
                                    <span style={{ textAlign: 'right' }}>Amount</span>
                                </div>
                                {(selectedInvoice.items || []).map((item, i) => (
                                    <div key={i} className={`inv-modal-item ${i % 2 === 0 ? 'inv-modal-item-alt' : ''}`}>
                                        <span>{item.description}</span>
                                        <span style={{ textAlign: 'center' }}>{item.quantity || 1}</span>
                                        <span style={{ textAlign: 'right', fontWeight: 500 }}>
                                            {formatCurrency(item.amount, selectedInvoice.currency)}
                                        </span>
                                    </div>
                                ))}
                                <div className="inv-modal-total">
                                    <strong>Total</strong>
                                    <strong className="inv-modal-total-amount">
                                        {formatCurrency(selectedInvoice.amount, selectedInvoice.currency)} {selectedInvoice.currency}
                                    </strong>
                                </div>
                            </div>

                            {/* Download */}
                            <button
                                className="inv-download-btn"
                                onClick={() => handleDownload(selectedInvoice.id)}
                                disabled={downloading === selectedInvoice.id}
                            >
                                {downloading === selectedInvoice.id
                                    ? <Loader2 size={16} className="inv-spin" />
                                    : <Download size={16} />}
                                Download PDF Invoice
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                /* ─── INVOICE PAGE STYLES ─── */
                .inv-page { padding: 1.5rem; max-width: 1200px; margin: 0 auto; }

                /* Header */
                .inv-header {
                    display: flex; align-items: center; justify-content: space-between;
                    margin-bottom: 1.75rem; flex-wrap: wrap; gap: 1rem;
                }
                .inv-header-left { display: flex; align-items: center; gap: 1rem; }
                .inv-header-icon {
                    width: 52px; height: 52px; border-radius: 14px;
                    background: linear-gradient(135deg, #6c5ce7, #a55eea);
                    display: flex; align-items: center; justify-content: center;
                    color: #fff; box-shadow: 0 4px 16px rgba(108,92,231,0.3);
                    flex-shrink: 0;
                }
                .inv-title { font-size: 1.5rem; font-weight: 700; color: var(--text-primary); margin: 0; }
                .inv-subtitle { font-size: 0.875rem; color: var(--text-secondary); margin: 0.15rem 0 0; }
                .inv-btn {
                    display: inline-flex; align-items: center; gap: 0.5rem;
                    padding: 0.55rem 1.1rem; border-radius: 10px; font-size: 0.85rem;
                    font-weight: 600; border: none; cursor: pointer; transition: all 0.2s;
                    font-family: inherit;
                }
                .inv-btn-secondary {
                    background: var(--bg-card); color: var(--text-secondary);
                    border: 1px solid var(--border-color);
                }
                .inv-btn-secondary:hover { background: var(--bg-tertiary); color: var(--text-primary); }
                .inv-btn:disabled { opacity: 0.5; cursor: not-allowed; }

                /* Stats */
                .inv-stats {
                    display: grid; grid-template-columns: repeat(3, 1fr);
                    gap: 1rem; margin-bottom: 1.5rem;
                }
                @media (max-width: 640px) { .inv-stats { grid-template-columns: 1fr; } }
                .inv-stat-card {
                    background: var(--bg-card); border: 1px solid var(--border-color);
                    border-radius: 14px; padding: 1.25rem;
                    display: flex; align-items: center; gap: 1rem;
                    transition: all 0.2s;
                }
                .inv-stat-card:hover { border-color: var(--border-color-hover); transform: translateY(-2px); box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
                .inv-stat-icon {
                    width: 44px; height: 44px; border-radius: 12px;
                    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
                }
                .inv-stat-purple { background: rgba(108,92,231,0.12); color: #6c5ce7; }
                .inv-stat-green { background: rgba(16,185,129,0.12); color: #10b981; }
                .inv-stat-blue { background: rgba(59,130,246,0.12); color: #3b82f6; }
                .inv-stat-content { display: flex; flex-direction: column; }
                .inv-stat-value { font-size: 1.35rem; font-weight: 700; color: var(--text-primary); line-height: 1.2; }
                .inv-stat-label { font-size: 0.75rem; color: var(--text-muted); margin-top: 2px; }

                /* Search */
                .inv-search-bar {
                    position: relative; margin-bottom: 1.25rem;
                }
                .inv-search-icon {
                    position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
                    color: var(--text-muted);
                }
                .inv-search-input {
                    width: 100%; padding: 0.7rem 0.85rem 0.7rem 2.5rem;
                    background: var(--bg-card); border: 1px solid var(--border-color);
                    border-radius: 10px; font-size: 0.875rem; color: var(--text-primary);
                    outline: none; transition: all 0.2s; font-family: inherit;
                }
                .inv-search-input:focus {
                    border-color: #6c5ce7; box-shadow: 0 0 0 3px rgba(108,92,231,0.12);
                }
                .inv-search-input::placeholder { color: var(--text-muted); }

                /* Table */
                .inv-table-wrap {
                    background: var(--bg-card); border: 1px solid var(--border-color);
                    border-radius: 14px; overflow: hidden;
                }
                .inv-table { width: 100%; border-collapse: collapse; }
                .inv-table thead th {
                    padding: 0.85rem 1.15rem; font-size: 0.75rem; font-weight: 600;
                    color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;
                    background: var(--bg-tertiary); border-bottom: 1px solid var(--border-color);
                    text-align: left; white-space: nowrap;
                }
                .inv-table tbody td {
                    padding: 0.9rem 1.15rem; font-size: 0.875rem; color: var(--text-primary);
                    border-bottom: 1px solid var(--border-color);
                    vertical-align: middle;
                }
                .inv-row { transition: background 0.15s; }
                .inv-row:hover { background: var(--bg-tertiary); }
                .inv-row:last-child td { border-bottom: none; }

                /* Invoice Number Cell */
                .inv-number-cell { display: flex; align-items: center; gap: 10px; }
                .inv-number-icon {
                    width: 30px; height: 30px; border-radius: 8px;
                    background: rgba(108,92,231,0.1); color: #6c5ce7;
                    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
                }
                .inv-number { font-family: 'SF Mono', 'Fira Code', monospace; font-weight: 600; font-size: 0.8rem; }

                /* Date */
                .inv-date {
                    display: inline-flex; align-items: center; gap: 5px;
                    color: var(--text-secondary); font-size: 0.825rem;
                }

                /* Badges */
                .inv-status-badge {
                    display: inline-flex; align-items: center; gap: 4px;
                    padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 600;
                }
                .inv-method-badge {
                    display: inline-flex; align-items: center; gap: 5px;
                    padding: 4px 10px; border-radius: 8px; font-size: 0.8rem; font-weight: 500;
                }

                /* Amount */
                .inv-amount { font-weight: 700; color: #10b981; font-size: 0.95rem; }

                /* Actions */
                .inv-actions { display: flex; gap: 4px; justify-content: flex-end; }
                .inv-action-btn {
                    width: 32px; height: 32px; border-radius: 8px;
                    display: flex; align-items: center; justify-content: center;
                    border: 1px solid var(--border-color); background: var(--bg-secondary);
                    color: var(--text-secondary); cursor: pointer; transition: all 0.15s;
                }
                .inv-action-btn:hover {
                    border-color: #6c5ce7; color: #6c5ce7; background: rgba(108,92,231,0.06);
                }
                .inv-action-download:hover {
                    border-color: #10b981; color: #10b981; background: rgba(16,185,129,0.06);
                }
                .inv-action-btn:disabled { opacity: 0.4; cursor: not-allowed; }

                /* Pagination */
                .inv-pagination {
                    display: flex; align-items: center; justify-content: center;
                    gap: 0.75rem; margin-top: 1.25rem;
                }
                .inv-page-btn {
                    display: inline-flex; align-items: center; gap: 4px;
                    padding: 0.45rem 0.85rem; border-radius: 8px;
                    background: var(--bg-card); border: 1px solid var(--border-color);
                    font-size: 0.8rem; font-weight: 500; color: var(--text-secondary);
                    cursor: pointer; transition: all 0.15s; font-family: inherit;
                }
                .inv-page-btn:hover:not(:disabled) { border-color: #6c5ce7; color: #6c5ce7; }
                .inv-page-btn:disabled { opacity: 0.35; cursor: not-allowed; }
                .inv-page-info {
                    padding: 0.45rem 0.85rem; border-radius: 8px;
                    background: var(--bg-tertiary); font-size: 0.8rem;
                    color: var(--text-secondary); font-weight: 500;
                }

                /* Empty / Loading */
                .inv-empty {
                    display: flex; flex-direction: column; align-items: center;
                    justify-content: center; padding: 3.5rem 1.5rem; text-align: center;
                    color: var(--text-muted);
                }
                .inv-empty-icon {
                    width: 72px; height: 72px; border-radius: 20px;
                    background: var(--bg-tertiary); display: flex; align-items: center;
                    justify-content: center; margin-bottom: 1rem; color: var(--text-muted);
                }
                .inv-empty h3 { color: var(--text-primary); margin: 0 0 0.35rem; font-size: 1.1rem; }
                .inv-empty p { font-size: 0.875rem; margin: 0; }

                /* Spin animation */
                @keyframes invSpin { to { transform: rotate(360deg); } }
                .inv-spin { animation: invSpin 1s linear infinite; }

                /* ─── MODAL ─── */
                .inv-overlay {
                    position: fixed; inset: 0; z-index: 1000;
                    background: rgba(0,0,0,0.55); backdrop-filter: blur(6px);
                    display: flex; align-items: center; justify-content: center;
                    padding: 20px; animation: invFadeIn 0.2s ease;
                }
                @keyframes invFadeIn { from { opacity: 0; } to { opacity: 1; } }
                .inv-modal {
                    width: 100%; max-width: 560px; max-height: 85vh;
                    background: var(--bg-card); border: 1px solid var(--border-color);
                    border-radius: 16px; overflow: hidden;
                    display: flex; flex-direction: column;
                    box-shadow: 0 25px 60px rgba(0,0,0,0.3);
                    animation: invSlideUp 0.25s ease;
                }
                @keyframes invSlideUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                /* Modal Header */
                .inv-modal-header {
                    background: linear-gradient(135deg, #6c5ce7 0%, #a55eea 100%);
                    padding: 22px 26px; display: flex; justify-content: space-between;
                    align-items: flex-start; flex-shrink: 0;
                }
                .inv-modal-brand { font-size: 22px; font-weight: 700; color: #fff; letter-spacing: 0.5px; }
                .inv-modal-tagline { font-size: 11px; color: rgba(255,255,255,0.65); margin-top: 2px; }
                .inv-modal-header-right { text-align: right; }
                .inv-modal-label {
                    font-size: 10px; color: rgba(255,255,255,0.55);
                    text-transform: uppercase; letter-spacing: 1.5px;
                }
                .inv-modal-number {
                    font-size: 14px; font-weight: 600; color: #fff;
                    font-family: 'SF Mono', 'Fira Code', monospace; margin-top: 2px;
                }
                .inv-modal-close {
                    background: rgba(255,255,255,0.15); border: none; border-radius: 6px;
                    color: #fff; padding: 5px 7px; cursor: pointer; margin-top: 8px;
                    margin-left: auto; display: flex; transition: background 0.15s;
                }
                .inv-modal-close:hover { background: rgba(255,255,255,0.25); }

                /* Modal Body */
                .inv-modal-body {
                    padding: 22px 26px; overflow-y: auto; flex: 1;
                }

                /* Meta Row */
                .inv-modal-meta {
                    display: flex; align-items: center; justify-content: space-between;
                    padding-bottom: 16px; margin-bottom: 18px;
                    border-bottom: 1px solid var(--border-color); flex-wrap: wrap; gap: 8px;
                }
                .inv-modal-meta-left { display: flex; align-items: center; gap: 10px; }
                .inv-modal-date {
                    display: inline-flex; align-items: center; gap: 5px;
                    color: var(--text-secondary); font-size: 0.825rem;
                }

                /* Bill To */
                .inv-modal-billto {
                    background: var(--bg-secondary); border: 1px solid var(--border-color);
                    border-radius: 10px; padding: 14px 16px; margin-bottom: 18px;
                }
                .inv-modal-billto-label {
                    font-size: 10px; text-transform: uppercase; color: var(--text-muted);
                    letter-spacing: 1px; font-weight: 600; margin-bottom: 5px;
                }
                .inv-modal-billto-name { font-size: 14px; font-weight: 600; color: var(--text-primary); }
                .inv-modal-billto-email { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }

                /* Items */
                .inv-modal-items {
                    border: 1px solid var(--border-color); border-radius: 10px;
                    overflow: hidden; margin-bottom: 20px;
                }
                .inv-modal-items-header {
                    display: grid; grid-template-columns: 1fr 50px 80px;
                    gap: 10px; padding: 10px 16px; background: var(--bg-tertiary);
                    font-size: 10px; font-weight: 600; color: var(--text-muted);
                    text-transform: uppercase; letter-spacing: 0.5px;
                }
                .inv-modal-item {
                    display: grid; grid-template-columns: 1fr 50px 80px;
                    gap: 10px; padding: 11px 16px; font-size: 13px;
                    color: var(--text-primary); border-top: 1px solid var(--border-color);
                }
                .inv-modal-item-alt { background: var(--bg-secondary); }
                .inv-modal-total {
                    display: flex; justify-content: space-between; padding: 13px 16px;
                    border-top: 2px solid #6c5ce7; background: rgba(108,92,231,0.05);
                }
                .inv-modal-total strong { font-size: 15px; }
                .inv-modal-total-amount { color: #6c5ce7; font-size: 17px !important; }

                /* Download button */
                .inv-download-btn {
                    width: 100%; padding: 12px; border: none; border-radius: 10px;
                    background: linear-gradient(135deg, #6c5ce7, #a55eea);
                    color: #fff; font-size: 14px; font-weight: 600; cursor: pointer;
                    display: flex; align-items: center; justify-content: center; gap: 8px;
                    transition: all 0.2s; font-family: inherit;
                    box-shadow: 0 4px 15px rgba(108,92,231,0.3);
                }
                .inv-download-btn:hover:not(:disabled) {
                    transform: translateY(-1px); box-shadow: 0 6px 20px rgba(108,92,231,0.4);
                }
                .inv-download-btn:disabled { opacity: 0.6; cursor: not-allowed; }

                /* Responsive */
                @media (max-width: 768px) {
                    .inv-page { padding: 1rem; }
                    .inv-table thead { display: none; }
                    .inv-table, .inv-table tbody, .inv-table tr, .inv-table td {
                        display: block; width: 100%;
                    }
                    .inv-table tr {
                        padding: 1rem; border-bottom: 1px solid var(--border-color);
                        display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
                    }
                    .inv-table td { border-bottom: none; padding: 0; }
                    .inv-table td:last-child { margin-left: auto; }
                    .inv-modal { max-width: 100%; }
                    .inv-modal-header { padding: 18px 20px; }
                    .inv-modal-body { padding: 18px 20px; }
                }
            `}</style>
        </div>
    )
}

export default Invoices
