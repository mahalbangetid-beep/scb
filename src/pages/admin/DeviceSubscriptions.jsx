import { useState, useEffect } from 'react'
import { Smartphone, Calendar, DollarSign, RefreshCw, Play, Pause, X, Clock, Plus } from 'lucide-react'
import api from '../../services/api'

export default function DeviceSubscriptions() {
    const [subscriptions, setSubscriptions] = useState([])
    const [stats, setStats] = useState(null)
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState('')
    const [extendModal, setExtendModal] = useState(null)
    const [extendDays, setExtendDays] = useState(30)

    const fetchData = async () => {
        try {
            setLoading(true)
            const [subsRes, statsRes] = await Promise.all([
                api.get('/admin/device-subscriptions', { params: { limit: 100, status: filter || undefined } }),
                api.get('/admin/device-subscriptions/stats')
            ])
            setSubscriptions(subsRes.data?.subscriptions || [])
            setStats(statsRes.data)
        } catch (err) {
            console.error('Failed to load subscriptions:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetchData() }, [filter])

    const handleExtend = async () => {
        if (!extendModal) return
        try {
            await api.put(`/admin/device-subscriptions/${extendModal.id}/extend`, { days: parseInt(extendDays) })
            setExtendModal(null)
            setExtendDays(30)
            fetchData()
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to extend')
        }
    }

    const handleStatusChange = async (id, newStatus) => {
        if (!confirm(`Change status to ${newStatus}?`)) return
        try {
            await api.put(`/admin/device-subscriptions/${id}/status`, { status: newStatus })
            fetchData()
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to update status')
        }
    }

    const getStatusBadge = (status) => {
        const map = {
            ACTIVE: { bg: 'rgba(37,211,102,0.15)', color: '#25d366', label: 'Active' },
            EXPIRED: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', label: 'Expired' },
            PAUSED: { bg: 'rgba(234,179,8,0.15)', color: '#eab308', label: 'Paused' },
            CANCELLED: { bg: 'rgba(156,163,175,0.15)', color: '#9ca3af', label: 'Cancelled' },
            PENDING: { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6', label: 'Pending' }
        }
        const s = map[status] || map.PENDING
        return (
            <span style={{ background: s.bg, color: s.color, padding: '4px 10px', borderRadius: 'var(--radius-full)', fontSize: '0.75rem', fontWeight: 600 }}>
                {s.label}
            </span>
        )
    }

    const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A'

    return (
        <div className="page-content">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Device Subscriptions</h1>
                    <p className="page-subtitle">Manage device subscription billing and expiry</p>
                </div>
                <button className="btn btn-ghost btn-icon" onClick={fetchData} title="Refresh">
                    <RefreshCw size={18} />
                </button>
            </div>

            {/* Stats */}
            {stats && (
                <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)' }}>
                    {[
                        { label: 'Total', value: stats.total, icon: Smartphone, color: '#8b5cf6' },
                        { label: 'Active', value: stats.active, icon: Play, color: '#25d366' },
                        { label: 'Expired', value: stats.expired, icon: Clock, color: '#ef4444' },
                        { label: 'Paused', value: stats.paused, icon: Pause, color: '#eab308' },
                        { label: 'Monthly Rev', value: `$${(stats.monthlyRevenue || 0).toFixed(2)}`, icon: DollarSign, color: '#3b82f6' }
                    ].map(s => (
                        <div key={s.label} className="card" style={{ padding: 'var(--spacing-md)', textAlign: 'center' }}>
                            <s.icon size={24} style={{ color: s.color, marginBottom: '8px' }} />
                            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>{s.value}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.label}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Filter */}
            <div style={{ marginBottom: 'var(--spacing-md)', display: 'flex', gap: 'var(--spacing-sm)' }}>
                {['', 'ACTIVE', 'EXPIRED', 'PAUSED', 'CANCELLED'].map(f => (
                    <button
                        key={f}
                        className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => setFilter(f)}
                    >
                        {f || 'All'}
                    </button>
                ))}
            </div>

            {/* Table */}
            <div className="card" style={{ overflow: 'auto' }}>
                {loading ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
                ) : subscriptions.length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No subscriptions found</div>
                ) : (
                    <table className="table" style={{ width: '100%' }}>
                        <thead>
                            <tr>
                                <th>User</th>
                                <th>Device</th>
                                <th>Type</th>
                                <th>Fee</th>
                                <th>Status</th>
                                <th>Next Billing</th>
                                <th>Auto-Renew</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {subscriptions.map(sub => (
                                <tr key={sub.id}>
                                    <td>
                                        <div style={{ fontWeight: 500 }}>{sub.user?.name || sub.user?.username || 'Unknown'}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{sub.user?.email}</div>
                                    </td>
                                    <td>
                                        <div style={{ fontWeight: 500 }}>{sub.device?.name || sub.resourceName || 'N/A'}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{sub.device?.phone || ''}</div>
                                    </td>
                                    <td style={{ fontSize: '0.8rem' }}>{sub.resourceType}</td>
                                    <td style={{ fontWeight: 600 }}>${sub.monthlyFee?.toFixed(2)}</td>
                                    <td>{getStatusBadge(sub.status)}</td>
                                    <td>
                                        <div style={{ fontSize: '0.85rem' }}>{formatDate(sub.nextBillingDate)}</div>
                                        {sub.nextBillingDate && new Date(sub.nextBillingDate) < new Date() && (
                                            <div style={{ fontSize: '0.7rem', color: '#ef4444' }}>Overdue</div>
                                        )}
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        {sub.autoRenew ? '✅' : '❌'}
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                            <button
                                                className="btn btn-sm btn-ghost"
                                                onClick={() => { setExtendModal(sub); setExtendDays(30) }}
                                                title="Extend"
                                                style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                                            >
                                                <Plus size={14} /> Extend
                                            </button>
                                            {sub.status !== 'ACTIVE' && (
                                                <button className="btn btn-sm btn-ghost" onClick={() => handleStatusChange(sub.id, 'ACTIVE')} style={{ padding: '4px 8px', fontSize: '0.75rem', color: '#25d366' }}>
                                                    <Play size={14} />
                                                </button>
                                            )}
                                            {sub.status === 'ACTIVE' && (
                                                <button className="btn btn-sm btn-ghost" onClick={() => handleStatusChange(sub.id, 'PAUSED')} style={{ padding: '4px 8px', fontSize: '0.75rem', color: '#eab308' }}>
                                                    <Pause size={14} />
                                                </button>
                                            )}
                                            {sub.status !== 'CANCELLED' && (
                                                <button className="btn btn-sm btn-ghost" onClick={() => handleStatusChange(sub.id, 'CANCELLED')} style={{ padding: '4px 8px', fontSize: '0.75rem', color: '#ef4444' }}>
                                                    <X size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Extend Modal */}
            {extendModal && (
                <div className="modal-overlay" onClick={() => setExtendModal(null)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
                        <div className="modal-header">
                            <h3>Extend Subscription</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setExtendModal(null)}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="modal-body" style={{ padding: 'var(--spacing-lg)' }}>
                            <p style={{ marginBottom: 'var(--spacing-md)', color: 'var(--text-secondary)' }}>
                                Extend <strong>{extendModal.device?.name || extendModal.resourceName || 'subscription'}</strong> for user <strong>{extendModal.user?.name || 'Unknown'}</strong>
                            </p>
                            <div className="form-group">
                                <label className="form-label">Days to Extend</label>
                                <input
                                    type="number"
                                    className="form-input"
                                    value={extendDays}
                                    onChange={e => setExtendDays(e.target.value)}
                                    min={1}
                                    max={365}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: 'var(--spacing-sm)', marginTop: 'var(--spacing-md)', flexWrap: 'wrap' }}>
                                {[7, 30, 90, 180, 365].map(d => (
                                    <button
                                        key={d}
                                        className={`btn btn-sm ${parseInt(extendDays) === d ? 'btn-primary' : 'btn-ghost'}`}
                                        onClick={() => setExtendDays(d)}
                                    >
                                        {d}d
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="modal-footer" style={{ padding: 'var(--spacing-md)', display: 'flex', gap: 'var(--spacing-sm)', justifyContent: 'flex-end' }}>
                            <button className="btn btn-ghost" onClick={() => setExtendModal(null)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleExtend}>
                                <Calendar size={16} /> Extend {extendDays} Days
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
