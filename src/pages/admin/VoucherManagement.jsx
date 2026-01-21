import { useState, useEffect } from 'react'
import {
    Gift, Plus, Edit3, Trash2, X, Copy, CheckCircle2,
    Loader2, AlertCircle, Calendar, Users
} from 'lucide-react'
import api from '../../services/api'

export default function VoucherManagement() {
    const [vouchers, setVouchers] = useState([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [showGenerateModal, setShowGenerateModal] = useState(false)
    const [editingVoucher, setEditingVoucher] = useState(null)
    const [error, setError] = useState(null)
    const [success, setSuccess] = useState(null)
    const [actionLoading, setActionLoading] = useState(false)
    const [copiedCode, setCopiedCode] = useState(null)

    const [formData, setFormData] = useState({
        code: '',
        amount: '',
        maxUsage: '',
        expiresAt: '',
        singleUsePerUser: true
    })

    const [generateData, setGenerateData] = useState({
        prefix: 'VOUCHER',
        amount: '',
        count: 10,
        maxUsagePerVoucher: 1,
        expiresAt: '',
        singleUsePerUser: true
    })

    const [generatedVouchers, setGeneratedVouchers] = useState([])

    useEffect(() => {
        fetchVouchers()
    }, [])

    const fetchVouchers = async () => {
        try {
            setLoading(true)
            const res = await api.get('/wallet/admin/vouchers')
            setVouchers(res.data || [])
        } catch (err) {
            setError(err.message || 'Failed to fetch vouchers')
        } finally {
            setLoading(false)
        }
    }

    const openModal = (voucher = null) => {
        if (voucher) {
            setEditingVoucher(voucher)
            setFormData({
                code: voucher.code,
                amount: voucher.amount,
                maxUsage: voucher.maxUsage || '',
                expiresAt: voucher.expiresAt ? new Date(voucher.expiresAt).toISOString().split('T')[0] : '',
                singleUsePerUser: voucher.singleUsePerUser
            })
        } else {
            setEditingVoucher(null)
            setFormData({
                code: '',
                amount: '',
                maxUsage: '',
                expiresAt: '',
                singleUsePerUser: true
            })
        }
        setShowModal(true)
        setError(null)
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setActionLoading(true)
        setError(null)

        try {
            const data = {
                ...formData,
                amount: parseFloat(formData.amount),
                maxUsage: formData.maxUsage ? parseInt(formData.maxUsage) : null,
                expiresAt: formData.expiresAt || null
            }

            if (editingVoucher) {
                await api.put(`/wallet/admin/vouchers/${editingVoucher.id}`, data)
                setSuccess('Voucher updated')
            } else {
                await api.post('/wallet/admin/vouchers', data)
                setSuccess('Voucher created')
            }
            setShowModal(false)
            fetchVouchers()
        } catch (err) {
            setError(err.error?.message || err.message)
        } finally {
            setActionLoading(false)
        }
    }

    const handleGenerate = async (e) => {
        e.preventDefault()
        setActionLoading(true)
        setError(null)

        try {
            const res = await api.post('/wallet/admin/vouchers/generate', {
                ...generateData,
                amount: parseFloat(generateData.amount),
                maxUsagePerVoucher: parseInt(generateData.maxUsagePerVoucher),
                count: parseInt(generateData.count),
                expiresAt: generateData.expiresAt || null
            })
            setGeneratedVouchers(res.vouchers || [])
            setSuccess(`Generated ${res.count} vouchers`)
            fetchVouchers()
        } catch (err) {
            setError(err.error?.message || err.message)
        } finally {
            setActionLoading(false)
        }
    }

    const handleDelete = async (voucherId) => {
        if (!confirm('Are you sure you want to delete this voucher?')) return

        try {
            await api.delete(`/wallet/admin/vouchers/${voucherId}`)
            setSuccess('Voucher deleted')
            fetchVouchers()
        } catch (err) {
            setError(err.error?.message || err.message)
        }
    }

    const handleToggleActive = async (voucher) => {
        try {
            await api.put(`/wallet/admin/vouchers/${voucher.id}`, {
                isActive: !voucher.isActive
            })
            fetchVouchers()
        } catch (err) {
            setError(err.error?.message || err.message)
        }
    }

    const copyCode = (code) => {
        navigator.clipboard.writeText(code)
        setCopiedCode(code)
        setTimeout(() => setCopiedCode(null), 2000)
    }

    const copyAllCodes = () => {
        const codes = generatedVouchers.map(v => v.code).join('\n')
        navigator.clipboard.writeText(codes)
        setSuccess('All codes copied to clipboard')
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Voucher Management</h1>
                    <p className="page-subtitle">Create and manage discount vouchers</p>
                </div>
                <div className="header-actions">
                    <button className="btn btn-secondary" onClick={() => setShowGenerateModal(true)}>
                        <Gift size={18} />
                        Bulk Generate
                    </button>
                    <button className="btn btn-primary" onClick={() => openModal()}>
                        <Plus size={18} />
                        Create Voucher
                    </button>
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

            {loading ? (
                <div className="loading-container">
                    <Loader2 className="animate-spin" size={32} />
                    <p>Loading vouchers...</p>
                </div>
            ) : vouchers.length === 0 ? (
                <div className="empty-state">
                    <Gift size={64} className="text-secondary" />
                    <h3>No Vouchers</h3>
                    <p>Create vouchers for your users to redeem</p>
                    <button className="btn btn-primary" onClick={() => openModal()}>
                        <Plus size={18} />
                        Create First Voucher
                    </button>
                </div>
            ) : (
                <div className="vouchers-grid">
                    {vouchers.map(voucher => (
                        <div key={voucher.id} className={`voucher-card ${!voucher.isActive ? 'inactive' : ''}`}>
                            <div className="voucher-header">
                                <div className="voucher-code" onClick={() => copyCode(voucher.code)}>
                                    <span>{voucher.code}</span>
                                    {copiedCode === voucher.code ? (
                                        <CheckCircle2 size={16} className="text-success" />
                                    ) : (
                                        <Copy size={16} />
                                    )}
                                </div>
                                <div className="voucher-actions">
                                    <button className="btn btn-ghost btn-sm" onClick={() => openModal(voucher)}>
                                        <Edit3 size={16} />
                                    </button>
                                    <button className="btn btn-ghost btn-sm text-danger" onClick={() => handleDelete(voucher.id)}>
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>

                            <div className="voucher-amount">
                                ${voucher.amount.toFixed(2)}
                            </div>

                            <div className="voucher-stats">
                                <div className="stat">
                                    <Users size={14} />
                                    <span>{voucher.usageCount}/{voucher.maxUsage || '∞'} used</span>
                                </div>
                                {voucher.expiresAt && (
                                    <div className="stat">
                                        <Calendar size={14} />
                                        <span>Expires {new Date(voucher.expiresAt).toLocaleDateString()}</span>
                                    </div>
                                )}
                            </div>

                            <div className="voucher-footer">
                                <label className="toggle-small">
                                    <input
                                        type="checkbox"
                                        checked={voucher.isActive}
                                        onChange={() => handleToggleActive(voucher)}
                                    />
                                    <span>{voucher.isActive ? 'Active' : 'Inactive'}</span>
                                </label>
                                {voucher.singleUsePerUser && (
                                    <span className="badge">Single Use</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Create/Edit Modal */}
            {showModal && (
                <div className="modal-overlay open" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{editingVoucher ? 'Edit Voucher' : 'Create Voucher'}</h2>
                            <button className="modal-close" onClick={() => setShowModal(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Voucher Code</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.code}
                                        onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                                        placeholder="e.g., WELCOME50"
                                        required
                                        disabled={editingVoucher}
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Amount ($)</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={formData.amount}
                                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                                        placeholder="10.00"
                                        step="0.01"
                                        min="0.01"
                                        required
                                    />
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Max Usage (optional)</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            value={formData.maxUsage}
                                            onChange={(e) => setFormData({ ...formData, maxUsage: e.target.value })}
                                            placeholder="Unlimited"
                                            min="1"
                                        />
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label">Expires At (optional)</label>
                                        <input
                                            type="date"
                                            className="form-input"
                                            value={formData.expiresAt}
                                            onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <label className="checkbox-label">
                                    <input
                                        type="checkbox"
                                        checked={formData.singleUsePerUser}
                                        onChange={(e) => setFormData({ ...formData, singleUsePerUser: e.target.checked })}
                                    />
                                    <span>Single use per user</span>
                                </label>
                            </div>

                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={actionLoading}>
                                    {actionLoading ? <Loader2 className="animate-spin" size={18} /> : editingVoucher ? 'Update' : 'Create'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Bulk Generate Modal */}
            {showGenerateModal && (
                <div className="modal-overlay open" onClick={() => { setShowGenerateModal(false); setGeneratedVouchers([]) }}>
                    <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Bulk Generate Vouchers</h2>
                            <button className="modal-close" onClick={() => { setShowGenerateModal(false); setGeneratedVouchers([]) }}>
                                <X size={20} />
                            </button>
                        </div>

                        {generatedVouchers.length > 0 ? (
                            <div className="modal-body">
                                <div className="generated-header">
                                    <h3>{generatedVouchers.length} Vouchers Generated</h3>
                                    <button className="btn btn-secondary btn-sm" onClick={copyAllCodes}>
                                        <Copy size={16} />
                                        Copy All
                                    </button>
                                </div>
                                <div className="generated-list">
                                    {generatedVouchers.map(v => (
                                        <div key={v.code} className="generated-item" onClick={() => copyCode(v.code)}>
                                            <span className="code">{v.code}</span>
                                            <span className="amount">${v.amount}</span>
                                            {copiedCode === v.code && <CheckCircle2 size={16} className="text-success" />}
                                        </div>
                                    ))}
                                </div>
                                <div className="modal-footer">
                                    <button className="btn btn-primary" onClick={() => { setShowGenerateModal(false); setGeneratedVouchers([]) }}>
                                        Done
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <form onSubmit={handleGenerate}>
                                <div className="modal-body">
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label className="form-label">Prefix</label>
                                            <input
                                                type="text"
                                                className="form-input"
                                                value={generateData.prefix}
                                                onChange={(e) => setGenerateData({ ...generateData, prefix: e.target.value.toUpperCase() })}
                                                placeholder="VOUCHER"
                                            />
                                        </div>

                                        <div className="form-group">
                                            <label className="form-label">Count</label>
                                            <input
                                                type="number"
                                                className="form-input"
                                                value={generateData.count}
                                                onChange={(e) => setGenerateData({ ...generateData, count: e.target.value })}
                                                min="1"
                                                max="100"
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div className="form-row">
                                        <div className="form-group">
                                            <label className="form-label">Amount ($)</label>
                                            <input
                                                type="number"
                                                className="form-input"
                                                value={generateData.amount}
                                                onChange={(e) => setGenerateData({ ...generateData, amount: e.target.value })}
                                                step="0.01"
                                                min="0.01"
                                                required
                                            />
                                        </div>

                                        <div className="form-group">
                                            <label className="form-label">Max Usage Per Voucher</label>
                                            <input
                                                type="number"
                                                className="form-input"
                                                value={generateData.maxUsagePerVoucher}
                                                onChange={(e) => setGenerateData({ ...generateData, maxUsagePerVoucher: e.target.value })}
                                                min="1"
                                            />
                                        </div>
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label">Expires At (optional)</label>
                                        <input
                                            type="date"
                                            className="form-input"
                                            value={generateData.expiresAt}
                                            onChange={(e) => setGenerateData({ ...generateData, expiresAt: e.target.value })}
                                        />
                                    </div>

                                    <label className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={generateData.singleUsePerUser}
                                            onChange={(e) => setGenerateData({ ...generateData, singleUsePerUser: e.target.checked })}
                                        />
                                        <span>Single use per user</span>
                                    </label>
                                </div>

                                <div className="modal-footer">
                                    <button type="button" className="btn btn-secondary" onClick={() => setShowGenerateModal(false)}>
                                        Cancel
                                    </button>
                                    <button type="submit" className="btn btn-primary" disabled={actionLoading}>
                                        {actionLoading ? <Loader2 className="animate-spin" size={18} /> : `Generate ${generateData.count} Vouchers`}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}

            <style>{`
                .header-actions {
                    display: flex;
                    gap: var(--spacing-sm);
                }

                .vouchers-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
                    gap: var(--spacing-lg);
                }

                .voucher-card {
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-lg);
                    padding: var(--spacing-lg);
                }

                .voucher-card.inactive {
                    opacity: 0.6;
                }

                .voucher-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: var(--spacing-md);
                }

                .voucher-code {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-sm) var(--spacing-md);
                    background: var(--bg-tertiary);
                    border-radius: var(--radius-md);
                    font-family: monospace;
                    font-weight: 600;
                    cursor: pointer;
                }

                .voucher-code:hover {
                    background: var(--border-color);
                }

                .voucher-actions {
                    display: flex;
                    gap: var(--spacing-xs);
                }

                .voucher-amount {
                    font-size: 2rem;
                    font-weight: 700;
                    color: var(--primary-500);
                    margin-bottom: var(--spacing-md);
                }

                .voucher-stats {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-xs);
                    margin-bottom: var(--spacing-md);
                }

                .voucher-stats .stat {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-xs);
                    font-size: 0.875rem;
                    color: var(--text-secondary);
                }

                .voucher-footer {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding-top: var(--spacing-md);
                    border-top: 1px solid var(--border-color);
                }

                .toggle-small {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    cursor: pointer;
                    font-size: 0.875rem;
                }

                .toggle-small input {
                    accent-color: var(--primary-500);
                }

                .badge {
                    padding: 2px 8px;
                    background: rgba(37, 211, 102, 0.1);
                    color: var(--primary-500);
                    border-radius: var(--radius-sm);
                    font-size: 0.75rem;
                }

                .form-row {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: var(--spacing-md);
                }

                .checkbox-label {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    cursor: pointer;
                    margin-top: var(--spacing-md);
                }

                .checkbox-label input {
                    accent-color: var(--primary-500);
                }

                .modal-lg {
                    max-width: 600px;
                }

                .generated-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: var(--spacing-md);
                }

                .generated-list {
                    max-height: 300px;
                    overflow-y: auto;
                    background: var(--bg-tertiary);
                    border-radius: var(--radius-md);
                }

                .generated-item {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-md);
                    padding: var(--spacing-sm) var(--spacing-md);
                    border-bottom: 1px solid var(--border-color);
                    cursor: pointer;
                }

                .generated-item:hover {
                    background: var(--border-color);
                }

                .generated-item:last-child {
                    border-bottom: none;
                }

                .generated-item .code {
                    flex: 1;
                    font-family: monospace;
                    font-weight: 600;
                }

                .generated-item .amount {
                    color: var(--primary-500);
                    font-weight: 600;
                }

                .text-success { color: #22c55e; }
                .text-danger { color: #ef4444; }
                .text-secondary { color: var(--text-secondary); }

                .empty-state {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
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
