import { useState, useEffect } from 'react'
import {
    Users, Plus, Search, Trash2, Edit3,
    RefreshCw, Loader2, AlertTriangle, CheckCircle, X,
    Smartphone, Download, Copy, Megaphone, Headphones,
    Layers, FileText, Eye, EyeOff, AlertCircle
} from 'lucide-react'
import api from '../services/api'

const PURPOSE_STYLES = {
    marketing: { bg: 'rgba(147, 51, 234, 0.1)', color: '#a855f7', label: 'Marketing', icon: Megaphone },
    support: { bg: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', label: 'Support', icon: Headphones },
    both: { bg: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', label: 'Both', icon: Layers }
}

export default function SupportGroups() {
    const [groups, setGroups] = useState([])
    const [devices, setDevices] = useState([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [showImportModal, setShowImportModal] = useState(false)
    const [editing, setEditing] = useState(null)
    const [error, setError] = useState(null)
    const [success, setSuccess] = useState(null)
    const [actionLoading, setActionLoading] = useState(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [filterPurpose, setFilterPurpose] = useState('')
    const [filterDevice, setFilterDevice] = useState('')
    const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 })

    const [formData, setFormData] = useState({
        groupJid: '',
        groupName: '',
        deviceId: '',
        purpose: 'both',
        notes: ''
    })

    const [importDevice, setImportDevice] = useState('')
    const [importPurpose, setImportPurpose] = useState('both')

    useEffect(() => { fetchData() }, [pagination.page, filterPurpose, filterDevice])
    useEffect(() => { if (success) { const t = setTimeout(() => setSuccess(null), 4000); return () => clearTimeout(t) } }, [success])
    useEffect(() => { if (error) { const t = setTimeout(() => setError(null), 6000); return () => clearTimeout(t) } }, [error])

    const fetchData = async () => {
        try {
            setLoading(true)
            const params = new URLSearchParams()
            params.append('page', pagination.page)
            params.append('limit', pagination.limit)
            if (filterPurpose) params.append('purpose', filterPurpose)
            if (filterDevice) params.append('deviceId', filterDevice)
            if (searchTerm) params.append('search', searchTerm)

            const [groupsRes, devicesRes] = await Promise.all([
                api.get(`/support-groups?${params.toString()}`),
                api.get('/devices')
            ])

            setGroups(groupsRes.data || [])
            if (groupsRes.pagination) {
                setPagination(prev => ({
                    ...prev,
                    total: groupsRes.pagination.total || 0,
                    totalPages: groupsRes.pagination.totalPages || 1
                }))
            }

            const devList = devicesRes.data || devicesRes || []
            setDevices(Array.isArray(devList) ? devList : [])
        } catch (err) {
            setError(err.error?.message || err.message || 'Failed to load data')
        } finally {
            setLoading(false)
        }
    }

    const handleSearch = (e) => {
        e.preventDefault()
        setPagination(prev => ({ ...prev, page: 1 }))
        fetchData()
    }

    const openModal = (item = null) => {
        if (item) {
            setEditing(item)
            setFormData({
                groupJid: item.groupJid,
                groupName: item.groupName || '',
                deviceId: item.deviceId || '',
                purpose: item.purpose || 'both',
                notes: item.notes || ''
            })
        } else {
            setEditing(null)
            setFormData({
                groupJid: '',
                groupName: '',
                deviceId: '',
                purpose: 'both',
                notes: ''
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
            const payload = { ...formData }
            if (!payload.deviceId) delete payload.deviceId
            if (!payload.notes) delete payload.notes

            if (editing) {
                await api.put(`/support-groups/${editing.id}`, payload)
                setSuccess('Support group updated successfully')
            } else {
                if (!payload.groupJid || !payload.groupName) {
                    throw { message: 'Group ID and Group Name are required' }
                }
                await api.post('/support-groups', payload)
                setSuccess('Support group added successfully')
            }
            setShowModal(false)
            fetchData()
        } catch (err) {
            setError(err.error?.message || err.message || 'Failed to save')
        } finally {
            setActionLoading(null)
        }
    }

    const handleToggleActive = async (id, isActive) => {
        setActionLoading(id)
        try {
            await api.put(`/support-groups/${id}`, { isActive: !isActive })
            setSuccess(`Group ${!isActive ? 'activated' : 'deactivated'}`)
            fetchData()
        } catch (err) {
            setError(err.error?.message || err.message || 'Failed to toggle status')
        } finally {
            setActionLoading(null)
        }
    }

    const handleDelete = async (id) => {
        if (!confirm('Are you sure you want to delete this group?')) return
        setActionLoading(`del-${id}`)
        try {
            await api.delete(`/support-groups/${id}`)
            setSuccess('Support group deleted')
            fetchData()
        } catch (err) {
            setError(err.error?.message || err.message || 'Failed to delete')
        } finally {
            setActionLoading(null)
        }
    }

    const handleImport = async () => {
        if (!importDevice) {
            setError('Select a device to import from')
            return
        }
        setActionLoading('import')
        try {
            const res = await api.post(`/support-groups/import/${importDevice}`, {
                purpose: importPurpose
            })
            setSuccess(res.message || `Imported ${res.data?.added || 0} groups`)
            setShowImportModal(false)
            fetchData()
        } catch (err) {
            setError(err.error?.message || err.message || 'Import failed')
        } finally {
            setActionLoading(null)
        }
    }

    const copyJid = (jid) => {
        navigator.clipboard.writeText(jid)
        setSuccess('Group JID copied to clipboard')
    }

    const connectedDevices = devices.filter(d => d.status === 'connected')

    const stats = {
        total: pagination.total,
        active: groups.filter(g => g.isActive).length,
        marketing: groups.filter(g => ['marketing', 'both'].includes(g.purpose)).length,
        support: groups.filter(g => ['support', 'both'].includes(g.purpose)).length
    }

    // Loading state
    if (loading && groups.length === 0) {
        return (
            <div className="page-container">
                <div className="loading-container">
                    <Loader2 size={32} className="animate-spin" />
                    <p>Loading support groups...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="page-container">
            {/* Page Header */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">Support Groups</h1>
                    <p className="page-subtitle">Manage WhatsApp groups for marketing & support forwarding</p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                    <button className="btn btn-secondary" onClick={fetchData} disabled={loading}>
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                    {connectedDevices.length > 0 && (
                        <button className="btn btn-secondary" onClick={() => { setShowImportModal(true); setError(null) }}>
                            <Download size={16} />
                            Import from Device
                        </button>
                    )}
                    <button className="btn btn-primary" onClick={() => openModal()}>
                        <Plus size={16} />
                        Add Group
                    </button>
                </div>
            </div>

            {/* Alerts */}
            {success && (
                <div className="alert alert-success">
                    <CheckCircle size={16} />
                    <span>{success}</span>
                    <button onClick={() => setSuccess(null)}><X size={14} /></button>
                </div>
            )}
            {error && (
                <div className="alert alert-error">
                    <AlertCircle size={16} />
                    <span>{error}</span>
                    <button onClick={() => setError(null)}><X size={14} /></button>
                </div>
            )}

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)' }}>
                <div className="stat-card">
                    <div className="stat-label"><Users size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Total Groups</div>
                    <div className="stat-value">{stats.total}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label"><Eye size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Active</div>
                    <div className="stat-value" style={{ color: 'var(--success)' }}>{stats.active}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label"><Megaphone size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Marketing</div>
                    <div className="stat-value" style={{ color: '#a855f7' }}>{stats.marketing}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label"><Headphones size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Support</div>
                    <div className="stat-value" style={{ color: '#3b82f6' }}>{stats.support}</div>
                </div>
            </div>

            {/* Search & Filters */}
            <div className="filter-bar" style={{ display: 'flex', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-lg)', flexWrap: 'wrap', alignItems: 'center' }}>
                <form onSubmit={handleSearch} style={{ position: 'relative', flex: '1 1 250px', minWidth: '200px' }}>
                    <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                    <input
                        type="text"
                        placeholder="Search by name, JID, or notes..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="form-input"
                        style={{ paddingLeft: '36px', width: '100%' }}
                    />
                </form>
                <select
                    className="form-input"
                    style={{ width: 'auto', minWidth: '140px' }}
                    value={filterPurpose}
                    onChange={e => { setFilterPurpose(e.target.value); setPagination(p => ({ ...p, page: 1 })) }}
                >
                    <option value="">All Purposes</option>
                    <option value="marketing">Marketing</option>
                    <option value="support">Support</option>
                    <option value="both">Both</option>
                </select>
                <select
                    className="form-input"
                    style={{ width: 'auto', minWidth: '140px' }}
                    value={filterDevice}
                    onChange={e => { setFilterDevice(e.target.value); setPagination(p => ({ ...p, page: 1 })) }}
                >
                    <option value="">All Devices</option>
                    {devices.map(d => (
                        <option key={d.id} value={d.id}>
                            {d.name} {d.phone ? `(${d.phone})` : ''}
                        </option>
                    ))}
                </select>
            </div>

            {/* Groups Table */}
            {groups.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon">
                        <Users size={32} />
                    </div>
                    <div className="empty-state-title">No support groups yet</div>
                    <div className="empty-state-description">
                        Add your WhatsApp groups here to use them for marketing broadcasts and support forwarding
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--spacing-sm)', flexWrap: 'wrap' }}>
                        <button className="btn btn-primary" onClick={() => openModal()}>
                            <Plus size={16} /> Add First Group
                        </button>
                        {connectedDevices.length > 0 && (
                            <button className="btn btn-secondary" onClick={() => setShowImportModal(true)}>
                                <Download size={16} /> Import from Device
                            </button>
                        )}
                    </div>
                </div>
            ) : (
                <div className="table-container">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Status</th>
                                <th>Group</th>
                                <th>Group JID</th>
                                <th>Purpose</th>
                                <th>Device</th>
                                <th>Notes</th>
                                <th>Created</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {groups.map(group => {
                                const ps = PURPOSE_STYLES[group.purpose] || PURPOSE_STYLES.both
                                const PurposeIcon = ps.icon

                                return (
                                    <tr key={group.id} style={{ opacity: group.isActive ? 1 : 0.55 }}>
                                        <td>
                                            <span className={`badge ${group.isActive ? 'badge-success' : 'badge-error'}`}>
                                                <span className={`status-dot ${group.isActive ? 'online' : 'offline'}`}></span>
                                                {group.isActive ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        <td>
                                            <div style={{ fontWeight: 600 }}>{group.groupName}</div>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <code style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{group.groupJid}</code>
                                                <button
                                                    onClick={() => copyJid(group.groupJid)}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px', display: 'flex' }}
                                                    title="Copy JID"
                                                >
                                                    <Copy size={13} />
                                                </button>
                                            </div>
                                        </td>
                                        <td>
                                            <span style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                                padding: '3px 8px',
                                                borderRadius: '6px',
                                                background: ps.bg,
                                                color: ps.color
                                            }}>
                                                <PurposeIcon size={12} />
                                                {ps.label}
                                            </span>
                                        </td>
                                        <td>
                                            {group.device ? (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                                    <Smartphone size={13} />
                                                    {group.device.name}
                                                </div>
                                            ) : (
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>—</span>
                                            )}
                                        </td>
                                        <td>
                                            {group.notes ? (
                                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}
                                                    title={group.notes}>
                                                    {group.notes.length > 30 ? group.notes.substring(0, 30) + '...' : group.notes}
                                                </span>
                                            ) : (
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>—</span>
                                            )}
                                        </td>
                                        <td>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                {new Date(group.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </span>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => handleToggleActive(group.id, group.isActive)}
                                                    disabled={actionLoading === group.id}
                                                    title={group.isActive ? 'Deactivate' : 'Activate'}
                                                >
                                                    {actionLoading === group.id
                                                        ? <Loader2 size={14} className="animate-spin" />
                                                        : group.isActive ? <EyeOff size={14} /> : <Eye size={14} />
                                                    }
                                                </button>
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => openModal(group)}
                                                    title="Edit"
                                                >
                                                    <Edit3 size={14} />
                                                </button>
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => handleDelete(group.id)}
                                                    disabled={actionLoading === `del-${group.id}`}
                                                    title="Delete"
                                                    style={{ color: 'var(--error)' }}
                                                >
                                                    {actionLoading === `del-${group.id}`
                                                        ? <Loader2 size={14} className="animate-spin" />
                                                        : <Trash2 size={14} />
                                                    }
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Pagination */}
            {pagination.totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 'var(--spacing-sm)', marginTop: 'var(--spacing-lg)' }}>
                    <button
                        className="btn btn-ghost btn-sm"
                        disabled={pagination.page <= 1}
                        onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                    >
                        Previous
                    </button>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        Page {pagination.page} of {pagination.totalPages}
                    </span>
                    <button
                        className="btn btn-ghost btn-sm"
                        disabled={pagination.page >= pagination.totalPages}
                        onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                    >
                        Next
                    </button>
                </div>
            )}

            {/* Add/Edit Group Modal */}
            {showModal && (
                <div className="modal-overlay open" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
                        <div className="modal-header">
                            <h2>{editing ? 'Edit Support Group' : 'Add Support Group'}</h2>
                            <button className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                                    {/* Group JID */}
                                    <div className="form-group">
                                        <label className="form-label">Group ID (JID) *</label>
                                        <input
                                            className="form-input"
                                            placeholder="e.g. 120363012345678901@g.us"
                                            value={formData.groupJid}
                                            onChange={e => setFormData(p => ({ ...p, groupJid: e.target.value }))}
                                            required
                                            disabled={!!editing}
                                        />
                                        <div className="form-hint">
                                            Send <code>.groupid</code> in a WhatsApp group to get this ID. @g.us will be added automatically.
                                        </div>
                                    </div>

                                    {/* Group Name */}
                                    <div className="form-group">
                                        <label className="form-label">Group Name *</label>
                                        <input
                                            className="form-input"
                                            placeholder="e.g. My Business Group"
                                            value={formData.groupName}
                                            onChange={e => setFormData(p => ({ ...p, groupName: e.target.value }))}
                                            required
                                        />
                                    </div>

                                    {/* Device */}
                                    <div className="form-group">
                                        <label className="form-label">WhatsApp Device (optional)</label>
                                        <select
                                            className="form-input"
                                            value={formData.deviceId}
                                            onChange={e => setFormData(p => ({ ...p, deviceId: e.target.value }))}
                                        >
                                            <option value="">No device binding</option>
                                            {devices.map(d => (
                                                <option key={d.id} value={d.id}>
                                                    {d.name} {d.phone ? `(${d.phone})` : ''} — {d.status}
                                                </option>
                                            ))}
                                        </select>
                                        <div className="form-hint">Optionally bind to a specific WhatsApp device</div>
                                    </div>

                                    {/* Purpose */}
                                    <div className="form-group">
                                        <label className="form-label">Purpose *</label>
                                        <select
                                            className="form-input"
                                            value={formData.purpose}
                                            onChange={e => setFormData(p => ({ ...p, purpose: e.target.value }))}
                                            required
                                        >
                                            <option value="both">Both (Marketing & Support)</option>
                                            <option value="marketing">Marketing Only</option>
                                            <option value="support">Support Only</option>
                                        </select>
                                        <div className="form-hint">Controls where this group appears when selecting for broadcasts or forwarding</div>
                                    </div>

                                    {/* Notes */}
                                    <div className="form-group">
                                        <label className="form-label"><FileText size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Notes (optional)</label>
                                        <textarea
                                            className="form-input"
                                            placeholder="Any notes about this group..."
                                            value={formData.notes}
                                            onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
                                            rows={2}
                                            maxLength={500}
                                            style={{ resize: 'vertical', minHeight: '60px' }}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="modal-footer">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={actionLoading === 'submit'}>
                                    {actionLoading === 'submit' ? <Loader2 size={14} className="animate-spin" /> : editing ? <Edit3 size={14} /> : <Plus size={14} />}
                                    {editing ? 'Update' : 'Add Group'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Import from Device Modal */}
            {showImportModal && (
                <div className="modal-overlay open" onClick={() => setShowImportModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
                        <div className="modal-header">
                            <h2>Import Groups from Device</h2>
                            <button className="modal-close" onClick={() => setShowImportModal(false)}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                                    Automatically fetch all WhatsApp groups from a connected device and add them to your support groups.
                                </p>

                                <div className="form-group">
                                    <label className="form-label">Connected Device *</label>
                                    <select
                                        className="form-input"
                                        value={importDevice}
                                        onChange={e => setImportDevice(e.target.value)}
                                        required
                                    >
                                        <option value="">Select a connected device...</option>
                                        {connectedDevices.map(d => (
                                            <option key={d.id} value={d.id}>
                                                {d.name} {d.phone ? `(${d.phone})` : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Default Purpose</label>
                                    <select
                                        className="form-input"
                                        value={importPurpose}
                                        onChange={e => setImportPurpose(e.target.value)}
                                    >
                                        <option value="both">Both (Marketing & Support)</option>
                                        <option value="marketing">Marketing Only</option>
                                        <option value="support">Support Only</option>
                                    </select>
                                    <div className="form-hint">
                                        All imported groups will get this purpose. You can change individually later.
                                    </div>
                                </div>

                                {connectedDevices.length === 0 && (
                                    <div className="alert alert-warning">
                                        <AlertTriangle size={16} />
                                        <span>No connected devices found. Connect a WhatsApp device first.</span>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-ghost" onClick={() => setShowImportModal(false)}>Cancel</button>
                            <button
                                className="btn btn-primary"
                                onClick={handleImport}
                                disabled={!importDevice || actionLoading === 'import'}
                            >
                                {actionLoading === 'import' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                                Import Groups
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
