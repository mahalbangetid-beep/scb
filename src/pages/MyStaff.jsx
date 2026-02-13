import { useState, useEffect } from 'react'
import {
    Users, Plus, Edit3, Trash2, X, Shield, CheckCircle2,
    Loader2, AlertCircle, Search, Save, UserPlus
} from 'lucide-react'
import api from '../services/api'
import { useTheme } from '../contexts/ThemeContext'

const PERMISSIONS = [
    { key: 'order_view', label: 'View Orders', description: 'Can view all orders' },
    { key: 'order_manage', label: 'Manage Orders', description: 'Can refill/cancel orders' },
    { key: 'payment_view', label: 'View Payments', description: 'Can view payment requests' },
    { key: 'payment_approve', label: 'Approve Payments', description: 'Can approve/reject payments' },
    { key: 'device_manage', label: 'Manage Devices', description: 'Can manage WhatsApp devices' },
    { key: 'panel_manage', label: 'Manage Panels', description: 'Can manage SMM panels' },
    { key: 'reports_view', label: 'View Reports', description: 'Can view system reports' },
    { key: 'support', label: 'Support / Tickets', description: 'Can view and respond to all tickets' },
    { key: 'user_view', label: 'View User Mappings', description: 'Can view user mappings' },
    { key: 'voucher_manage', label: 'Manage Invoices', description: 'Can view invoices' }
]

export default function MyStaff() {
    const { isDark } = useTheme()
    const [staff, setStaff] = useState([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [editingStaff, setEditingStaff] = useState(null)
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        password: '',
        name: '',
        permissions: []
    })
    const [error, setError] = useState(null)
    const [success, setSuccess] = useState(null)
    const [actionLoading, setActionLoading] = useState(false)
    const [searchTerm, setSearchTerm] = useState('')

    useEffect(() => {
        fetchStaff()
    }, [])

    useEffect(() => {
        if (success) {
            const timer = setTimeout(() => setSuccess(null), 4000)
            return () => clearTimeout(timer)
        }
    }, [success])

    useEffect(() => {
        if (error) {
            const timer = setTimeout(() => setError(null), 6000)
            return () => clearTimeout(timer)
        }
    }, [error])

    const fetchStaff = async () => {
        try {
            setLoading(true)
            const res = await api.get('/staff')
            setStaff(res.data || [])
        } catch (err) {
            setError(err.message || 'Failed to fetch staff')
        } finally {
            setLoading(false)
        }
    }

    const openModal = (staffMember = null) => {
        if (staffMember) {
            setEditingStaff(staffMember)
            setFormData({
                username: '',
                email: '',
                password: '',
                name: '',
                permissions: staffMember.staffPermissions?.map(p => p.permission) || []
            })
        } else {
            setEditingStaff(null)
            setFormData({
                username: '',
                email: '',
                password: '',
                name: '',
                permissions: []
            })
        }
        setShowModal(true)
        setError(null)
    }

    const togglePermission = (key) => {
        setFormData(prev => ({
            ...prev,
            permissions: prev.permissions.includes(key)
                ? prev.permissions.filter(p => p !== key)
                : [...prev.permissions, key]
        }))
    }

    const selectAllPermissions = () => {
        setFormData(prev => ({
            ...prev,
            permissions: PERMISSIONS.map(p => p.key)
        }))
    }

    const clearAllPermissions = () => {
        setFormData(prev => ({
            ...prev,
            permissions: []
        }))
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setActionLoading(true)
        setError(null)

        try {
            if (editingStaff) {
                await api.put(`/staff/${editingStaff.id}`, {
                    permissions: formData.permissions
                })
                setSuccess('Staff permissions updated')
            } else {
                if (!formData.username || !formData.email || !formData.password || !formData.name) {
                    throw new Error('All fields are required')
                }
                if (formData.password.length < 6) {
                    throw new Error('Password must be at least 6 characters')
                }
                await api.post('/staff', formData)
                setSuccess('Staff member created successfully')
            }
            setShowModal(false)
            fetchStaff()
        } catch (err) {
            setError(err.error?.message || err.message || 'Failed to save')
        } finally {
            setActionLoading(false)
        }
    }

    const handleRemoveStaff = async (staffId) => {
        if (!confirm('Are you sure you want to remove this staff member?')) return

        try {
            await api.delete(`/staff/${staffId}`)
            setSuccess('Staff member removed')
            fetchStaff()
        } catch (err) {
            setError(err.error?.message || err.message)
        }
    }

    const filteredStaff = staff.filter(s =>
        !searchTerm ||
        s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.email?.toLowerCase().includes(searchTerm.toLowerCase())
    )

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <h1 className="page-title">My Staff</h1>
                    <p className="page-subtitle">Create and manage your staff members</p>
                </div>
                <button className="btn btn-primary" onClick={() => openModal()}>
                    <UserPlus size={16} />
                    <span>Add Staff</span>
                </button>
            </div>

            {/* Alerts */}
            {success && (
                <div className="alert alert-success" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <CheckCircle2 size={16} />
                    {success}
                </div>
            )}
            {error && (
                <div className="alert alert-error" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <AlertCircle size={16} />
                    {error}
                </div>
            )}

            {loading ? (
                <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
                    <Loader2 size={32} className="spin" />
                    <p>Loading staff...</p>
                </div>
            ) : staff.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
                    <Users size={48} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
                    <h3>No Staff Members</h3>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                        Create staff members to help manage your orders, tickets, and more
                    </p>
                    <button className="btn btn-primary" onClick={() => openModal()}>
                        <UserPlus size={16} /> Add Staff Member
                    </button>
                </div>
            ) : (
                <>
                    {/* Search */}
                    <div className="card" style={{ marginBottom: '1rem', padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Search size={16} style={{ color: 'var(--text-secondary)' }} />
                            <input
                                type="text"
                                className="form-input"
                                placeholder="Search staff by name or email..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{ border: 'none', background: 'transparent', flex: 1 }}
                            />
                        </div>
                    </div>

                    {/* Staff Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1rem' }}>
                        {filteredStaff.map(member => (
                            <div key={member.id} className="card" style={{ padding: '1.25rem' }}>
                                {/* Header */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                        <div style={{
                                            width: 40, height: 40, borderRadius: '50%',
                                            background: 'var(--primary)', color: 'white',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontWeight: 600, fontSize: '1rem'
                                        }}>
                                            {member.name?.[0]?.toUpperCase() || '?'}
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 600 }}>{member.name}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                @{member.username} • {member.email}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                                        <button
                                            className="btn btn-ghost btn-icon"
                                            onClick={() => openModal(member)}
                                            title="Edit permissions"
                                        >
                                            <Edit3 size={14} />
                                        </button>
                                        <button
                                            className="btn btn-ghost btn-icon"
                                            onClick={() => handleRemoveStaff(member.id)}
                                            title="Remove staff"
                                            style={{ color: 'var(--danger)' }}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>

                                {/* Status */}
                                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                                    <span className={`badge ${member.isActive ? 'badge-success' : 'badge-warning'}`}>
                                        {member.isActive ? 'Active' : 'Inactive'}
                                    </span>
                                    <span className="badge badge-info">
                                        {member.staffPermissions?.length || 0} permissions
                                    </span>
                                </div>

                                {/* Permissions */}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                                    {!member.staffPermissions || member.staffPermissions.length === 0 ? (
                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>No permissions</span>
                                    ) : (
                                        member.staffPermissions.slice(0, 5).map(p => (
                                            <span key={p.id || p.permission} className="badge" style={{
                                                fontSize: '0.65rem', padding: '0.15rem 0.4rem',
                                                background: 'var(--bg-secondary)', border: '1px solid var(--border-color)'
                                            }}>
                                                {PERMISSIONS.find(pp => pp.key === p.permission)?.label || p.permission}
                                            </span>
                                        ))
                                    )}
                                    {(member.staffPermissions?.length || 0) > 5 && (
                                        <span className="badge" style={{ fontSize: '0.65rem' }}>
                                            +{member.staffPermissions.length - 5} more
                                        </span>
                                    )}
                                </div>

                                {/* Footer */}
                                <div style={{ marginTop: '0.75rem', fontSize: '0.7rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem' }}>
                                    Created {new Date(member.createdAt).toLocaleDateString()}
                                    {member.lastLoginAt && (
                                        <> • Last login {new Date(member.lastLoginAt).toLocaleDateString()}</>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay open" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '550px' }}>
                        <div className="modal-header">
                            <h3>{editingStaff ? 'Edit Staff Permissions' : 'Add Staff Member'}</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit}>
                            <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                                {/* Error */}
                                {error && (
                                    <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
                                        <AlertCircle size={14} /> {error}
                                    </div>
                                )}

                                {/* Account fields - only for new staff */}
                                {!editingStaff && (
                                    <>
                                        <div className="form-group">
                                            <label className="form-label">Full Name *</label>
                                            <input
                                                type="text"
                                                className="form-input"
                                                value={formData.name}
                                                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                                placeholder="e.g., John Doe"
                                                required
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Username *</label>
                                            <input
                                                type="text"
                                                className="form-input"
                                                value={formData.username}
                                                onChange={e => setFormData(prev => ({ ...prev, username: e.target.value }))}
                                                placeholder="e.g., johndoe"
                                                required
                                                minLength={3}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Email *</label>
                                            <input
                                                type="email"
                                                className="form-input"
                                                value={formData.email}
                                                onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                                                placeholder="e.g., john@example.com"
                                                required
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Password *</label>
                                            <input
                                                type="password"
                                                className="form-input"
                                                value={formData.password}
                                                onChange={e => setFormData(prev => ({ ...prev, password: e.target.value }))}
                                                placeholder="Min 6 characters"
                                                required
                                                minLength={6}
                                            />
                                        </div>
                                        <hr style={{ margin: '1rem 0', borderColor: 'var(--border-color)' }} />
                                    </>
                                )}

                                {editingStaff && (
                                    <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                                        <div style={{ fontWeight: 600 }}>{editingStaff.name}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                            @{editingStaff.username} • {editingStaff.email}
                                        </div>
                                    </div>
                                )}

                                {/* Permissions */}
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                        <label className="form-label" style={{ margin: 0 }}>
                                            <Shield size={14} style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} />
                                            Permissions
                                        </label>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <button type="button" className="btn btn-ghost" style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }} onClick={selectAllPermissions}>
                                                Select All
                                            </button>
                                            <button type="button" className="btn btn-ghost" style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }} onClick={clearAllPermissions}>
                                                Clear
                                            </button>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                                        {PERMISSIONS.map(perm => (
                                            <label
                                                key={perm.key}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.5rem',
                                                    padding: '0.5rem 0.75rem',
                                                    borderRadius: '6px',
                                                    cursor: 'pointer',
                                                    background: formData.permissions.includes(perm.key) ? 'var(--primary-light, rgba(59, 130, 246, 0.1))' : 'var(--bg-secondary)',
                                                    border: `1px solid ${formData.permissions.includes(perm.key) ? 'var(--primary)' : 'var(--border-color)'}`,
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={formData.permissions.includes(perm.key)}
                                                    onChange={() => togglePermission(perm.key)}
                                                    style={{ accentColor: 'var(--primary)' }}
                                                />
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontSize: '0.8rem', fontWeight: 500 }}>{perm.label}</div>
                                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{perm.description}</div>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="modal-footer">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={actionLoading}>
                                    {actionLoading ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
                                    {editingStaff ? 'Update Permissions' : 'Create Staff'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
