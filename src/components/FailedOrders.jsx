import { useState, useEffect } from 'react'
import { AlertTriangle, Loader2, RefreshCw, ExternalLink, ChevronDown, ChevronRight } from 'lucide-react'
import api from '../services/api'

export default function FailedOrders({ panelId }) {
    const [orders, setOrders] = useState([])
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [loading, setLoading] = useState(false)
    const [expandedOrder, setExpandedOrder] = useState(null)
    const [error, setError] = useState(null)

    useEffect(() => { if (panelId) fetchOrders() }, [panelId, page])
    useEffect(() => { if (error) { const t = setTimeout(() => setError(null), 5000); return () => clearTimeout(t) } }, [error])

    const fetchOrders = async () => {
        setLoading(true)
        try {
            const res = await api.get(`/panel-tools/${panelId}/failed-orders?page=${page}&limit=25`)
            const data = res.data.data || {}
            setOrders(data.orders || [])
            setTotal(data.total || 0)
        } catch (e) { setError(e.response?.data?.message || 'Failed to load') }
        setLoading(false)
    }

    const statusBadge = (status) => {
        const colors = {
            CANCELLED: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' },
            PARTIAL: { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
            REFUNDED: { bg: 'rgba(99,102,241,0.15)', color: '#6366f1' },
            FAILED: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' },
        }
        const s = colors[status] || { bg: 'rgba(156,163,175,0.15)', color: '#9ca3af' }
        return <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color }}>{status}</span>
    }

    if (!panelId) return <div className="empty-state"><p>Select a panel first</p></div>

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-md)' }}>
                <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>
                    <AlertTriangle size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                    Failed / Problem Orders ({total})
                </h3>
                <button className="btn btn-secondary btn-sm" onClick={fetchOrders} disabled={loading}>
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
                </button>
            </div>

            {error && <div className="alert alert-error" style={{ marginBottom: 'var(--spacing-md)' }}>{error}</div>}

            {loading ? (
                <div style={{ textAlign: 'center', padding: 'var(--spacing-xl)' }}><Loader2 size={24} className="animate-spin" /></div>
            ) : orders.length === 0 ? (
                <div className="empty-state"><p>🎉 No failed orders found!</p></div>
            ) : (
                <>
                    <div className="table-container">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th></th>
                                    <th>Order ID</th>
                                    <th>Service</th>
                                    <th>Status</th>
                                    <th>Charge</th>
                                    <th>Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                {orders.map(o => (
                                    <>
                                        <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => setExpandedOrder(expandedOrder === o.id ? null : o.id)}>
                                            <td>{expandedOrder === o.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                                            <td><code style={{ fontSize: 12 }}>{o.externalOrderId}</code></td>
                                            <td style={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.serviceName || '—'}</td>
                                            <td>{statusBadge(o.status)}</td>
                                            <td>${o.charge?.toFixed(4) || '—'}</td>
                                            <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{new Date(o.updatedAt).toLocaleString()}</td>
                                        </tr>
                                        {expandedOrder === o.id && (
                                            <tr key={`${o.id}-detail`}>
                                                <td colSpan={6} style={{ padding: 'var(--spacing-sm) var(--spacing-md)', background: 'var(--bg-tertiary)' }}>
                                                    <div style={{ fontSize: 13 }}>
                                                        <div><strong>Link:</strong> {o.link ? <a href={o.link} target="_blank" rel="noreferrer" style={{ color: 'var(--color-primary)' }}>{o.link} <ExternalLink size={10} /></a> : '—'}</div>
                                                        <div><strong>Quantity:</strong> {o.quantity || '—'} | <strong>Remains:</strong> {o.remains ?? '—'}</div>
                                                        {o.providerName && <div><strong>Provider:</strong> {o.providerName} | <strong>Provider ID:</strong> {o.providerOrderId || '—'}</div>}
                                                        {o.commands && o.commands.length > 0 && (
                                                            <div style={{ marginTop: 8 }}>
                                                                <strong>Failed Commands:</strong>
                                                                {o.commands.map(c => (
                                                                    <div key={c.id} style={{ padding: '4px 8px', margin: '4px 0', borderRadius: 4, background: 'rgba(239,68,68,0.1)', fontSize: 12 }}>
                                                                        {statusBadge(c.status)} <strong>{c.command}</strong> by {c.requestedBy} — {c.error || 'No error message'}
                                                                        <span style={{ float: 'right', color: 'var(--text-secondary)' }}>{new Date(c.createdAt).toLocaleString()}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {total > 25 && (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 'var(--spacing-md)' }}>
                            <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
                            <span style={{ padding: '6px 12px', color: 'var(--text-secondary)' }}>Page {page} / {Math.ceil(total / 25)}</span>
                            <button className="btn btn-secondary btn-sm" disabled={page >= Math.ceil(total / 25)} onClick={() => setPage(p => p + 1)}>Next</button>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
