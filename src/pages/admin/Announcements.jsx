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
            <div className="ann-loading">
                <Loader2 size={48} className="ann-spinner" />
            </div>
        )
    }

    return (
        <div className="ann-page">
            {/* Page Header */}
            <div className="ann-header">
                <div>
                    <h1>Announcements</h1>
                    <span className="ann-subtitle">Create global notices displayed to all users on their dashboard</span>
                </div>
                <div className="ann-header-actions">
                    <button className="ann-btn ann-btn-ghost" onClick={fetchAnnouncements}>
                        <RefreshCw size={14} /> Refresh
                    </button>
                    <button className="ann-btn ann-btn-primary" onClick={openCreate}>
                        <Plus size={16} /> New Announcement
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="ann-stats">
                <div className="ann-stat-card">
                    <div className="ann-stat-icon" style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)' }}>
                        <Megaphone size={20} />
                    </div>
                    <div className="ann-stat-info">
                        <span className="ann-stat-label">Total</span>
                        <span className="ann-stat-value">{announcements.length}</span>
                    </div>
                </div>
                <div className="ann-stat-card">
                    <div className="ann-stat-icon" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                        <Eye size={20} />
                    </div>
                    <div className="ann-stat-info">
                        <span className="ann-stat-label">Active</span>
                        <span className="ann-stat-value">{announcements.filter(a => a.isActive && !isExpired(a)).length}</span>
                    </div>
                </div>
                <div className="ann-stat-card">
                    <div className="ann-stat-icon" style={{ background: 'linear-gradient(135deg, #eab308, #ca8a04)' }}>
                        <Clock size={20} />
                    </div>
                    <div className="ann-stat-info">
                        <span className="ann-stat-label">Expired</span>
                        <span className="ann-stat-value">{announcements.filter(a => isExpired(a)).length}</span>
                    </div>
                </div>
            </div>

            {/* Announcements List */}
            <div className="ann-card">
                <div className="ann-card-header">
                    <h3>All Announcements</h3>
                    <span>Manage global notices for user dashboards</span>
                </div>

                {announcements.length === 0 ? (
                    <div className="ann-empty">
                        <Megaphone size={48} style={{ opacity: 0.2 }} />
                        <p>No announcements created yet</p>
                        <button className="ann-btn ann-btn-primary" onClick={openCreate}>
                            <Plus size={14} /> Create First Announcement
                        </button>
                    </div>
                ) : (
                    <div className="ann-list">
                        {announcements.map(ann => (
                            <div key={ann.id} className={`ann-item ${ann.isActive && !isExpired(ann) ? 'active' : 'inactive'}`}>
                                <div className="ann-item-content">
                                    <div className={`ann-item-icon ${ann.isActive && !isExpired(ann) ? 'active' : ''}`}>
                                        <Megaphone size={18} />
                                    </div>
                                    <div className="ann-item-body">
                                        <div className="ann-item-title">
                                            <span>{ann.title}</span>
                                            {ann.isActive && !isExpired(ann) ? (
                                                <span className="ann-badge ann-badge-success"><Eye size={10} /> Active</span>
                                            ) : isExpired(ann) ? (
                                                <span className="ann-badge ann-badge-warning"><Clock size={10} /> Expired</span>
                                            ) : (
                                                <span className="ann-badge ann-badge-neutral"><EyeOff size={10} /> Inactive</span>
                                            )}
                                        </div>
                                        <div className="ann-item-text">{ann.body}</div>
                                        <div className="ann-item-meta">
                                            <span>By {ann.createdBy || 'admin'}</span>
                                            <span>Created {new Date(ann.createdAt).toLocaleDateString()}</span>
                                            {ann.expiresAt && (
                                                <span><Calendar size={10} /> Expires {new Date(ann.expiresAt).toLocaleDateString()}</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="ann-item-actions">
                                        <button className="ann-btn-icon" onClick={() => handleToggle(ann)} title={ann.isActive ? 'Deactivate' : 'Activate'}>
                                            {ann.isActive ? <EyeOff size={14} /> : <Eye size={14} />}
                                        </button>
                                        <button className="ann-btn-icon" onClick={() => openEdit(ann)} title="Edit">
                                            <Edit3 size={14} />
                                        </button>
                                        <button className="ann-btn-icon ann-btn-danger" onClick={() => handleDelete(ann)} title="Delete">
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
                <div className="modal-overlay open" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
                        <div className="modal-header">
                            <h2>
                                <Megaphone size={18} />
                                {editing ? ' Edit Announcement' : ' New Announcement'}
                            </h2>
                            <button className="modal-close" onClick={() => setShowModal(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
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
                        <div className="modal-actions" style={{ padding: '1rem 1.5rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
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

            <style>{annStyles}</style>
        </div>
    )
}

const annStyles = `
    .ann-page { padding: 0; }
    .ann-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem; }
    .ann-header h1 { font-size: 1.75rem; font-weight: 700; color: var(--text-primary); margin: 0; }
    .ann-subtitle { font-size: 0.875rem; color: var(--text-secondary); }
    .ann-header-actions { display: flex; gap: 0.5rem; }

    .ann-btn { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.85rem; font-weight: 600; border: none; cursor: pointer; font-family: inherit; transition: all 0.15s; }
    .ann-btn-primary { background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; }
    .ann-btn-primary:hover { opacity: 0.9; transform: translateY(-1px); }
    .ann-btn-ghost { background: var(--bg-tertiary); color: var(--text-secondary); border: 1px solid var(--border-color); }
    .ann-btn-ghost:hover { background: var(--bg-card-hover); color: var(--text-primary); }

    .ann-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
    .ann-stat-card { display: flex; align-items: center; gap: 1rem; padding: 1rem 1.25rem; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; }
    .ann-stat-icon { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: white; flex-shrink: 0; }
    .ann-stat-info { display: flex; flex-direction: column; }
    .ann-stat-label { font-size: 0.78rem; color: var(--text-secondary); }
    .ann-stat-value { font-size: 1.25rem; font-weight: 700; color: var(--text-primary); }

    .ann-card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 14px; overflow: hidden; }
    .ann-card-header { padding: 1rem 1.5rem; border-bottom: 1px solid var(--border-color); }
    .ann-card-header h3 { font-size: 1rem; font-weight: 600; color: var(--text-primary); margin: 0; }
    .ann-card-header span { font-size: 0.8rem; color: var(--text-secondary); }

    .ann-empty { text-align: center; padding: 3rem; color: var(--text-muted); display: flex; flex-direction: column; align-items: center; gap: 0.75rem; }
    .ann-empty p { margin: 0; }

    .ann-list { display: flex; flex-direction: column; }
    .ann-item { padding: 1rem 1.5rem; border-bottom: 1px solid var(--border-color); transition: background 0.15s; }
    .ann-item:last-child { border-bottom: none; }
    .ann-item:hover { background: var(--bg-secondary); }
    .ann-item.inactive { opacity: 0.6; }
    .ann-item-content { display: flex; align-items: flex-start; gap: 1rem; }

    .ann-item-icon { width: 36px; height: 36px; border-radius: 50%; background: var(--bg-secondary); display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: var(--text-muted); }
    .ann-item-icon.active { background: linear-gradient(135deg, #6366f1, #a855f7); color: white; }

    .ann-item-body { flex: 1; min-width: 0; }
    .ann-item-title { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 4px; }
    .ann-item-title > span:first-child { font-weight: 700; font-size: 0.95rem; }
    .ann-item-text { font-size: 0.82rem; color: var(--text-secondary); line-height: 1.5; margin-bottom: 6px; }
    .ann-item-meta { display: flex; gap: 1rem; font-size: 0.7rem; color: var(--text-muted); flex-wrap: wrap; }
    .ann-item-meta span { display: flex; align-items: center; gap: 3px; }

    .ann-badge { padding: 2px 8px; border-radius: 20px; font-size: 0.65rem; font-weight: 600; display: inline-flex; align-items: center; gap: 3px; }
    .ann-badge-success { background: rgba(16,185,129,0.1); color: #10b981; }
    .ann-badge-warning { background: rgba(234,179,8,0.1); color: #eab308; }
    .ann-badge-neutral { background: rgba(156,163,175,0.1); color: #9ca3af; }

    .ann-item-actions { display: flex; gap: 4px; flex-shrink: 0; }
    .ann-btn-icon { background: none; border: 1px solid var(--border-color); border-radius: 6px; padding: 6px; cursor: pointer; color: var(--text-secondary); transition: all 0.15s; display: flex; align-items: center; }
    .ann-btn-icon:hover { background: var(--bg-tertiary); color: var(--text-primary); }
    .ann-btn-danger { color: #ef4444; }
    .ann-btn-danger:hover { background: rgba(239,68,68,0.08); color: #ef4444; }

    .ann-loading { display: flex; align-items: center; justify-content: center; min-height: 400px; }
    @keyframes ann-spin { to { transform: rotate(360deg); } }
    .ann-spinner { animation: ann-spin 1s linear infinite; color: var(--primary-500); }
`
