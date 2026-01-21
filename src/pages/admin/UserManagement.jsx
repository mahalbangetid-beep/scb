import { useState, useEffect } from 'react'
import {
    Users, Search, Filter, MoreVertical, Ban, CheckCircle2,
    DollarSign, Edit3, Trash2, X, Loader2, AlertCircle,
    Mail, Phone, Calendar, Shield, CreditCard, Activity, LogIn
} from 'lucide-react'
import api from '../../services/api'

export default function UserManagement() {
    const [users, setUsers] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState('')
    const [roleFilter, setRoleFilter] = useState('')
    const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 })
    const [selectedUser, setSelectedUser] = useState(null)
    const [showModal, setShowModal] = useState(false)
    const [modalType, setModalType] = useState('')
    const [error, setError] = useState(null)
    const [success, setSuccess] = useState(null)
    const [actionLoading, setActionLoading] = useState(false)
    const [creditAmount, setCreditAmount] = useState('')
    const [creditReason, setCreditReason] = useState('')

    useEffect(() => {
        fetchUsers()
    }, [pagination.page, statusFilter, roleFilter])

    const fetchUsers = async () => {
        try {
            setLoading(true)
            const params = new URLSearchParams({
                page: pagination.page.toString(),
                limit: pagination.limit.toString()
            })
            if (statusFilter) params.append('status', statusFilter)
            if (roleFilter) params.append('role', roleFilter)
            if (searchQuery) params.append('search', searchQuery)

            const res = await api.get(`/admin/users?${params}`)
            setUsers(res.data || [])
            if (res.pagination) {
                setPagination(prev => ({ ...prev, total: res.pagination.total }))
            }
        } catch (err) {
            setError(err.message || 'Failed to fetch users')
        } finally {
            setLoading(false)
        }
    }

    const handleSearch = (e) => {
        e.preventDefault()
        fetchUsers()
    }

    const openModal = (type, user) => {
        setSelectedUser(user)
        setModalType(type)
        setShowModal(true)
        setCreditAmount('')
        setCreditReason('')
        setError(null)
    }

    const handleSuspend = async () => {
        if (!selectedUser) return
        setActionLoading(true)
        try {
            await api.put(`/admin/users/${selectedUser.id}/suspend`)
            setSuccess('User suspended successfully')
            setShowModal(false)
            fetchUsers()
        } catch (err) {
            setError(err.error?.message || err.message)
        } finally {
            setActionLoading(false)
        }
    }

    const handleBan = async () => {
        if (!selectedUser) return
        setActionLoading(true)
        try {
            await api.put(`/admin/users/${selectedUser.id}/ban`)
            setSuccess('User banned successfully')
            setShowModal(false)
            fetchUsers()
        } catch (err) {
            setError(err.error?.message || err.message)
        } finally {
            setActionLoading(false)
        }
    }

    const handleActivate = async () => {
        if (!selectedUser) return
        setActionLoading(true)
        try {
            await api.put(`/admin/users/${selectedUser.id}/activate`)
            setSuccess('User activated successfully')
            setShowModal(false)
            fetchUsers()
        } catch (err) {
            setError(err.error?.message || err.message)
        } finally {
            setActionLoading(false)
        }
    }

    const handleAdjustCredit = async (e) => {
        e.preventDefault()
        if (!selectedUser || !creditAmount) return
        setActionLoading(true)
        try {
            const amount = parseFloat(creditAmount)
            const type = amount >= 0 ? 'CREDIT' : 'DEBIT'
            await api.post(`/admin/users/${selectedUser.id}/adjust-credit`, {
                amount: Math.abs(amount),
                type: type,
                description: creditReason || 'Admin adjustment'
            })
            setSuccess(`Credit ${type === 'CREDIT' ? 'added' : 'deducted'}: $${Math.abs(amount)}`)
            setShowModal(false)
            fetchUsers()
            // Dispatch event to refresh sidebar user data
            window.dispatchEvent(new CustomEvent('user-data-updated'))
        } catch (err) {
            setError(err.error?.message || err.message)
        } finally {
            setActionLoading(false)
        }
    }

    const handleImpersonate = async (user) => {
        if (!user) return
        setActionLoading(true)
        setError(null)
        try {
            const res = await api.post(`/admin/users/${user.id}/impersonate`)
            console.log('[Impersonate] Response:', res)

            // Response structure: { success: true, data: { token, user, impersonatedBy, expiresIn } }
            const data = res.data || res

            if (data && data.token) {
                // Store original admin credentials for returning later
                const currentToken = localStorage.getItem('token')
                const currentUser = localStorage.getItem('user')
                localStorage.setItem('admin_original_token', currentToken)
                localStorage.setItem('admin_original_user', currentUser)

                // Set impersonation data
                localStorage.setItem('token', data.token)
                localStorage.setItem('user', JSON.stringify(data.user))
                localStorage.setItem('impersonation_active', 'true')
                localStorage.setItem('impersonated_by', JSON.stringify(data.impersonatedBy))

                setSuccess(`Logging in as ${user.username}...`)

                // Redirect to dashboard
                setTimeout(() => {
                    window.location.href = '/dashboard'
                }, 500)
            } else {
                setError('Invalid response from server')
                console.error('[Impersonate] No token in response:', res)
            }
        } catch (err) {
            console.error('[Impersonate] Error:', err)
            setError(err.error?.message || err.message || 'Failed to impersonate user')
        } finally {
            setActionLoading(false)
        }
    }


    const getStatusBadge = (status) => {
        const styles = {
            ACTIVE: { bg: 'rgba(34, 197, 94, 0.1)', color: '#22c55e' },
            SUSPENDED: { bg: 'rgba(251, 191, 36, 0.1)', color: '#fbbf24' },
            BANNED: { bg: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }
        }
        const style = styles[status] || styles.ACTIVE
        return (
            <span className="status-badge" style={{ background: style.bg, color: style.color }}>
                {status}
            </span>
        )
    }

    const getRoleBadge = (role) => {
        const styles = {
            MASTER_ADMIN: { bg: 'rgba(168, 85, 247, 0.1)', color: '#a855f7' },
            ADMIN: { bg: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' },
            STAFF: { bg: 'rgba(6, 182, 212, 0.1)', color: '#06b6d4' },
            USER: { bg: 'rgba(107, 114, 128, 0.1)', color: '#6b7280' }
        }
        const style = styles[role] || styles.USER
        return (
            <span className="role-badge" style={{ background: style.bg, color: style.color }}>
                {role}
            </span>
        )
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <h1 className="page-title">User Management</h1>
                    <p className="page-subtitle">Manage platform users and their permissions</p>
                </div>
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

            {/* Filters */}
            <div className="filters-bar">
                <form onSubmit={handleSearch} className="search-form">
                    <Search size={18} />
                    <input
                        type="text"
                        placeholder="Search by name, email, or username..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <button type="submit" className="btn btn-primary btn-sm">Search</button>
                </form>

                <div className="filter-group">
                    <select
                        className="form-select"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                    >
                        <option value="">All Status</option>
                        <option value="ACTIVE">Active</option>
                        <option value="SUSPENDED">Suspended</option>
                        <option value="BANNED">Banned</option>
                    </select>

                    <select
                        className="form-select"
                        value={roleFilter}
                        onChange={(e) => setRoleFilter(e.target.value)}
                    >
                        <option value="">All Roles</option>
                        <option value="USER">User</option>
                        <option value="STAFF">Staff</option>
                        <option value="ADMIN">Admin</option>
                    </select>
                </div>
            </div>

            {/* Users Table */}
            {loading ? (
                <div className="loading-container">
                    <Loader2 className="animate-spin" size={32} />
                    <p>Loading users...</p>
                </div>
            ) : (
                <div className="table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>User</th>
                                <th>Contact</th>
                                <th>Role</th>
                                <th>Status</th>
                                <th>Balance</th>
                                <th>Joined</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="empty-cell">No users found</td>
                                </tr>
                            ) : (
                                users.map(user => (
                                    <tr key={user.id}>
                                        <td>
                                            <div className="user-info">
                                                <div className="user-avatar">
                                                    {user.name?.[0] || user.username?.[0] || 'U'}
                                                </div>
                                                <div>
                                                    <span className="user-name">{user.name || user.username}</span>
                                                    <span className="user-username">@{user.username}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="contact-info">
                                                <span><Mail size={14} /> {user.email}</span>
                                                {user.whatsappNumber && (
                                                    <span><Phone size={14} /> {user.whatsappNumber}</span>
                                                )}
                                            </div>
                                        </td>
                                        <td>{getRoleBadge(user.role)}</td>
                                        <td>{getStatusBadge(user.status)}</td>
                                        <td className="balance-cell">${(user.creditBalance || 0).toFixed(2)}</td>
                                        <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                                        <td>
                                            <div className="action-buttons">
                                                <button
                                                    className="btn btn-ghost btn-sm btn-impersonate"
                                                    onClick={() => handleImpersonate(user)}
                                                    title="Login as this user"
                                                    disabled={user.role === 'MASTER_ADMIN' || actionLoading}
                                                >
                                                    <LogIn size={16} />
                                                </button>
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => openModal('credit', user)}
                                                    title="Adjust Credit"
                                                >
                                                    <DollarSign size={16} />
                                                </button>
                                                {user.status === 'ACTIVE' ? (
                                                    <button
                                                        className="btn btn-ghost btn-sm"
                                                        onClick={() => openModal('suspend', user)}
                                                        title="Suspend"
                                                    >
                                                        <Ban size={16} />
                                                    </button>
                                                ) : (
                                                    <button
                                                        className="btn btn-ghost btn-sm"
                                                        onClick={() => openModal('activate', user)}
                                                        title="Activate"
                                                    >
                                                        <CheckCircle2 size={16} />
                                                    </button>
                                                )}
                                                <button
                                                    className="btn btn-ghost btn-sm text-danger"
                                                    onClick={() => openModal('ban', user)}
                                                    title="Ban"
                                                    disabled={user.status === 'BANNED'}
                                                >
                                                    <Shield size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Pagination */}
            {pagination.total > pagination.limit && (
                <div className="pagination">
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                        disabled={pagination.page === 1}
                    >
                        Previous
                    </button>
                    <span>Page {pagination.page} of {Math.ceil(pagination.total / pagination.limit)}</span>
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                        disabled={pagination.page >= Math.ceil(pagination.total / pagination.limit)}
                    >
                        Next
                    </button>
                </div>
            )}

            {/* Modals */}
            {showModal && (
                <div className="modal-overlay open" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>
                                {modalType === 'credit' && 'Adjust Credit'}
                                {modalType === 'suspend' && 'Suspend User'}
                                {modalType === 'ban' && 'Ban User'}
                                {modalType === 'activate' && 'Activate User'}
                            </h2>
                            <button className="modal-close" onClick={() => setShowModal(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="modal-body">
                            {selectedUser && (
                                <div className="selected-user-info">
                                    <div className="user-avatar large">
                                        {selectedUser.name?.[0] || selectedUser.username?.[0] || 'U'}
                                    </div>
                                    <div>
                                        <h3>{selectedUser.name || selectedUser.username}</h3>
                                        <p>{selectedUser.email}</p>
                                        <p>Current Balance: ${(selectedUser.creditBalance || 0).toFixed(2)}</p>
                                    </div>
                                </div>
                            )}

                            {modalType === 'credit' && (
                                <form onSubmit={handleAdjustCredit}>
                                    <div className="form-group">
                                        <label className="form-label">Amount (use negative for deduction)</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            placeholder="e.g., 50 or -25"
                                            value={creditAmount}
                                            onChange={(e) => setCreditAmount(e.target.value)}
                                            step="0.01"
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Reason</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="Reason for adjustment"
                                            value={creditReason}
                                            onChange={(e) => setCreditReason(e.target.value)}
                                        />
                                    </div>
                                    <div className="modal-actions">
                                        <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                                            Cancel
                                        </button>
                                        <button type="submit" className="btn btn-primary" disabled={actionLoading}>
                                            {actionLoading ? <Loader2 className="animate-spin" size={18} /> : 'Adjust Credit'}
                                        </button>
                                    </div>
                                </form>
                            )}

                            {modalType === 'suspend' && (
                                <div className="confirm-action">
                                    <p>Are you sure you want to suspend this user? They will not be able to log in.</p>
                                    <div className="modal-actions">
                                        <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
                                            Cancel
                                        </button>
                                        <button className="btn btn-warning" onClick={handleSuspend} disabled={actionLoading}>
                                            {actionLoading ? <Loader2 className="animate-spin" size={18} /> : 'Suspend User'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {modalType === 'ban' && (
                                <div className="confirm-action">
                                    <p className="warning-text">
                                        ⚠️ This action is severe. The user will be permanently banned and cannot access the platform.
                                    </p>
                                    <div className="modal-actions">
                                        <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
                                            Cancel
                                        </button>
                                        <button className="btn btn-danger" onClick={handleBan} disabled={actionLoading}>
                                            {actionLoading ? <Loader2 className="animate-spin" size={18} /> : 'Ban User'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {modalType === 'activate' && (
                                <div className="confirm-action">
                                    <p>Activate this user? They will regain access to the platform.</p>
                                    <div className="modal-actions">
                                        <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
                                            Cancel
                                        </button>
                                        <button className="btn btn-success" onClick={handleActivate} disabled={actionLoading}>
                                            {actionLoading ? <Loader2 className="animate-spin" size={18} /> : 'Activate User'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .filters-bar {
                    display: flex;
                    gap: var(--spacing-md);
                    margin-bottom: var(--spacing-lg);
                    flex-wrap: wrap;
                }

                .search-form {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-md);
                    padding: var(--spacing-sm) var(--spacing-md);
                    min-width: 300px;
                }

                .search-form input {
                    flex: 1;
                    border: none;
                    background: none;
                    outline: none;
                    color: var(--text-primary);
                }

                .filter-group {
                    display: flex;
                    gap: var(--spacing-sm);
                }

                .table-container {
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-lg);
                    overflow: hidden;
                }

                .data-table {
                    width: 100%;
                    border-collapse: collapse;
                }

                .data-table th, .data-table td {
                    padding: var(--spacing-md);
                    text-align: left;
                    border-bottom: 1px solid var(--border-color);
                }

                .data-table th {
                    background: var(--bg-tertiary);
                    font-weight: 500;
                    font-size: 0.875rem;
                    color: var(--text-secondary);
                }

                .user-info {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                }

                .user-avatar {
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, var(--primary-500), var(--primary-600));
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 600;
                }

                .user-avatar.large {
                    width: 60px;
                    height: 60px;
                    font-size: 1.5rem;
                }

                .user-name {
                    font-weight: 500;
                    display: block;
                }

                .user-username {
                    color: var(--text-secondary);
                    font-size: 0.875rem;
                }

                .contact-info {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                    font-size: 0.875rem;
                }

                .contact-info span {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-xs);
                    color: var(--text-secondary);
                }

                .status-badge, .role-badge {
                    padding: 4px 10px;
                    border-radius: var(--radius-md);
                    font-size: 0.75rem;
                    font-weight: 500;
                }

                .balance-cell {
                    font-weight: 600;
                    color: var(--primary-500);
                }

                .action-buttons {
                    display: flex;
                    gap: var(--spacing-xs);
                }

                .text-danger {
                    color: #ef4444 !important;
                }

                .empty-cell {
                    text-align: center;
                    color: var(--text-secondary);
                    padding: var(--spacing-xl) !important;
                }

                .pagination {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: var(--spacing-md);
                    margin-top: var(--spacing-lg);
                }

                .selected-user-info {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-md);
                    padding: var(--spacing-md);
                    background: var(--bg-tertiary);
                    border-radius: var(--radius-md);
                    margin-bottom: var(--spacing-lg);
                }

                .selected-user-info h3 {
                    margin: 0;
                    font-size: 1rem;
                }

                .selected-user-info p {
                    margin: 0;
                    font-size: 0.875rem;
                    color: var(--text-secondary);
                }

                .modal-actions {
                    display: flex;
                    justify-content: flex-end;
                    gap: var(--spacing-sm);
                    margin-top: var(--spacing-lg);
                }

                .confirm-action p {
                    margin-bottom: var(--spacing-lg);
                }

                .warning-text {
                    color: #ef4444;
                    background: rgba(239, 68, 68, 0.1);
                    padding: var(--spacing-md);
                    border-radius: var(--radius-md);
                }

                .btn-warning {
                    background: #fbbf24;
                    color: #000;
                }

                .btn-warning:hover {
                    background: #f59e0b;
                }

                .btn-danger {
                    background: #ef4444;
                    color: white;
                }

                .btn-danger:hover {
                    background: #dc2626;
                }

                .btn-success {
                    background: #22c55e;
                    color: white;
                }

                .btn-success:hover {
                    background: #16a34a;
                }

                .btn-impersonate {
                    color: #3b82f6 !important;
                }

                .btn-impersonate:hover {
                    background: rgba(59, 130, 246, 0.1);
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
