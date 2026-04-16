import { useState, useEffect, useMemo } from 'react'
import {
    Receipt, Search, Calendar, ChevronLeft, ChevronRight,
    Loader2, ArrowUpDown, User, DollarSign, X, RefreshCw,
    ArrowDownLeft, ArrowUpRight, Download
} from 'lucide-react'
import api from '../../services/api'

/**
 * TransactionLogs.jsx — Section 4.4 from spec
 * Shows ONLY credit transactions (package purchases, subscription payments, manual adjustments)
 * Does not mix with general payment gateway / eSewa / Binance histories
 */
export default function TransactionLogs() {
    const [transactions, setTransactions] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [typeFilter, setTypeFilter] = useState('')
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')
    const [sortField, setSortField] = useState('createdAt')
    const [sortDir, setSortDir] = useState('desc')
    const [pagination, setPagination] = useState({ page: 1, limit: 30, total: 0, totalPages: 0 })
    const [stats, setStats] = useState({ totalCredit: 0, totalDebit: 0, count: 0 })
    const [refreshKey, setRefreshKey] = useState(0)

    useEffect(() => {
        fetchTransactions()
    }, [pagination.page, typeFilter, refreshKey])

    const fetchTransactions = async () => {
        try {
            setLoading(true)
            const params = new URLSearchParams({
                page: pagination.page.toString(),
                limit: pagination.limit.toString()
            })
            if (typeFilter) params.append('type', typeFilter)
            if (dateFrom) params.append('startDate', dateFrom)
            if (dateTo) {
                const to = new Date(dateTo)
                to.setHours(23, 59, 59, 999)
                params.append('endDate', to.toISOString())
            }

            const res = await api.get(`/wallet/admin/transaction-logs?${params}`)
            const data = res.data || []
            setTransactions(data)
            if (res.pagination) {
                setPagination(prev => ({
                    ...prev,
                    total: res.pagination.total,
                    totalPages: res.pagination.totalPages || Math.ceil(res.pagination.total / prev.limit)
                }))
            }
            if (res.stats) setStats(res.stats)
        } catch (err) {
            setError(err.error?.message || err.message || 'Failed to load transactions')
        } finally {
            setLoading(false)
        }
    }

    // Client-side search filter
    const filteredTxs = useMemo(() => {
        if (!searchQuery.trim()) return transactions
        const q = searchQuery.toLowerCase()
        return transactions.filter(t =>
            t.user?.username?.toLowerCase().includes(q) ||
            t.user?.name?.toLowerCase().includes(q) ||
            t.user?.email?.toLowerCase().includes(q) ||
            t.description?.toLowerCase().includes(q) ||
            t.reference?.toLowerCase().includes(q) ||
            String(t.amount).includes(q)
        )
    }, [transactions, searchQuery])

    // Client-side sort
    const sortedTxs = useMemo(() => {
        const sorted = [...filteredTxs]
        sorted.sort((a, b) => {
            let valA, valB
            switch (sortField) {
                case 'amount': valA = a.amount; valB = b.amount; break
                case 'user': valA = (a.user?.username || '').toLowerCase(); valB = (b.user?.username || '').toLowerCase(); break
                case 'createdAt':
                default:
                    valA = new Date(a.createdAt); valB = new Date(b.createdAt); break
            }
            if (valA < valB) return sortDir === 'asc' ? -1 : 1
            if (valA > valB) return sortDir === 'asc' ? 1 : -1
            return 0
        })
        return sorted
    }, [filteredTxs, sortField, sortDir])

    const toggleSort = (field) => {
        if (sortField === field) {
            setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
        } else {
            setSortField(field)
            setSortDir('desc')
        }
    }

    const handleExport = () => {
        if (sortedTxs.length === 0) return
        const csvHeader = 'Date,User,Email,Type,Amount,BalanceBefore,BalanceAfter,Description,Reference\n'
        const csvRows = sortedTxs.map(t =>
            `"${new Date(t.createdAt).toISOString()}","${t.user?.username || ''}","${t.user?.email || ''}","${t.type}",${t.amount},${t.balanceBefore ?? ''},${t.balanceAfter ?? ''},"${(t.description || '').replace(/"/g, '""')}","${t.reference || ''}"`
        ).join('\n')
        const blob = new Blob([csvHeader + csvRows], { type: 'text/csv' })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `transaction_logs_${new Date().toISOString().slice(0, 10)}.csv`
        a.click()
        window.URL.revokeObjectURL(url)
    }

    const formatCurrency = (amount) => `$${(amount || 0).toFixed(2)}`
    const formatDate = (date) => new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    const formatTime = (date) => new Date(date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

    return (
        <div className="tl-page">
            {/* Header */}
            <div className="tl-header">
                <div className="tl-header-left">
                    <div className="tl-header-icon">
                        <Receipt size={28} />
                    </div>
                    <div>
                        <h1>Transaction Logs</h1>
                        <p>Credit & debit transactions — package purchases, subscriptions, and manual adjustments</p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="tl-btn tl-btn-ghost" onClick={handleExport} disabled={sortedTxs.length === 0}>
                        <Download size={16} /> Export
                    </button>
                    <button className="tl-btn tl-btn-ghost" onClick={() => { setPagination(p => ({ ...p, page: 1 })); setRefreshKey(k => k + 1) }}>
                        <RefreshCw size={16} /> Refresh
                    </button>
                </div>
            </div>

            {error && (
                <div className="tl-alert tl-alert-error">
                    <span>{error}</span>
                    <button onClick={() => setError(null)}><X size={14} /></button>
                </div>
            )}

            {/* Stats */}
            <div className="tl-stats">
                <div className={`tl-stat-card ${typeFilter === '' ? 'active' : ''}`} onClick={() => { setTypeFilter(''); setPagination(p => ({ ...p, page: 1 })) }}>
                    <div className="tl-stat-icon" style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)' }}>
                        <Receipt size={20} />
                    </div>
                    <div className="tl-stat-info">
                        <span className="tl-stat-label">All Transactions</span>
                        <span className="tl-stat-value">{stats.count}</span>
                    </div>
                </div>
                <div className={`tl-stat-card ${typeFilter === 'CREDIT' ? 'active' : ''}`} onClick={() => { setTypeFilter('CREDIT'); setPagination(p => ({ ...p, page: 1 })) }}>
                    <div className="tl-stat-icon" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                        <ArrowDownLeft size={20} />
                    </div>
                    <div className="tl-stat-info">
                        <span className="tl-stat-label">Total Credits</span>
                        <span className="tl-stat-value">{formatCurrency(stats.totalCredit)}</span>
                    </div>
                </div>
                <div className={`tl-stat-card ${typeFilter === 'DEBIT' ? 'active' : ''}`} onClick={() => { setTypeFilter('DEBIT'); setPagination(p => ({ ...p, page: 1 })) }}>
                    <div className="tl-stat-icon" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
                        <ArrowUpRight size={20} />
                    </div>
                    <div className="tl-stat-info">
                        <span className="tl-stat-label">Total Debits</span>
                        <span className="tl-stat-value">{formatCurrency(stats.totalDebit)}</span>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="tl-filters">
                <div className="tl-search">
                    <Search size={16} />
                    <input
                        type="text"
                        placeholder="Search by user, description, reference..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="tl-date-filters">
                    <div className="tl-date-input">
                        <Calendar size={14} />
                        <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setRefreshKey(k => k + 1) }} />
                    </div>
                    <span className="tl-date-sep">to</span>
                    <div className="tl-date-input">
                        <Calendar size={14} />
                        <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setRefreshKey(k => k + 1) }} />
                    </div>
                    {(dateFrom || dateTo) && (
                        <button className="tl-btn-clear" onClick={() => { setDateFrom(''); setDateTo(''); setRefreshKey(k => k + 1) }}>
                            <X size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* Table */}
            {loading ? (
                <div className="tl-loading">
                    <Loader2 className="tl-spinner" size={32} />
                    <p>Loading transactions...</p>
                </div>
            ) : sortedTxs.length === 0 ? (
                <div className="tl-empty">
                    <Receipt size={48} />
                    <h3>No Transactions Found</h3>
                    <p>No {typeFilter || ''} transactions match your filters</p>
                </div>
            ) : (
                <div className="tl-table-container">
                    <table className="tl-table">
                        <thead>
                            <tr>
                                <th className="tl-th-sortable" onClick={() => toggleSort('createdAt')}>
                                    <Calendar size={13} /> Date
                                    {sortField === 'createdAt' && <ArrowUpDown size={12} />}
                                </th>
                                <th className="tl-th-sortable" onClick={() => toggleSort('user')}>
                                    <User size={13} /> User
                                    {sortField === 'user' && <ArrowUpDown size={12} />}
                                </th>
                                <th>Type</th>
                                <th className="tl-th-sortable" onClick={() => toggleSort('amount')}>
                                    <DollarSign size={13} /> Amount
                                    {sortField === 'amount' && <ArrowUpDown size={12} />}
                                </th>
                                <th>Balance</th>
                                <th>Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedTxs.map(tx => (
                                <tr key={tx.id}>
                                    <td>
                                        <div className="tl-cell-date">
                                            <span>{formatDate(tx.createdAt)}</span>
                                            <span className="tl-time">{formatTime(tx.createdAt)}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="tl-cell-user">
                                            <span className="tl-user-name">{tx.user?.username || tx.user?.name || '—'}</span>
                                            <span className="tl-user-email">{tx.user?.email || ''}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <span className={`tl-type-badge ${tx.type === 'CREDIT' ? 'credit' : 'debit'}`}>
                                            {tx.type === 'CREDIT' ? <ArrowDownLeft size={11} /> : <ArrowUpRight size={11} />}
                                            {tx.type}
                                        </span>
                                    </td>
                                    <td>
                                        <span className={`tl-amount ${tx.type === 'CREDIT' ? 'credit' : 'debit'}`}>
                                            {tx.type === 'CREDIT' ? '+' : '-'}{formatCurrency(tx.amount)}
                                        </span>
                                    </td>
                                    <td>
                                        <div className="tl-balance">
                                            <span>{formatCurrency(tx.balanceBefore)}</span>
                                            <span className="tl-balance-arrow">→</span>
                                            <span style={{ fontWeight: 600 }}>{formatCurrency(tx.balanceAfter)}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="tl-desc">
                                            <span>{tx.description || '—'}</span>
                                            {tx.reference && <span className="tl-ref">{tx.reference}</span>}
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
                <div className="tl-pagination">
                    <span className="tl-page-info">
                        Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
                    </span>
                    <div className="tl-page-btns">
                        <button className="tl-page-btn" disabled={pagination.page <= 1} onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}>
                            <ChevronLeft size={16} /> Previous
                        </button>
                        {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                            const startPage = Math.max(1, Math.min(pagination.page - 2, pagination.totalPages - 4))
                            const pageNum = startPage + i
                            if (pageNum > pagination.totalPages) return null
                            return (
                                <button key={pageNum} className={`tl-page-num ${pagination.page === pageNum ? 'active' : ''}`} onClick={() => setPagination(p => ({ ...p, page: pageNum }))}>
                                    {pageNum}
                                </button>
                            )
                        })}
                        <button className="tl-page-btn" disabled={pagination.page >= pagination.totalPages} onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}>
                            Next <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            )}

            <style>{styles}</style>
        </div>
    )
}

const styles = `
    .tl-page { padding: 1.5rem; max-width: 1400px; margin: 0 auto; }
    .tl-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem; }
    .tl-header-left { display: flex; align-items: center; gap: 1rem; }
    .tl-header-icon { width: 52px; height: 52px; border-radius: 14px; background: linear-gradient(135deg, #8b5cf6, #6d28d9); display: flex; align-items: center; justify-content: center; color: white; box-shadow: 0 4px 15px rgba(139, 92, 246, 0.3); }
    .tl-header h1 { font-size: 1.5rem; font-weight: 700; color: var(--text-primary); margin: 0; }
    .tl-header p { font-size: 0.875rem; color: var(--text-secondary); margin: 0.15rem 0 0; }

    .tl-btn { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.6rem 1.2rem; border-radius: 10px; font-size: 0.875rem; font-weight: 600; border: none; cursor: pointer; transition: all 0.2s ease; font-family: inherit; }
    .tl-btn-ghost { background: var(--bg-tertiary); color: var(--text-secondary); border: 1px solid var(--border-color); }
    .tl-btn-ghost:hover { background: var(--bg-card-hover); color: var(--text-primary); }
    .tl-btn-ghost:disabled { opacity: 0.5; cursor: not-allowed; }

    .tl-alert-error { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 10px; color: #ef4444; margin-bottom: 1rem; font-size: 0.875rem; }
    .tl-alert-error button { background: none; border: none; color: inherit; cursor: pointer; margin-left: auto; }

    .tl-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
    .tl-stat-card { display: flex; align-items: center; gap: 1rem; padding: 1.25rem; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 14px; cursor: pointer; transition: all 0.2s ease; }
    .tl-stat-card:hover { border-color: var(--primary-color); transform: translateY(-1px); }
    .tl-stat-card.active { border-color: var(--primary-color); background: rgba(99, 102, 241, 0.05); }
    .tl-stat-icon { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white; flex-shrink: 0; }
    .tl-stat-info { display: flex; flex-direction: column; }
    .tl-stat-label { font-size: 0.8rem; color: var(--text-secondary); font-weight: 500; }
    .tl-stat-value { font-size: 1.25rem; font-weight: 700; color: var(--text-primary); }

    .tl-filters { display: flex; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap; align-items: center; }
    .tl-search { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 10px; flex: 1; min-width: 200px; }
    .tl-search input { border: none; background: none; outline: none; color: var(--text-primary); font-size: 0.875rem; flex: 1; }
    .tl-search svg { color: var(--text-muted); flex-shrink: 0; }
    .tl-date-filters { display: flex; align-items: center; gap: 0.5rem; }
    .tl-date-input { display: flex; align-items: center; gap: 0.4rem; padding: 0.45rem 0.6rem; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; }
    .tl-date-input input { border: none; background: none; outline: none; color: var(--text-primary); font-size: 0.8rem; width: 120px; }
    .tl-date-input svg { color: var(--text-muted); }
    .tl-date-sep { color: var(--text-muted); font-size: 0.8rem; }
    .tl-btn-clear { background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 4px; border-radius: 4px; }
    .tl-btn-clear:hover { color: #ef4444; }

    .tl-loading { display: flex; flex-direction: column; align-items: center; gap: 1rem; padding: 4rem 0; color: var(--text-secondary); }
    @keyframes tl-spin { to { transform: rotate(360deg); } }
    .tl-spinner { animation: tl-spin 1s linear infinite; }

    .tl-empty { display: flex; flex-direction: column; align-items: center; gap: 0.75rem; padding: 4rem 0; color: var(--text-muted); }
    .tl-empty h3 { color: var(--text-secondary); font-size: 1.1rem; margin: 0; }
    .tl-empty p { font-size: 0.875rem; margin: 0; }

    .tl-table-container { overflow-x: auto; border: 1px solid var(--border-color); border-radius: 14px; background: var(--bg-card); }
    .tl-table { width: 100%; border-collapse: collapse; }
    .tl-table thead { background: var(--bg-tertiary); }
    .tl-table th { padding: 0.75rem 1rem; text-align: left; font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; border-bottom: 1px solid var(--border-color); }
    .tl-th-sortable { cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }
    .tl-th-sortable:hover { color: var(--primary-color); }
    .tl-table td { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border-color); font-size: 0.875rem; color: var(--text-primary); }
    .tl-table tr:last-child td { border-bottom: none; }
    .tl-table tbody tr:hover { background: var(--bg-secondary); }

    .tl-cell-date { display: flex; flex-direction: column; }
    .tl-time { font-size: 0.75rem; color: var(--text-muted); }
    .tl-cell-user { display: flex; flex-direction: column; }
    .tl-user-name { font-weight: 600; font-size: 0.875rem; }
    .tl-user-email { font-size: 0.75rem; color: var(--text-muted); }

    .tl-type-badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; }
    .tl-type-badge.credit { background: rgba(16, 185, 129, 0.1); color: #10b981; }
    .tl-type-badge.debit { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
    .tl-amount { font-weight: 700; font-size: 0.875rem; }
    .tl-amount.credit { color: #10b981; }
    .tl-amount.debit { color: #ef4444; }
    .tl-balance { display: flex; align-items: center; gap: 4px; font-size: 0.8rem; color: var(--text-secondary); white-space: nowrap; }
    .tl-balance-arrow { color: var(--text-muted); }
    .tl-desc { display: flex; flex-direction: column; max-width: 300px; }
    .tl-desc span:first-child { font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tl-ref { font-size: 0.7rem; color: var(--text-muted); font-family: monospace; }

    .tl-pagination { display: flex; align-items: center; justify-content: space-between; margin-top: 1rem; flex-wrap: wrap; gap: 0.75rem; }
    .tl-page-info { font-size: 0.8rem; color: var(--text-secondary); }
    .tl-page-btns { display: flex; gap: 0.25rem; }
    .tl-page-btn { display: flex; align-items: center; gap: 0.25rem; padding: 0.5rem 0.75rem; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-card); color: var(--text-secondary); cursor: pointer; font-size: 0.8rem; }
    .tl-page-btn:hover:not(:disabled) { background: var(--bg-tertiary); color: var(--text-primary); }
    .tl-page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .tl-page-num { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-card); color: var(--text-secondary); cursor: pointer; font-size: 0.8rem; font-weight: 600; }
    .tl-page-num.active { background: linear-gradient(135deg, #6366f1, #4f46e5); color: white; border-color: #6366f1; }
    .tl-page-num:hover:not(.active) { background: var(--bg-tertiary); }

    @media (max-width: 768px) {
        .tl-page { padding: 1rem; }
        .tl-stats { grid-template-columns: 1fr; }
        .tl-filters { flex-direction: column; }
        .tl-date-filters { width: 100%; justify-content: flex-start; }
    }
`
