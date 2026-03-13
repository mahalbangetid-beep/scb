import { useState, useEffect } from 'react'
import {
    Megaphone, Plus, Search, Trash2, Edit3, Power, PowerOff,
    RefreshCw, Loader2, AlertTriangle, CheckCircle, X,
    Smartphone, Users, MessageCircle, RotateCcw, Hash,
    Clock, Zap, Image, Calendar, Repeat, Timer, FileText
} from 'lucide-react'
import api from '../services/api'

const STATUS_STYLES = {
    active: { bg: 'rgba(34, 197, 94, 0.1)', color: '#22c55e' },
    paused: { bg: 'rgba(251, 146, 60, 0.1)', color: '#fb923c' }
}

const MODE_STYLES = {
    counter: { bg: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', label: 'Counter' },
    time: { bg: 'rgba(168, 85, 247, 0.1)', color: '#a855f7', label: 'Time-Based' }
}

export default function MarketingIntervals() {
    const [intervals, setIntervals] = useState([])
    const [devices, setDevices] = useState([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [showLogsModal, setShowLogsModal] = useState(null)
    const [logs, setLogs] = useState([])
    const [logsLoading, setLogsLoading] = useState(false)
    const [editing, setEditing] = useState(null)
    const [error, setError] = useState(null)
    const [success, setSuccess] = useState(null)
    const [actionLoading, setActionLoading] = useState(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [filterType, setFilterType] = useState('all') // 'all', 'counter', 'time'

    const [formData, setFormData] = useState({
        deviceId: '',
        groupJid: '',
        groupName: '',
        scheduleType: 'counter',
        interval: 50,
        timeInterval: 30,
        repeatCount: '',
        scheduledAt: '',
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
            setError(null)

            // Fetch independently so one failure doesn't block the other
            let intervalsData = []
            let devicesData = []

            try {
                const intervalsRes = await api.get('/marketing-intervals')
                intervalsData = intervalsRes.data || []
            } catch (err) {
                console.error('Failed to fetch marketing intervals:', err)
                setError(err?.error?.message || err?.message || 'Failed to load marketing intervals')
            }

            try {
                const devicesRes = await api.get('/devices')
                const devList = devicesRes.data || []
                devicesData = Array.isArray(devList) ? devList : []
            } catch (err) {
                console.error('Failed to fetch devices:', err)
            }

            setIntervals(intervalsData)
            setDevices(devicesData)
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
                scheduleType: item.scheduleType || 'counter',
                interval: item.interval || 50,
                timeInterval: item.timeInterval || 30,
                repeatCount: item.repeatCount || '',
                scheduledAt: item.scheduledAt ? new Date(item.scheduledAt).toISOString().slice(0, 16) : '',
                message: item.message,
                mediaUrl: item.mediaUrl || ''
            })
        } else {
            setEditing(null)
            setFormData({
                deviceId: '',
                groupJid: '',
                groupName: '',
                scheduleType: 'counter',
                interval: 50,
                timeInterval: 30,
                repeatCount: '',
                scheduledAt: '',
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
                interval: parseInt(formData.interval),
                timeInterval: parseInt(formData.timeInterval),
                repeatCount: formData.repeatCount ? parseInt(formData.repeatCount) : null,
                scheduledAt: formData.scheduledAt || null
            }

            if (payload.scheduleType === 'counter') {
                if (isNaN(payload.interval) || payload.interval < 1) {
                    throw new Error('Interval must be a valid number (minimum 1)')
                }
            } else {
                if (isNaN(payload.timeInterval) || payload.timeInterval < 1) {
                    throw new Error('Time interval must be a valid number (minimum 1 minute)')
                }
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

    const openLogs = async (item) => {
        setShowLogsModal(item)
        setLogsLoading(true)
        try {
            const res = await api.get(`/marketing-intervals/${item.id}/logs?limit=50`)
            setLogs(res.data?.logs || [])
        } catch (err) {
            setError(err.error?.message || err.message || 'Failed to load logs')
        } finally {
            setLogsLoading(false)
        }
    }

    const filtered = intervals.filter(i => {
        if (filterType !== 'all' && (i.scheduleType || 'counter') !== filterType) return false
        if (!searchTerm) return true
        return (
            i.groupName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            i.groupJid?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            i.device?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            i.message?.toLowerCase().includes(searchTerm.toLowerCase())
        )
    })

    const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never'

    const formatMinutes = (mins) => {
        if (!mins) return '—'
        if (mins < 60) return `${mins}m`
        if (mins < 1440) return `${Math.floor(mins / 60)}h ${mins % 60}m`
        return `${Math.floor(mins / 1440)}d ${Math.floor((mins % 1440) / 60)}h`
    }

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
                    <p className="page-subtitle">Auto-send marketing messages (counter-based or time-based scheduling)</p>
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
            <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="stat-card">
                    <div className="stat-label"><Megaphone size={14} /> Total Rules</div>
                    <div className="stat-value">{intervals.length}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label"><Zap size={14} /> Active</div>
                    <div className="stat-value" style={{ color: '#22c55e' }}>{intervals.filter(i => i.isActive).length}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label"><Hash size={14} /> Counter</div>
                    <div className="stat-value" style={{ color: '#3b82f6' }}>{intervals.filter(i => (i.scheduleType || 'counter') === 'counter').length}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label"><Timer size={14} /> Time-Based</div>
                    <div className="stat-value" style={{ color: '#a855f7' }}>{intervals.filter(i => i.scheduleType === 'time').length}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label"><Hash size={14} /> Total Triggers</div>
                    <div className="stat-value">{intervals.reduce((sum, i) => sum + (i.triggerCount || 0), 0)}</div>
                </div>
            </div>

            {/* Filter + Search */}
            {intervals.length > 0 && (
                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--bg-secondary)', borderRadius: '8px', padding: '0.25rem' }}>
                        {['all', 'counter', 'time'].map(f => (
                            <button
                                key={f}
                                onClick={() => setFilterType(f)}
                                style={{
                                    padding: '0.35rem 0.75rem',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    borderRadius: '6px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    background: filterType === f ? 'var(--primary)' : 'transparent',
                                    color: filterType === f ? '#fff' : 'var(--text-muted)',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                {f === 'all' ? 'All' : f === 'counter' ? '🔢 Counter' : '⏱️ Time'}
                            </button>
                        ))}
                    </div>
                    <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
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
                            ? 'Create a marketing interval — counter-based or time-based scheduling'
                            : 'Try a different search term or filter'
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
                        const modeStyle = MODE_STYLES[item.scheduleType || 'counter'] || MODE_STYLES.counter
                        const isCounter = (item.scheduleType || 'counter') === 'counter'
                        const progressPct = isCounter && item.interval > 0 ? Math.min((item.messageCount / item.interval) * 100, 100) : 0
                        const timeProgressPct = !isCounter && item.repeatCount ? Math.min((item.repeatsDone / item.repeatCount) * 100, 100) : 0

                        return (
                            <div key={item.id} style={{
                                background: 'var(--bg-secondary)',
                                border: '1px solid var(--border-color)',
                                borderRadius: 'var(--radius-lg, 12px)',
                                padding: '1rem 1.25rem',
                                transition: 'border-color 0.2s ease'
                            }}>
                                {/* Top row: status, mode, group, device */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                                    <span style={{
                                        fontSize: '0.65rem',
                                        fontWeight: 600,
                                        padding: '0.15rem 0.45rem',
                                        borderRadius: '4px',
                                        background: statusStyle.bg,
                                        color: statusStyle.color,
                                        textTransform: 'uppercase'
                                    }}>
                                        {item.isActive ? 'Active' : 'Paused'}
                                    </span>
                                    <span style={{
                                        fontSize: '0.65rem',
                                        fontWeight: 600,
                                        padding: '0.15rem 0.45rem',
                                        borderRadius: '4px',
                                        background: modeStyle.bg,
                                        color: modeStyle.color,
                                        textTransform: 'uppercase'
                                    }}>
                                        {isCounter ? '🔢 Counter' : '⏱️ Time'}
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
                                        {isCounter ? (
                                            <>
                                                <span style={{ color: 'var(--text-muted)' }}>
                                                    <MessageCircle size={12} style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} />
                                                    {item.messageCount} / {item.interval} messages
                                                </span>
                                                <span style={{ color: 'var(--text-muted)' }}>
                                                    <Clock size={12} style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} />
                                                    Last triggered: {formatDate(item.lastTriggeredAt)}
                                                </span>
                                            </>
                                        ) : (
                                            <>
                                                <span style={{ color: 'var(--text-muted)' }}>
                                                    <Timer size={12} style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} />
                                                    Every {formatMinutes(item.timeInterval)} • {item.repeatsDone}/{item.repeatCount || '∞'} sent
                                                </span>
                                                <span style={{ color: 'var(--text-muted)' }}>
                                                    <Calendar size={12} style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} />
                                                    Next: {item.nextRunAt ? formatDate(item.nextRunAt) : 'N/A'}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                    <div style={{
                                        height: '6px',
                                        background: 'var(--bg-tertiary, rgba(255,255,255,0.05))',
                                        borderRadius: '3px',
                                        overflow: 'hidden'
                                    }}>
                                        <div style={{
                                            height: '100%',
                                            width: `${isCounter ? progressPct : timeProgressPct}%`,
                                            background: isCounter
                                                ? (progressPct >= 80 ? '#22c55e' : 'var(--primary)')
                                                : (timeProgressPct >= 80 ? '#22c55e' : '#a855f7'),
                                            borderRadius: '3px',
                                            transition: 'width 0.3s ease'
                                        }} />
                                    </div>
                                </div>

                                {/* Triggered count + actions */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        Triggered {item.triggerCount || 0}x total
                                        {(item._count?.logs > 0) && ` • ${item._count.logs} log(s)`}
                                    </span>
                                    <div style={{ display: 'flex', gap: '0.375rem' }}>
                                        {/* Logs button (only for time-based or if has logs) */}
                                        {(item.scheduleType === 'time' || (item._count?.logs > 0)) && (
                                            <button
                                                className="btn btn-ghost btn-sm"
                                                onClick={() => openLogs(item)}
                                                title="View logs"
                                                style={{ fontSize: '0.75rem', padding: '0.3rem 0.5rem' }}
                                            >
                                                <FileText size={13} />
                                            </button>
                                        )}
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
                <div className="modal-overlay open" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '560px' }}>
                        <div className="modal-header">
                            <h3>{editing ? 'Edit Marketing Interval' : 'New Marketing Interval'}</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                                {/* Schedule Type Selector (only for new) */}
                                {!editing && (
                                    <div>
                                        <label className="form-label">Schedule Type *</label>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <button
                                                type="button"
                                                onClick={() => setFormData(p => ({ ...p, scheduleType: 'counter' }))}
                                                style={{
                                                    flex: 1, padding: '0.75rem', borderRadius: '8px', cursor: 'pointer',
                                                    border: `2px solid ${formData.scheduleType === 'counter' ? '#3b82f6' : 'var(--border-color)'}`,
                                                    background: formData.scheduleType === 'counter' ? 'rgba(59,130,246,0.1)' : 'var(--bg-primary)',
                                                    color: 'var(--text-primary)', textAlign: 'center', transition: 'all 0.15s ease'
                                                }}
                                            >
                                                <Hash size={20} style={{ margin: '0 auto 0.25rem', display: 'block', color: '#3b82f6' }} />
                                                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Counter Mode</div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Send after every X messages</div>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setFormData(p => ({ ...p, scheduleType: 'time' }))}
                                                style={{
                                                    flex: 1, padding: '0.75rem', borderRadius: '8px', cursor: 'pointer',
                                                    border: `2px solid ${formData.scheduleType === 'time' ? '#a855f7' : 'var(--border-color)'}`,
                                                    background: formData.scheduleType === 'time' ? 'rgba(168,85,247,0.1)' : 'var(--bg-primary)',
                                                    color: 'var(--text-primary)', textAlign: 'center', transition: 'all 0.15s ease'
                                                }}
                                            >
                                                <Timer size={20} style={{ margin: '0 auto 0.25rem', display: 'block', color: '#a855f7' }} />
                                                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Time-Based</div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Send every X minutes</div>
                                            </button>
                                        </div>
                                    </div>
                                )}

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

                                {/* Mode-specific fields */}
                                {(formData.scheduleType || 'counter') === 'counter' ? (
                                    /* COUNTER MODE */
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
                                ) : (
                                    /* TIME-BASED MODE */
                                    <>
                                        <div>
                                            <label className="form-label"><Timer size={13} style={{ verticalAlign: 'middle' }} /> Time Interval (minutes) *</label>
                                            <input
                                                type="number"
                                                className="form-input"
                                                min="1"
                                                max="43200"
                                                value={formData.timeInterval}
                                                onChange={e => setFormData(p => ({ ...p, timeInterval: e.target.value }))}
                                                required
                                            />
                                            <small style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                                                Message will be sent every {formatMinutes(parseInt(formData.timeInterval) || 0)}
                                            </small>
                                        </div>
                                        <div>
                                            <label className="form-label"><Repeat size={13} style={{ verticalAlign: 'middle' }} /> Repeat Count (optional)</label>
                                            <input
                                                type="number"
                                                className="form-input"
                                                min="1"
                                                max="10000"
                                                placeholder="Leave empty for unlimited"
                                                value={formData.repeatCount}
                                                onChange={e => setFormData(p => ({ ...p, repeatCount: e.target.value }))}
                                            />
                                            <small style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                                                {formData.repeatCount ? `Will send ${formData.repeatCount} times then stop` : 'Will keep sending until paused'}
                                            </small>
                                        </div>
                                        <div>
                                            <label className="form-label"><Calendar size={13} style={{ verticalAlign: 'middle' }} /> Start Time (optional)</label>
                                            <input
                                                type="datetime-local"
                                                className="form-input"
                                                value={formData.scheduledAt}
                                                onChange={e => setFormData(p => ({ ...p, scheduledAt: e.target.value }))}
                                            />
                                            <small style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                                                {formData.scheduledAt ? `First send at ${new Date(formData.scheduledAt).toLocaleString()}` : 'Will start immediately after creation'}
                                            </small>
                                        </div>
                                    </>
                                )}

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

            {/* Logs Modal */}
            {showLogsModal && (
                <div className="modal-overlay open" onClick={() => setShowLogsModal(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '560px' }}>
                        <div className="modal-header">
                            <h3>Sending Logs — {showLogsModal.groupName || showLogsModal.groupJid}</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowLogsModal(null)}><X size={20} /></button>
                        </div>
                        <div className="modal-body" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                            {logsLoading ? (
                                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                    <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 0.5rem' }} />
                                    <p>Loading logs...</p>
                                </div>
                            ) : logs.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                    <FileText size={32} style={{ opacity: 0.3, margin: '0 auto 0.5rem' }} />
                                    <p>No sending logs yet</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {logs.map(log => (
                                        <div key={log.id} style={{
                                            display: 'flex', alignItems: 'center', gap: '0.75rem',
                                            padding: '0.5rem 0.75rem',
                                            background: 'var(--bg-tertiary, var(--bg-primary))',
                                            borderRadius: '6px',
                                            fontSize: '0.8rem'
                                        }}>
                                            <span style={{
                                                width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
                                                background: log.status === 'sent' ? '#22c55e' : '#ef4444'
                                            }} />
                                            <span style={{ flex: 1, color: 'var(--text-primary)' }}>
                                                {log.status === 'sent' ? 'Sent' : `Failed: ${log.errorMessage || 'Unknown error'}`}
                                            </span>
                                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                {formatDate(log.createdAt)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-ghost" onClick={() => setShowLogsModal(null)}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
