import { useState, useEffect, useCallback } from 'react'
import {
    Megaphone,
    Plus,
    Edit3,
    Trash2,
    X,
    Loader2,
    Eye,
    EyeOff,
    Calendar,
    Clock,
    RefreshCw
} from 'lucide-react'
import api from '../../services/api'

export default function Announcements() {
    const [announcements, setAnnouncements] = useState([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [editing, setEditing] = useState(null)
    const [form, setForm] = useState({ title: '', body: '', expiresAt: '' })
    const [saving, setSaving] = useState(false)

    const fetchAnnouncements = useCallback(async () => {
        try {
            const res = await api.get('/admin/announcements')
            setAnnouncements(res.data || [])
        } catch (err) {
            console.error('Failed to fetch announcements:', err)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchAnnouncements()
    }, [fetchAnnouncements])

    const openCreate = () => {
        setEditing(null)
        setForm({ title: '', body: '', expiresAt: '' })
        setShowModal(true)
    }

    const openEdit = (ann) => {
        setEditing(ann)
        setForm({
            title: ann.title,
            body: ann.body,
            expiresAt: ann.expiresAt ? ann.expiresAt.slice(0, 16) : ''
        })
        setShowModal(true)
    }

    const handleSave = async () => {
        if (!form.title.trim() || !form.body.trim()) return
        setSaving(true)
        try {
            if (editing) {
                await api.put(`/admin/announcements/${editing.id}`, {
                    title: form.title,
                    body: form.body,
                    expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null
                })
            } else {
                await api.post('/admin/announcements', {
                    title: form.title,
                    body: form.body,
                    expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null
                })
            }
            setShowModal(false)
            fetchAnnouncements()
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to save')
        } finally {
            setSaving(false)
        }
    }

    const handleToggle = async (ann) => {
        try {
            await api.put(`/admin/announcements/${ann.id}`, { isActive: !ann.isActive })
            fetchAnnouncements()
        } catch (err) {
            console.error('Toggle failed:', err)
        }
    }

    const handleDelete = async (ann) => {
        if (!confirm(`Delete announcement "${ann.title}"?`)) return
        try {
            await api.delete(`/admin/announcements/${ann.id}`)
            fetchAnnouncements()
        } catch (err) {
            console.error('Delete failed:', err)
        }
    }

    const isExpired = (ann) => ann.expiresAt && new Date(ann.expiresAt) < new Date()

    if (loading) {
        return (
            <div className="page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
                <Loader2 size={48} className="animate-spin" style={{ color: 'var(--primary-500)' }} />
            </div>
        )
    }

    return (
        <div className="page-content">
            {/* Page Header */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">Announcements</h1>
                    <p className="page-subtitle">
                        Create global notices displayed to all users on their dashboard
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                    <button className="btn btn-secondary btn-sm" onClick={fetchAnnouncements}>
                        <RefreshCw size={14} /> Refresh
                    </button>
                    <button className="btn btn-primary" onClick={openCreate}>
                        <Plus size={16} /> New Announcement
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 'var(--spacing-md)',
                marginBottom: 'var(--spacing-lg)'
            }}>
                <div className="stat-card">
                    <div className="stat-card-header">
                        <div className="stat-icon primary"><Megaphone size={20} /></div>
                    </div>
                    <div className="stat-value">{announcements.length}</div>
                    <div className="stat-label">Total</div>
                </div>
                <div className="stat-card">
                    <div className="stat-card-header">
                        <div className="stat-icon success"><Eye size={20} /></div>
                    </div>
                    <div className="stat-value">{announcements.filter(a => a.isActive && !isExpired(a)).length}</div>
                    <div className="stat-label">Active</div>
                </div>
                <div className="stat-card">
                    <div className="stat-card-header">
                        <div className="stat-icon warning"><Clock size={20} /></div>
                    </div>
                    <div className="stat-value">{announcements.filter(a => isExpired(a)).length}</div>
                    <div className="stat-label">Expired</div>
                </div>
            </div>

            {/* Announcements List */}
            <div className="card">
                <div className="card-header">
                    <div>
                        <h3 className="card-title">All Announcements</h3>
                        <p className="card-subtitle">Manage global notices for user dashboards</p>
                    </div>
                </div>

                {announcements.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 'var(--spacing-2xl)', color: 'var(--text-muted)' }}>
                        <Megaphone size={48} style={{ opacity: 0.2, marginBottom: '12px' }} />
                        <p>No announcements created yet</p>
                        <button className="btn btn-primary btn-sm" onClick={openCreate} style={{ marginTop: '12px' }}>
                            <Plus size={14} /> Create First Announcement
                        </button>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)', padding: 'var(--spacing-md)' }}>
                        {announcements.map(ann => (
                            <div key={ann.id} style={{
                                padding: 'var(--spacing-md) var(--spacing-lg)',
                                background: 'var(--bg-tertiary)',
                                borderRadius: 'var(--radius-lg)',
                                border: `1px solid ${ann.isActive && !isExpired(ann) ? 'rgba(99,102,241,0.3)' : 'var(--border-color)'}`,
                                opacity: ann.isActive && !isExpired(ann) ? 1 : 0.6,
                                transition: 'all 0.2s'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--spacing-md)' }}>
                                    <div style={{
                                        width: '40px', height: '40px', borderRadius: '50%',
                                        background: ann.isActive && !isExpired(ann)
                                            ? 'linear-gradient(135deg, #6366f1, #a855f7)'
                                            : 'var(--bg-secondary)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        flexShrink: 0
                                    }}>
                                        <Megaphone size={18} color={ann.isActive && !isExpired(ann) ? '#fff' : 'var(--text-muted)'} />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', marginBottom: '4px' }}>
                                            <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{ann.title}</span>
                                            {ann.isActive && !isExpired(ann) ? (
                                                <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>
                                                    <Eye size={10} /> Active
                                                </span>
                                            ) : isExpired(ann) ? (
                                                <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>
                                                    <Clock size={10} /> Expired
                                                </span>
                                            ) : (
                                                <span className="badge badge-neutral" style={{ fontSize: '0.65rem' }}>
                                                    <EyeOff size={10} /> Inactive
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '6px' }}>
                                            {ann.body}
                                        </div>
                                        <div style={{ display: 'flex', gap: 'var(--spacing-md)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                            <span>By {ann.createdBy || 'admin'}</span>
                                            <span>Created {new Date(ann.createdAt).toLocaleDateString()}</span>
                                            {ann.expiresAt && (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                    <Calendar size={10} />
                                                    Expires {new Date(ann.expiresAt).toLocaleDateString()}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 'var(--spacing-xs)', flexShrink: 0 }}>
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => handleToggle(ann)}
                                            title={ann.isActive ? 'Deactivate' : 'Activate'}
                                        >
                                            {ann.isActive ? <EyeOff size={14} /> : <Eye size={14} />}
                                        </button>
                                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(ann)} title="Edit">
                                            <Edit3 size={14} />
                                        </button>
                                        <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(ann)} title="Delete"
                                            style={{ color: 'var(--error)' }}>
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Create/Edit Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
                        <div className="modal-header">
                            <h3 className="modal-title">
                                <Megaphone size={18} />
                                {editing ? 'Edit Announcement' : 'New Announcement'}
                            </h3>
                            <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>
                                <X size={16} />
                            </button>
                        </div>
                        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                            <div className="form-group">
                                <label className="form-label">Title *</label>
                                <input
                                    className="form-input"
                                    value={form.title}
                                    onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                                    placeholder="Announcement title..."
                                    autoFocus
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Body *</label>
                                <textarea
                                    className="form-input"
                                    rows={4}
                                    value={form.body}
                                    onChange={e => setForm(p => ({ ...p, body: e.target.value }))}
                                    placeholder="Write your announcement message..."
                                    style={{ resize: 'vertical' }}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Expiry Date (optional)</label>
                                <input
                                    type="datetime-local"
                                    className="form-input"
                                    value={form.expiresAt}
                                    onChange={e => setForm(p => ({ ...p, expiresAt: e.target.value }))}
                                />
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                    Leave blank for no expiration
                                </span>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                            <button
                                className="btn btn-primary"
                                onClick={handleSave}
                                disabled={saving || !form.title.trim() || !form.body.trim()}
                            >
                                {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : editing ? 'Update' : 'Create'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
