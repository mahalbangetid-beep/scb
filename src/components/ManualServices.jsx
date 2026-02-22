import { useState, useEffect } from 'react'
import { Plus, Trash2, Edit3, Package, Loader2, Save, X, ToggleLeft, ToggleRight } from 'lucide-react'
import api from '../services/api'

export default function ManualServices({ panelId }) {
    const [services, setServices] = useState([])
    const [loading, setLoading] = useState(false)
    const [showForm, setShowForm] = useState(false)
    const [editingId, setEditingId] = useState(null)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState(null)
    const [form, setForm] = useState({ serviceId: '', serviceName: '', category: '', rate: '', minOrder: '', maxOrder: '', refillable: false, notes: '' })

    useEffect(() => { if (panelId) fetchServices() }, [panelId])
    useEffect(() => { if (error) { const t = setTimeout(() => setError(null), 5000); return () => clearTimeout(t) } }, [error])

    const fetchServices = async () => {
        setLoading(true)
        try {
            const res = await api.get(`/panel-tools/${panelId}/manual-services`)
            setServices(res.data.data || [])
        } catch (e) { setError(e.response?.data?.message || 'Failed to load') }
        setLoading(false)
    }

    const handleSave = async () => {
        if (!form.serviceId || !form.serviceName) return setError('Service ID and name are required')
        setSaving(true)
        try {
            if (editingId) {
                await api.put(`/panel-tools/${panelId}/manual-services/${editingId}`, form)
            } else {
                await api.post(`/panel-tools/${panelId}/manual-services`, form)
            }
            resetForm()
            fetchServices()
        } catch (e) { setError(e.response?.data?.message || 'Failed to save') }
        setSaving(false)
    }

    const handleDelete = async (id) => {
        if (!confirm('Delete this service?')) return
        try {
            await api.delete(`/panel-tools/${panelId}/manual-services/${id}`)
            fetchServices()
        } catch (e) { setError(e.response?.data?.message || 'Failed to delete') }
    }

    const handleEdit = (s) => {
        setEditingId(s.id)
        setForm({ serviceId: s.serviceId, serviceName: s.serviceName, category: s.category || '', rate: s.rate || '', minOrder: s.minOrder || '', maxOrder: s.maxOrder || '', refillable: s.refillable, notes: s.notes || '' })
        setShowForm(true)
    }

    const handleToggle = async (s) => {
        try {
            await api.put(`/panel-tools/${panelId}/manual-services/${s.id}`, { isActive: !s.isActive })
            fetchServices()
        } catch (e) { setError(e.response?.data?.message || 'Failed to toggle') }
    }

    const resetForm = () => {
        setShowForm(false)
        setEditingId(null)
        setForm({ serviceId: '', serviceName: '', category: '', rate: '', minOrder: '', maxOrder: '', refillable: false, notes: '' })
    }

    if (!panelId) return <div className="empty-state"><p>Select a panel first</p></div>

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-md)' }}>
                <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>
                    <Package size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                    Manual Services ({services.length})
                </h3>
                <button className="btn btn-primary btn-sm" onClick={() => { resetForm(); setShowForm(true) }}>
                    <Plus size={14} /> Add Service
                </button>
            </div>

            {error && <div className="alert alert-error" style={{ marginBottom: 'var(--spacing-md)' }}>{error}</div>}

            {showForm && (
                <div className="card" style={{ marginBottom: 'var(--spacing-md)', padding: 'var(--spacing-md)' }}>
                    <h4 style={{ margin: '0 0 var(--spacing-sm)', color: 'var(--text-primary)' }}>{editingId ? 'Edit' : 'Add'} Manual Service</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-sm)' }}>
                        <div>
                            <label className="form-label">Service ID *</label>
                            <input className="form-input" placeholder="e.g. 1234" value={form.serviceId} onChange={e => setForm({ ...form, serviceId: e.target.value })} />
                        </div>
                        <div>
                            <label className="form-label">Service Name *</label>
                            <input className="form-input" placeholder="e.g. Instagram Followers" value={form.serviceName} onChange={e => setForm({ ...form, serviceName: e.target.value })} />
                        </div>
                        <div>
                            <label className="form-label">Category</label>
                            <input className="form-input" placeholder="e.g. Instagram" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
                        </div>
                        <div>
                            <label className="form-label">Rate (per 1000)</label>
                            <input className="form-input" type="number" step="0.01" placeholder="0.00" value={form.rate} onChange={e => setForm({ ...form, rate: e.target.value })} />
                        </div>
                        <div>
                            <label className="form-label">Min Order</label>
                            <input className="form-input" type="number" placeholder="100" value={form.minOrder} onChange={e => setForm({ ...form, minOrder: e.target.value })} />
                        </div>
                        <div>
                            <label className="form-label">Max Order</label>
                            <input className="form-input" type="number" placeholder="100000" value={form.maxOrder} onChange={e => setForm({ ...form, maxOrder: e.target.value })} />
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                            <label className="form-label">Notes</label>
                            <input className="form-input" placeholder="Optional notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input type="checkbox" id="refillable" checked={form.refillable} onChange={e => setForm({ ...form, refillable: e.target.checked })} />
                            <label htmlFor="refillable">Refillable</label>
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
            ) : services.length === 0 ? (
                <div className="empty-state"><p>No manual services added yet</p></div>
            ) : (
                <div className="table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Name</th>
                                <th>Category</th>
                                <th>Rate</th>
                                <th>Min/Max</th>
                                <th>Refill</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {services.map(s => (
                                <tr key={s.id} style={{ opacity: s.isActive ? 1 : 0.5 }}>
                                    <td><code>{s.serviceId}</code></td>
                                    <td>{s.serviceName}</td>
                                    <td>{s.category || '—'}</td>
                                    <td>{s.rate ? `$${s.rate}` : '—'}</td>
                                    <td>{s.minOrder || '—'} / {s.maxOrder || '—'}</td>
                                    <td>{s.refillable ? '✅' : '❌'}</td>
                                    <td>
                                        <button className="btn btn-ghost btn-sm" onClick={() => handleToggle(s)} title={s.isActive ? 'Disable' : 'Enable'}>
                                            {s.isActive ? <ToggleRight size={18} color="var(--color-success)" /> : <ToggleLeft size={18} />}
                                        </button>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            <button className="btn btn-ghost btn-sm" onClick={() => handleEdit(s)}><Edit3 size={14} /></button>
                                            <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(s.id)}><Trash2 size={14} color="var(--color-error)" /></button>
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
