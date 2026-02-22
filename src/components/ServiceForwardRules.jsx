import { useState, useEffect } from 'react'
import { Plus, Trash2, Edit3, Shield, Loader2, Save, X, ToggleLeft, ToggleRight, ArrowRightCircle } from 'lucide-react'
import api from '../services/api'

export default function ServiceForwardRules({ panelId }) {
    const [rules, setRules] = useState([])
    const [loading, setLoading] = useState(false)
    const [showForm, setShowForm] = useState(false)
    const [editingId, setEditingId] = useState(null)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState(null)
    const [form, setForm] = useState({ serviceId: '', serviceName: '', forwardRefill: true, forwardCancel: true, forwardToGroup: '', forwardToChat: '', reason: '' })

    useEffect(() => { if (panelId) fetchRules() }, [panelId])
    useEffect(() => { if (error) { const t = setTimeout(() => setError(null), 5000); return () => clearTimeout(t) } }, [error])

    const fetchRules = async () => {
        setLoading(true)
        try {
            const res = await api.get(`/panel-tools/${panelId}/forward-rules`)
            setRules(res.data.data || [])
        } catch (e) { setError(e.response?.data?.message || 'Failed to load') }
        setLoading(false)
    }

    const handleSave = async () => {
        if (!form.serviceId) return setError('Service ID is required')
        setSaving(true)
        try {
            if (editingId) {
                await api.put(`/panel-tools/${panelId}/forward-rules/${editingId}`, form)
            } else {
                await api.post(`/panel-tools/${panelId}/forward-rules`, form)
            }
            resetForm()
            fetchRules()
        } catch (e) { setError(e.response?.data?.message || 'Failed to save') }
        setSaving(false)
    }

    const handleDelete = async (id) => {
        if (!confirm('Delete this forward rule?')) return
        try {
            await api.delete(`/panel-tools/${panelId}/forward-rules/${id}`)
            fetchRules()
        } catch (e) { setError(e.response?.data?.message || 'Failed to delete') }
    }

    const handleEdit = (r) => {
        setEditingId(r.id)
        setForm({ serviceId: r.serviceId, serviceName: r.serviceName || '', forwardRefill: r.forwardRefill, forwardCancel: r.forwardCancel, forwardToGroup: r.forwardToGroup || '', forwardToChat: r.forwardToChat || '', reason: r.reason || '' })
        setShowForm(true)
    }

    const handleToggle = async (r) => {
        try {
            await api.put(`/panel-tools/${panelId}/forward-rules/${r.id}`, { isActive: !r.isActive })
            fetchRules()
        } catch (e) { setError(e.response?.data?.message || 'Failed to toggle') }
    }

    const resetForm = () => {
        setShowForm(false)
        setEditingId(null)
        setForm({ serviceId: '', serviceName: '', forwardRefill: true, forwardCancel: true, forwardToGroup: '', forwardToChat: '', reason: '' })
    }

    if (!panelId) return <div className="empty-state"><p>Select a panel first</p></div>

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-md)' }}>
                <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>
                    <ArrowRightCircle size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                    Service ID Forward Rules ({rules.length})
                </h3>
                <button className="btn btn-primary btn-sm" onClick={() => { resetForm(); setShowForm(true) }}>
                    <Plus size={14} /> Add Rule
                </button>
            </div>

            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 'var(--spacing-md)' }}>
                Define specific service IDs that should be forwarded to support groups instead of using API. When a refill/cancel comes for these services, the request will be forwarded instead of sent via API.
            </p>

            {error && <div className="alert alert-error" style={{ marginBottom: 'var(--spacing-md)' }}>{error}</div>}

            {showForm && (
                <div className="card" style={{ marginBottom: 'var(--spacing-md)', padding: 'var(--spacing-md)' }}>
                    <h4 style={{ margin: '0 0 var(--spacing-sm)', color: 'var(--text-primary)' }}>{editingId ? 'Edit' : 'Add'} Forward Rule</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-sm)' }}>
                        <div>
                            <label className="form-label">Service ID *</label>
                            <input className="form-input" placeholder="e.g. 5678" value={form.serviceId} onChange={e => setForm({ ...form, serviceId: e.target.value })} />
                        </div>
                        <div>
                            <label className="form-label">Service Name (Optional)</label>
                            <input className="form-input" placeholder="e.g. Instagram Likes Premium" value={form.serviceName} onChange={e => setForm({ ...form, serviceName: e.target.value })} />
                        </div>
                        <div>
                            <label className="form-label">Forward to WA Group JID</label>
                            <input className="form-input" placeholder="e.g. 120363xxx@g.us" value={form.forwardToGroup} onChange={e => setForm({ ...form, forwardToGroup: e.target.value })} />
                        </div>
                        <div>
                            <label className="form-label">Forward to Telegram Chat ID</label>
                            <input className="form-input" placeholder="e.g. -1001234567890" value={form.forwardToChat} onChange={e => setForm({ ...form, forwardToChat: e.target.value })} />
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                            <label className="form-label">Reason / Notes</label>
                            <input className="form-input" placeholder="e.g. Provider requested manual handling" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} />
                        </div>
                        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <input type="checkbox" checked={form.forwardRefill} onChange={e => setForm({ ...form, forwardRefill: e.target.checked })} />
                                Forward Refill
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <input type="checkbox" checked={form.forwardCancel} onChange={e => setForm({ ...form, forwardCancel: e.target.checked })} />
                                Forward Cancel
                            </label>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--spacing-sm)', marginTop: 'var(--spacing-md)' }}>
                        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {editingId ? 'Update' : 'Create'}
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={resetForm}><X size={14} /> Cancel</button>
                    </div>
                </div>
            )}

            {loading ? (
                <div style={{ textAlign: 'center', padding: 'var(--spacing-xl)' }}><Loader2 size={24} className="animate-spin" /></div>
            ) : rules.length === 0 ? (
                <div className="empty-state"><p>No forward rules defined yet</p></div>
            ) : (
                <div className="table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Service ID</th>
                                <th>Name</th>
                                <th>Refill</th>
                                <th>Cancel</th>
                                <th>Forward To</th>
                                <th>Reason</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rules.map(r => (
                                <tr key={r.id} style={{ opacity: r.isActive ? 1 : 0.5 }}>
                                    <td><code>{r.serviceId}</code></td>
                                    <td>{r.serviceName || '—'}</td>
                                    <td>{r.forwardRefill ? '✅' : '❌'}</td>
                                    <td>{r.forwardCancel ? '✅' : '❌'}</td>
                                    <td style={{ fontSize: 12 }}>
                                        {r.forwardToGroup && <div>WA: <code>{r.forwardToGroup}</code></div>}
                                        {r.forwardToChat && <div>TG: <code>{r.forwardToChat}</code></div>}
                                        {!r.forwardToGroup && !r.forwardToChat && <span style={{ color: 'var(--text-tertiary)' }}>Default</span>}
                                    </td>
                                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.reason || '—'}</td>
                                    <td>
                                        <button className="btn btn-ghost btn-sm" onClick={() => handleToggle(r)} title={r.isActive ? 'Disable' : 'Enable'}>
                                            {r.isActive ? <ToggleRight size={18} color="var(--color-success)" /> : <ToggleLeft size={18} />}
                                        </button>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            <button className="btn btn-ghost btn-sm" onClick={() => handleEdit(r)}><Edit3 size={14} /></button>
                                            <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(r.id)}><Trash2 size={14} color="var(--color-error)" /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
