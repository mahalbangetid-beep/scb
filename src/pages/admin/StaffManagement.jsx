import { useState, useEffect } from 'react'
import {
    Users, Plus, Edit3, Trash2, X, Shield, CheckCircle2,
    Loader2, AlertCircle, Key, Settings
} from 'lucide-react'
import api from '../../services/api'

const PERMISSIONS = [
    { key: 'user_view', label: 'View Users', description: 'Can view user list and details' },
    { key: 'user_edit', label: 'Edit Users', description: 'Can edit user information' },
    { key: 'user_suspend', label: 'Suspend Users', description: 'Can suspend/unsuspend users' },
    { key: 'user_credit', label: 'Adjust Credits', description: 'Can adjust user credit balance' },
    { key: 'order_view', label: 'View Orders', description: 'Can view all orders' },
    { key: 'order_manage', label: 'Manage Orders', description: 'Can refill/cancel orders' },
    { key: 'payment_view', label: 'View Payments', description: 'Can view payment requests' },
    { key: 'payment_approve', label: 'Approve Payments', description: 'Can approve/reject payments' },
    { key: 'voucher_manage', label: 'Manage Vouchers', description: 'Can create and manage vouchers' },
    { key: 'device_manage', label: 'Manage Devices', description: 'Can manage WhatsApp devices' },
    { key: 'panel_manage', label: 'Manage Panels', description: 'Can manage SMM panels' },
    { key: 'reports_view', label: 'View Reports', description: 'Can view system reports' }
]

export default function StaffManagement() {
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
    const [users, setUsers] = useState([])
    const [error, setError] = useState(null)
    const [success, setSuccess] = useState(null)
    const [actionLoading, setActionLoading] = useState(false)

    useEffect(() => {
        fetchStaff()
        fetchUsers()
    }, [])

    const fetchStaff = async () => {
        try {
            setLoading(true)
            const res = await api.get('/admin/staff')
            setStaff(res.data || [])
        } catch (err) {
            setError(err.message || 'Failed to fetch staff')
        } finally {
            setLoading(false)
        }
    }

    const fetchUsers = async () => {
        try {
            const res = await api.get('/admin/users?role=USER&limit=100')
            setUsers(res.data || [])
        } catch (err) {
            console.error('Failed to fetch users:', err)
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
                permissions: staffMember.permissions?.map(p => p.permission) || staffMember.staffPermissions?.map(p => p.permission) || []
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
                await api.put(`/admin/staff/${editingStaff.id}`, {
                    permissions: formData.permissions
                })
                setSuccess('Staff permissions updated')
            } else {
                await api.post('/admin/staff', formData)
                setSuccess('Staff member added')
            }
            setShowModal(false)
            fetchStaff()
        } catch (err) {
            setError(err.error?.message || err.message)
        } finally {
            setActionLoading(false)
        }
    }

    const handleRemoveStaff = async (staffId) => {
        if (!confirm('Are you sure you want to remove this staff member?')) return

        try {
            await api.delete(`/admin/staff/${staffId}`)
            setSuccess('Staff member removed')
            fetchStaff()
        } catch (err) {
            setError(err.error?.message || err.message)
        }
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Staff Management</h1>
                    <p className="page-subtitle">Manage staff members and their permissions</p>
                </div>
                <button className="btn btn-primary" onClick={() => openModal()} style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                    <Plus size={18} style={{ marginTop: 0 }} />
                    <span>Add Staff</span>
                </button>
            </div>

            {error && (
                <div className="alert alert-error">
                    <AlertCircle size={18} />
                    <span>{error}</span>
                    <button onClick={() => setError(null)}><X size={16} /></button>
                </div>
            )}

            {success && (
                <div className="alert alert-success">
                    <CheckCircle2 size={18} />
                    <span>{success}</span>
                    <button onClick={() => setSuccess(null)}><X size={16} /></button>
                </div>
            )}

            {loading ? (
                <div className="loading-container">
                    <Loader2 className="animate-spin" size={32} />
                    <p>Loading staff...</p>
                </div>
            ) : staff.length === 0 ? (
                <div className="empty-state">
                    <Shield size={64} className="text-secondary" />
                    <h3>No Staff Members</h3>
                    <p>Add staff members to help manage your platform</p>
                    <button className="btn btn-primary" onClick={() => openModal()}>
                        <Plus size={18} />
                        Add Staff Member
                    </button>
                </div>
            ) : (
                <div className="staff-grid">
                    {staff.map(member => (
                        <div key={member.id} className="staff-card">
                            <div className="staff-header">
                                <div className="staff-avatar">
                                    {member.name?.[0] || member.username?.[0] || 'S'}
                                </div>
                                <div className="staff-info">
                                    <h3>{member.name || member.username}</h3>
                                    <p>{member.email}</p>
                                </div>
                                <div className="staff-actions">
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => openModal(member)}
                                    >
                                        <Edit3 size={16} />
                                    </button>
                                    <button
                                        className="btn btn-ghost btn-sm text-danger"
                                        onClick={() => handleRemoveStaff(member.id)}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>

                            <div className="staff-permissions">
                                <h4>Permissions ({member.staffPermissions?.length || 0})</h4>
                                <div className="permission-tags">
                                    {!member.staffPermissions || member.staffPermissions.length === 0 ? (
                                        <span className="no-permissions">No permissions assigned</span>
                                    ) : (
                                        member.staffPermissions?.slice(0, 4).map(p => (
                                            <span key={p.permission} className="permission-tag">
                                                {PERMISSIONS.find(perm => perm.key === p.permission)?.label || p.permission}
                                            </span>
                                        ))
                                    )}
                                    {(member.staffPermissions?.length || 0) > 4 && (
                                        <span className="permission-more">
                                            +{member.staffPermissions.length - 4} more
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="staff-footer">
                                <span className="staff-since">
                                    Staff since {new Date(member.createdAt).toLocaleDateString()}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="modal-overlay open" onClick={() => setShowModal(false)}>
                    <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{editingStaff ? 'Edit Staff Permissions' : 'Add Staff Member'}</h2>
                            <button className="modal-close" onClick={() => setShowModal(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                {!editingStaff && (
                                    <>
                                        <div className="form-group">
                                            <label className="form-label">Username *</label>
                                            <input
                                                type="text"
                                                className="form-input"
                                                placeholder="e.g., john_staff"
                                                value={formData.username}
                                                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                                required
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Full Name *</label>
                                            <input
                                                type="text"
                                                className="form-input"
                                                placeholder="e.g., John Doe"
                                                value={formData.name}
                                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                                required
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Email *</label>
                                            <input
                                                type="email"
                                                className="form-input"
                                                placeholder="e.g., john@example.com"
                                                value={formData.email}
                                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                                required
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Password *</label>
                                            <input
                                                type="password"
                                                className="form-input"
                                                placeholder="Create a strong password"
                                                value={formData.password}
                                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                                required
                                            />
                                        </div>
                                    </>
                                )}

                                <div className="form-group">
                                    <div className="permissions-header">
                                        <label className="form-label">Permissions</label>
                                        <div className="permissions-actions">
                                            <button type="button" onClick={selectAllPermissions}>Select All</button>
                                            <button type="button" onClick={clearAllPermissions}>Clear All</button>
                                        </div>
                                    </div>

                                    <div className="permissions-grid">
                                        {PERMISSIONS.map(perm => (
                                            <label key={perm.key} className="permission-checkbox">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.permissions.includes(perm.key)}
                                                    onChange={() => togglePermission(perm.key)}
                                                />
                                                <div className="permission-content">
                                                    <span className="permission-label">{perm.label}</span>
                                                    <span className="permission-desc">{perm.description}</span>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={actionLoading}>
                                    {actionLoading ? (
                                        <Loader2 className="animate-spin" size={18} />
                                    ) : editingStaff ? (
                                        'Update Permissions'
                                    ) : (
                                        'Add Staff Member'
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <style>{`
                .staff-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
                    gap: var(--spacing-lg);
                }

                .staff-card {
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-lg);
                    overflow: hidden;
                }

                .staff-header {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-md);
                    padding: var(--spacing-lg);
                    border-bottom: 1px solid var(--border-color);
                }

                .staff-avatar {
                    width: 48px;
                    height: 48px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #8b5cf6, #7c3aed);
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 600;
                    font-size: 1.25rem;
                }

                .staff-info {
                    flex: 1;
                }

                .staff-info h3 {
                    margin: 0;
                    font-size: 1rem;
                }

                .staff-info p {
                    margin: 0;
                    font-size: 0.875rem;
                    color: var(--text-secondary);
                }

                .staff-actions {
                    display: flex;
                    gap: var(--spacing-xs);
                }

                .staff-permissions {
                    padding: var(--spacing-lg);
                }

                .staff-permissions h4 {
                    margin: 0 0 var(--spacing-sm);
                    font-size: 0.875rem;
                    color: var(--text-secondary);
                }

                .permission-tags {
                    display: flex;
                    flex-wrap: wrap;
                    gap: var(--spacing-xs);
                }

                .permission-tag {
                    padding: 4px 8px;
                    background: rgba(37, 211, 102, 0.1);
                    color: var(--primary-500);
                    border-radius: var(--radius-sm);
                    font-size: 0.75rem;
                }

                .permission-more {
                    padding: 4px 8px;
                    background: var(--bg-tertiary);
                    color: var(--text-secondary);
                    border-radius: var(--radius-sm);
                    font-size: 0.75rem;
                }

                .no-permissions {
                    color: var(--text-secondary);
                    font-size: 0.875rem;
                    font-style: italic;
                }

                .staff-footer {
                    padding: var(--spacing-md) var(--spacing-lg);
                    background: var(--bg-tertiary);
                    border-top: 1px solid var(--border-color);
                }

                .staff-since {
                    font-size: 0.75rem;
                    color: var(--text-secondary);
                }

                .permissions-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: var(--spacing-md);
                }

                .permissions-actions {
                    display: flex;
                    gap: var(--spacing-sm);
                }

                .permissions-actions button {
                    padding: 4px 8px;
                    background: var(--bg-tertiary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-sm);
                    color: var(--text-secondary);
                    font-size: 0.75rem;
                    cursor: pointer;
                }

                .permissions-actions button:hover {
                    border-color: var(--primary-500);
                    color: var(--primary-500);
                }

                .permissions-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: var(--spacing-sm);
                }

                @media (max-width: 640px) {
                    .permissions-grid {
                        grid-template-columns: 1fr;
                    }
                }

                .permission-checkbox {
                    display: flex;
                    align-items: flex-start;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-md);
                    background: var(--bg-tertiary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-md);
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .permission-checkbox:hover {
                    border-color: var(--primary-500);
                }

                .permission-checkbox input[type="checkbox"] {
                    margin-top: 2px;
                    accent-color: var(--primary-500);
                }

                .permission-content {
                    display: flex;
                    flex-direction: column;
                }

                .permission-label {
                    font-weight: 500;
                    font-size: 0.875rem;
                }

                .permission-desc {
                    font-size: 0.75rem;
                    color: var(--text-secondary);
                }

                .modal-lg {
                    max-width: 700px;
                }

                .empty-state {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: var(--spacing-3xl);
                    text-align: center;
                }

                .empty-state h3 {
                    margin-top: var(--spacing-lg);
                    margin-bottom: var(--spacing-sm);
                }

                .empty-state p {
                    color: var(--text-secondary);
                    margin-bottom: var(--spacing-lg);
                }

                .text-secondary {
                    color: var(--text-secondary);
                }

                .text-danger {
                    color: #ef4444 !important;
                }

                .loading-container {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    padding: var(--spacing-3xl);
                    color: var(--text-secondary);
                }

                .alert {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-md);
                    border-radius: var(--radius-md);
                    margin-bottom: var(--spacing-lg);
                }

                .alert-error {
                    background: rgba(239, 68, 68, 0.1);
                    border: 1px solid rgba(239, 68, 68, 0.3);
                    color: #ef4444;
                }

                .alert-success {
                    background: rgba(34, 197, 94, 0.1);
                    border: 1px solid rgba(34, 197, 94, 0.3);
                    color: #22c55e;
                }

                .alert button {
                    margin-left: auto;
                    background: none;
                    border: none;
                    cursor: pointer;
                    color: inherit;
                }
            `}</style>
        </div>
    )
}
