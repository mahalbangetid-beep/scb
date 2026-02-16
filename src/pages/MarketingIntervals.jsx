import { useState, useEffect } from 'react'
import {
    Megaphone, Plus, Search, Trash2, Edit3, Power, PowerOff,
    RefreshCw, Loader2, AlertTriangle, CheckCircle, X,
    Smartphone, Users, MessageCircle, RotateCcw, Hash,
    Clock, Zap, Image
} from 'lucide-react'
import api from '../services/api'

const STATUS_STYLES = {
    active: { bg: 'rgba(34, 197, 94, 0.1)', color: '#22c55e' },
    paused: { bg: 'rgba(251, 146, 60, 0.1)', color: '#fb923c' }
}

export default function MarketingIntervals() {
    const [intervals, setIntervals] = useState([])
    const [devices, setDevices] = useState([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [editing, setEditing] = useState(null)
    const [error, setError] = useState(null)
    const [success, setSuccess] = useState(null)
    const [actionLoading, setActionLoading] = useState(null)
    const [searchTerm, setSearchTerm] = useState('')

    const [formData, setFormData] = useState({
        deviceId: '',
        groupJid: '',
        groupName: '',
        interval: 50,
        message: '',
        mediaUrl: ''
    })

    useEffect(() => {
        fetchData()
    }, [])

    useEffect(() => {
        if (success) {
            const t = setTimeout(() => setSuccess(null), 4000)
            return () => clearTimeout(t)
        }
    }, [success])

    useEffect(() => {
        if (error) {
            const t = setTimeout(() => setError(null), 6000)
            return () => clearTimeout(t)
        }
    }, [error])

    const fetchData = async () => {
        try {
            setLoading(true)
            const [intervalsRes, devicesRes] = await Promise.all([
                api.get('/marketing-intervals'),
                api.get('/devices')
            ])
            setIntervals(intervalsRes.data || [])
            const devList = devicesRes.data || []
            setDevices(Array.isArray(devList) ? devList : [])
        } catch (err) {
            setError(err.message || 'Failed to load data')
        } finally {
            setLoading(false)
        }
    }

    const openModal = (item = null) => {
        if (item) {
            setEditing(item)
            setFormData({
                deviceId: item.deviceId,
                groupJid: item.groupJid,
                groupName: item.groupName || '',
                interval: item.interval,
                message: item.message,
                mediaUrl: item.mediaUrl || ''
            })
        } else {
            setEditing(null)
            setFormData({
                deviceId: '',
                groupJid: '',
                groupName: '',
                interval: 50,
                message: '',
                mediaUrl: ''
            })
        }
        setShowModal(true)
        setError(null)
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setActionLoading('submit')
        setError(null)

        try {
            const payload = {
                ...formData,
                interval: parseInt(formData.interval)
            }

            if (isNaN(payload.interval) || payload.interval < 1) {
                throw new Error('Interval must be a valid number (minimum 1)')
            }

            if (editing) {
                await api.put(`/marketing-intervals/${editing.id}`, payload)
                setSuccess('Marketing interval updated')
            } else {
                if (!payload.deviceId || !payload.groupJid || !payload.message) {
                    throw new Error('Device, Group JID, and message are required')
                }
                await api.post('/marketing-intervals', payload)
                setSuccess('Marketing interval created')
            }
            setShowModal(false)
            fetchData()
        } catch (err) {
            setError(err.error?.message || err.message || 'Failed to save')
        } finally {
            setActionLoading(null)
        }
    }

    const handleToggle = async (id) => {
        setActionLoading(id)
        try {
            const res = await api.patch(`/marketing-intervals/${id}/toggle`)
            const msg = res.data?.message || 'Status changed'
            setSuccess(msg)
            fetchData()
        } catch (err) {
            setError(err.error?.message || err.message)
        } finally {
            setActionLoading(null)
        }
    }

    const handleReset = async (id) => {
        setActionLoading(`reset-${id}`)
        try {
            await api.patch(`/marketing-intervals/${id}/reset`)
            setSuccess('Counter reset')
            fetchData()
        } catch (err) {
            setError(err.error?.message || err.message)
        } finally {
            setActionLoading(null)
        }
    }

    const handleDelete = async (id) => {
        if (!confirm('Are you sure you want to delete this marketing interval?')) return
        setActionLoading(`del-${id}`)
        try {
            await api.delete(`/marketing-intervals/${id}`)
            setSuccess('Marketing interval deleted')
            fetchData()
        } catch (err) {
            setError(err.error?.message || err.message)
        } finally {
            setActionLoading(null)
        }
    }

    const filtered = intervals.filter(i =>
        !searchTerm ||
        i.groupName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        i.groupJid?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        i.device?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        i.message?.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never'

    if (loading) {
        return (
            <div className="page-container">
                <div className="loading-state">
                    <div className="spinner"></div>
                    <p>Loading marketing intervals...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Marketing Intervals</h1>
                    <p className="page-subtitle">Auto-send marketing messages after every X group messages</p>
                </div>
                <div className="header-actions">
                    <button className="btn btn-secondary" onClick={fetchData} disabled={loading}>
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                    <button className="btn btn-primary" onClick={() => openModal()}>
                        <Plus size={16} />
                        Add Interval
                    </button>
                </div>
            </div>

            {/* Alerts */}
            {success && (
                <div className="alert alert-success" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <CheckCircle size={16} />
                    <span style={{ flex: 1 }}>{success}</span>
                    <button onClick={() => setSuccess(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}><X size={16} /></button>
                </div>
            )}
            {error && (
                <div className="alert alert-error" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <AlertTriangle size={16} />
                    <span style={{ flex: 1 }}>{error}</span>
                    <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}><X size={16} /></button>
                </div>
            )}

            {/* Stats */}
            <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="stat-card">
                    <div className="stat-label"><Megaphone size={14} /> Total Rules</div>
                    <div className="stat-value">{intervals.length}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label"><Zap size={14} /> Active</div>
                    <div className="stat-value" style={{ color: '#22c55e' }}>{intervals.filter(i => i.isActive).length}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label"><Hash size={14} /> Total Triggers</div>
                    <div className="stat-value">{intervals.reduce((sum, i) => sum + (i.triggerCount || 0), 0)}</div>
                </div>
            </div>

            {/* Search */}
            {intervals.length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                    <div style={{ position: 'relative' }}>
                        <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input
                            type="text"
                            placeholder="Search by group, device, or message..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="form-input"
                            style={{ paddingLeft: '2.25rem', width: '100%' }}
                        />
                    </div>
                </div>
            )}

            {/* List */}
            {filtered.length === 0 ? (
                <div className="empty-state" style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                    <Megaphone size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                    <h3 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                        {intervals.length === 0 ? 'No marketing intervals yet' : 'No results found'}
                    </h3>
                    <p style={{ fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                        {intervals.length === 0
                            ? 'Create a marketing interval to auto-send messages after every X group messages'
                            : 'Try a different search term'
                        }
                    </p>
                    {intervals.length === 0 && (
                        <button className="btn btn-primary" onClick={() => openModal()}>
                            <Plus size={16} /> Create First Interval
                        </button>
                    )}
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {filtered.map(item => {
                        const statusStyle = item.isActive ? STATUS_STYLES.active : STATUS_STYLES.paused
                        const progressPct = item.interval > 0 ? Math.min((item.messageCount / item.interval) * 100, 100) : 0

                        return (
                            <div key={item.id} style={{
                                background: 'var(--bg-secondary)',
                                border: '1px solid var(--border-color)',
                                borderRadius: 'var(--radius-lg, 12px)',
                                padding: '1rem 1.25rem',
                                transition: 'border-color 0.2s ease'
                            }}>
                                {/* Top row: status, group, device */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                                    <span style={{
                                        fontSize: '0.7rem',
                                        fontWeight: 600,
                                        padding: '0.2rem 0.5rem',
                                        borderRadius: '4px',
                                        background: statusStyle.bg,
                                        color: statusStyle.color,
                                        textTransform: 'uppercase'
                                    }}>
                                        {item.isActive ? 'Active' : 'Paused'}
                                    </span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                        <Users size={14} />
                                        {item.groupName || item.groupJid}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        <Smartphone size={12} />
                                        {item.device?.name || item.deviceId.slice(0, 8)}
                                    </div>
                                    {item.mediaUrl && (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.7rem', color: 'var(--primary)', background: 'var(--primary-light, rgba(59,130,246,0.1))', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
                                            <Image size={10} /> Media
                                        </span>
                                    )}
                                </div>

                                {/* Message preview */}
                                <div style={{
                                    fontSize: '0.8rem',
                                    color: 'var(--text-secondary)',
                                    padding: '0.5rem 0.75rem',
                                    background: 'var(--bg-tertiary, var(--bg-primary))',
                                    borderRadius: '6px',
                                    marginBottom: '0.75rem',
                                    whiteSpace: 'pre-wrap',
                                    maxHeight: '60px',
                                    overflow: 'hidden'
                                }}>
                                    {item.message}
                                </div>

                                {/* Progress bar */}
                                <div style={{ marginBottom: '0.75rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontSize: '0.75rem' }}>
                                        <span style={{ color: 'var(--text-muted)' }}>
                                            <MessageCircle size={12} style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} />
                                            {item.messageCount} / {item.interval} messages
                                        </span>
                                        <span style={{ color: 'var(--text-muted)' }}>
                                            <Clock size={12} style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} />
                                            Last triggered: {formatDate(item.lastTriggeredAt)}
                                        </span>
                                    </div>
                                    <div style={{
                                        height: '6px',
                                        background: 'var(--bg-tertiary, rgba(255,255,255,0.05))',
                                        borderRadius: '3px',
                                        overflow: 'hidden'
                                    }}>
                                        <div style={{
                                            height: '100%',
                                            width: `${progressPct}%`,
                                            background: progressPct >= 80 ? '#22c55e' : 'var(--primary)',
                                            borderRadius: '3px',
                                            transition: 'width 0.3s ease'
                                        }} />
                                    </div>
                                </div>

                                {/* Triggered count + actions */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        Triggered {item.triggerCount || 0}x total
                                    </span>
                                    <div style={{ display: 'flex', gap: '0.375rem' }}>
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => handleReset(item.id)}
                                            disabled={actionLoading === `reset-${item.id}`}
                                            title="Reset counter"
                                            style={{ fontSize: '0.75rem', padding: '0.3rem 0.5rem' }}
                                        >
                                            {actionLoading === `reset-${item.id}` ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                                        </button>
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => handleToggle(item.id)}
                                            disabled={actionLoading === item.id}
                                            title={item.isActive ? 'Pause' : 'Activate'}
                                            style={{ fontSize: '0.75rem', padding: '0.3rem 0.5rem', color: item.isActive ? '#fb923c' : '#22c55e' }}
                                        >
                                            {actionLoading === item.id ? <Loader2 size={13} className="animate-spin" /> : item.isActive ? <PowerOff size={13} /> : <Power size={13} />}
                                        </button>
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => openModal(item)}
                                            title="Edit"
                                            style={{ fontSize: '0.75rem', padding: '0.3rem 0.5rem' }}
                                        >
                                            <Edit3 size={13} />
                                        </button>
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => handleDelete(item.id)}
                                            disabled={actionLoading === `del-${item.id}`}
                                            title="Delete"
                                            style={{ fontSize: '0.75rem', padding: '0.3rem 0.5rem', color: '#ef4444' }}
                                        >
                                            {actionLoading === `del-${item.id}` ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Create/Edit Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
                        <div className="modal-header">
                            <h3>{editing ? 'Edit Marketing Interval' : 'New Marketing Interval'}</h3>
                            <button className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {/* Device selector */}
                                <div>
                                    <label className="form-label">WhatsApp Device *</label>
                                    <select
                                        className="form-input"
                                        value={formData.deviceId}
                                        onChange={e => setFormData(p => ({ ...p, deviceId: e.target.value }))}
                                        required
                                        disabled={!!editing}
                                    >
                                        <option value="">Select a device...</option>
                                        {devices.map(d => (
                                            <option key={d.id} value={d.id}>
                                                {d.name} {d.phone ? `(${d.phone})` : ''} — {d.status}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Group JID */}
                                <div>
                                    <label className="form-label">Group JID *</label>
                                    <input
                                        className="form-input"
                                        placeholder="e.g. 120363012345678901@g.us"
                                        value={formData.groupJid}
                                        onChange={e => setFormData(p => ({ ...p, groupJid: e.target.value }))}
                                        required
                                        disabled={!!editing}
                                    />
                                    <small style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                                        Send <code>.groupid</code> in the group to get this JID
                                    </small>
                                </div>

                                {/* Group Name (optional) */}
                                <div>
                                    <label className="form-label">Group Name (display only)</label>
                                    <input
                                        className="form-input"
                                        placeholder="e.g. My Business Group"
                                        value={formData.groupName}
                                        onChange={e => setFormData(p => ({ ...p, groupName: e.target.value }))}
                                    />
                                </div>

                                {/* Interval */}
                                <div>
                                    <label className="form-label">Interval (every X messages) *</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        min="1"
                                        max="10000"
                                        value={formData.interval}
                                        onChange={e => setFormData(p => ({ ...p, interval: e.target.value }))}
                                        required
                                    />
                                    <small style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                                        Marketing message will be sent after every {formData.interval || '...'} messages in the group
                                    </small>
                                </div>

                                {/* Message */}
                                <div>
                                    <label className="form-label">Marketing Message *</label>
                                    <textarea
                                        className="form-input"
                                        placeholder="Your marketing message..."
                                        value={formData.message}
                                        onChange={e => setFormData(p => ({ ...p, message: e.target.value }))}
                                        required
                                        maxLength={5000}
                                        rows={4}
                                        style={{ resize: 'vertical', minHeight: '100px' }}
                                    />
                                    <small style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                                        {formData.message.length}/5000 characters
                                    </small>
                                </div>

                                {/* Media URL (optional) */}
                                <div>
                                    <label className="form-label"><Image size={13} style={{ verticalAlign: 'middle' }} /> Media URL (optional)</label>
                                    <input
                                        className="form-input"
                                        placeholder="https://example.com/image.jpg"
                                        value={formData.mediaUrl}
                                        onChange={e => setFormData(p => ({ ...p, mediaUrl: e.target.value }))}
                                    />
                                    <small style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                                        If provided, message will be sent as an image caption
                                    </small>
                                </div>
                            </div>

                            <div className="modal-footer">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={actionLoading === 'submit'}>
                                    {actionLoading === 'submit' ? <Loader2 size={14} className="animate-spin" /> : editing ? <Edit3 size={14} /> : <Plus size={14} />}
                                    {editing ? 'Update' : 'Create'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
