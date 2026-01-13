import { useState, useEffect } from 'react'
import {
    Bot,
    Plus,
    Edit,
    Trash2,
    ToggleLeft,
    ToggleRight,
    MessageSquare,
    Zap,
    Clock,
    Search,
    X,
    ArrowRight,
    AlertCircle,
    Loader2,
    RefreshCw
} from 'lucide-react'
import api from '../services/api'

export default function AutoReply() {
    const [rules, setRules] = useState([])
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [showModal, setShowModal] = useState(false)
    const [editingRule, setEditingRule] = useState(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [devices, setDevices] = useState([])
    const [submitting, setSubmitting] = useState(false)

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        triggerType: 'contains',
        keywords: '',
        response: '',
        isActive: true,
        priority: 1,
        deviceId: ''
    })

    const fetchDevices = async () => {
        try {
            const res = await api.get('/devices')
            setDevices(res.data || [])
        } catch (error) {
            console.error('Failed to fetch devices:', error)
        }
    }

    const fetchRules = async () => {
        try {
            setRefreshing(true)
            const res = await api.get('/auto-reply')
            setRules(res.data || [])
        } catch (error) {
            console.error('Failed to fetch rules:', error)
        } finally {
            setLoading(false)
            setRefreshing(false)
        }
    }

    useEffect(() => {
        fetchDevices()
        fetchRules()
    }, [])

    const handleSaveRule = async () => {
        if (!formData.name || !formData.keywords || !formData.response) return
        setSubmitting(true)
        try {
            const payload = {
                name: formData.name,
                trigger: formData.keywords, // Backend expects 'trigger' field
                triggerType: formData.triggerType,
                response: formData.response,
                deviceId: formData.deviceId === 'all' || formData.deviceId === '' ? null : formData.deviceId,
                priority: parseInt(formData.priority),
                isActive: formData.isActive
            }

            if (editingRule) {
                await api.put(`/auto-reply/${editingRule.id}`, payload)
            } else {
                await api.post('/auto-reply', payload)
            }
            setShowModal(false)
            fetchRules()
        } catch (error) {
            console.error('Failed to save rule:', error)
        } finally {
            setSubmitting(false)
        }
    }

    const handleDeleteRule = async (id) => {
        if (!confirm('Are you sure you want to delete this rule?')) return
        try {
            await api.delete(`/auto-reply/${id}`)
            fetchRules()
        } catch (error) {
            console.error('Failed to delete rule:', error)
        }
    }

    const toggleRuleStatus = async (rule) => {
        try {
            await api.put(`/auto-reply/${rule.id}`, { isActive: !rule.isActive })
            setRules(rules.map(r => r.id === rule.id ? { ...r, isActive: !r.isActive } : r))
        } catch (error) {
            console.error('Failed to toggle rule status:', error)
        }
    }

    const openEditModal = (rule) => {
        setEditingRule(rule)
        setFormData({
            name: rule.name,
            triggerType: rule.triggerType,
            keywords: rule.keywords,
            response: rule.response,
            isActive: rule.isActive,
            priority: rule.priority,
            deviceId: rule.deviceId || 'all'
        })
        setShowModal(true)
    }

    const openNewModal = () => {
        setEditingRule(null)
        setFormData({
            name: '',
            triggerType: 'contains',
            keywords: '',
            response: '',
            isActive: true,
            priority: 1,
            deviceId: 'all'
        })
        setShowModal(true)
    }

    const filteredRules = rules.filter(rule =>
        rule.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        rule.keywords.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const activeCount = rules.filter(r => r.isActive).length

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="animate-spin primary" size={48} />
            </div>
        )
    }

    return (
        <div className="animate-fade-in">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Auto Reply Bot</h1>
                    <p className="page-subtitle">Configure automatic responses for incoming messages</p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--spacing-md)' }}>
                    <button className="btn btn-secondary" onClick={fetchRules}>
                        <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                    </button>
                    <button className="btn btn-primary" onClick={openNewModal}>
                        <Plus size={16} />
                        Add Rule
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                <div className="stat-card">
                    <div className="stat-card-header">
                        <div className="stat-icon primary">
                            <Bot size={24} />
                        </div>
                    </div>
                    <div className="stat-value">{rules.length}</div>
                    <div className="stat-label">Total Rules</div>
                </div>
                <div className="stat-card">
                    <div className="stat-card-header">
                        <div className="stat-icon success">
                            <Zap size={24} />
                        </div>
                    </div>
                    <div className="stat-value">{activeCount}</div>
                    <div className="stat-label">Active Rules</div>
                </div>
                <div className="stat-card">
                    <div className="stat-card-header">
                        <div className="stat-icon info">
                            <MessageSquare size={24} />
                        </div>
                    </div>
                    <div className="stat-value">
                        {rules.reduce((sum, r) => sum + (r.triggerCount || 0), 0).toLocaleString()}
                    </div>
                    <div className="stat-label">Total Triggers</div>
                </div>
                <div className="stat-card">
                    <div className="stat-card-header">
                        <div className="stat-icon warning">
                            <Clock size={24} />
                        </div>
                    </div>
                    <div className="stat-value">&lt;1s</div>
                    <div className="stat-label">Avg Response</div>
                </div>
            </div>

            {/* Search */}
            <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
                <div style={{ display: 'flex', gap: 'var(--spacing-md)', alignItems: 'center' }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                        <Search
                            size={18}
                            style={{
                                position: 'absolute',
                                left: '12px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                color: 'var(--text-muted)'
                            }}
                        />
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Search rules by name or keywords..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ paddingLeft: '44px' }}
                        />
                    </div>
                </div>
            </div>

            {/* Rules List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                {filteredRules.length > 0 ? filteredRules.map((rule) => (
                    <div key={rule.id} className={`card ${!rule.isActive ? 'opacity-60' : ''}`}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-sm)' }}>
                                    <h4 style={{ margin: 0 }}>{rule.name}</h4>
                                    <span className={`badge ${rule.isActive ? 'badge-success' : 'badge-neutral'}`}>
                                        {rule.isActive ? 'Active' : 'Inactive'}
                                    </span>
                                    <span className="badge badge-info">{rule.deviceId ? (devices.find(d => d.id === rule.deviceId)?.name || 'Device Deleted') : 'All Devices'}</span>
                                    <span className="badge badge-neutral" style={{ fontSize: '0.625rem' }}>Priority: {rule.priority}</span>
                                </div>

                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 'var(--spacing-md)',
                                    marginBottom: 'var(--spacing-md)'
                                }}>
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 'var(--spacing-sm)',
                                        padding: 'var(--spacing-sm) var(--spacing-md)',
                                        background: 'var(--bg-tertiary)',
                                        borderRadius: 'var(--radius-md)',
                                        fontSize: '0.75rem'
                                    }}>
                                        <span style={{ color: 'var(--text-muted)' }}>Trigger:</span>
                                        <code style={{
                                            color: 'var(--primary-400)',
                                            fontFamily: 'var(--font-mono)'
                                        }}>
                                            {rule.keywords}
                                        </code>
                                        <span className="badge badge-neutral" style={{ fontSize: '0.625rem' }}>
                                            {rule.triggerType}
                                        </span>
                                    </div>
                                    <ArrowRight size={16} style={{ color: 'var(--text-muted)' }} />
                                    <span style={{
                                        fontSize: '0.75rem',
                                        color: 'var(--text-muted)'
                                    }}>
                                        {(rule.triggerCount || 0).toLocaleString()} triggers
                                    </span>
                                </div>

                                <div style={{
                                    padding: 'var(--spacing-md)',
                                    background: 'var(--bg-tertiary)',
                                    borderRadius: 'var(--radius-md)',
                                    borderLeft: '3px solid var(--primary-500)'
                                }}>
                                    <p style={{
                                        margin: 0,
                                        fontSize: '0.875rem',
                                        color: 'var(--text-secondary)',
                                        whiteSpace: 'pre-wrap'
                                    }}>
                                        {rule.response}
                                    </p>
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', marginLeft: 'var(--spacing-lg)' }}>
                                <button
                                    className="btn btn-ghost btn-icon"
                                    onClick={() => toggleRuleStatus(rule)}
                                    style={{ color: rule.isActive ? 'var(--success)' : 'var(--text-muted)' }}
                                >
                                    {rule.isActive ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                                </button>
                                <button
                                    className="btn btn-ghost btn-icon"
                                    onClick={() => openEditModal(rule)}
                                >
                                    <Edit size={18} />
                                </button>
                                <button className="btn btn-ghost btn-icon" style={{ color: 'var(--error)' }} onClick={() => handleDeleteRule(rule.id)}>
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                    </div>
                )) : (
                    <div className="card" style={{ textAlign: 'center', padding: 'var(--spacing-xl)', color: 'var(--text-muted)' }}>
                        No auto-reply rules found
                    </div>
                )}
            </div>

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="modal-overlay open" onClick={() => setShowModal(false)}>
                    <div className="modal" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">{editingRule ? 'Edit Rule' : 'Add New Rule'}</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label className="form-label">Rule Name</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="e.g., Greeting Response"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-md)' }}>
                                <div className="form-group">
                                    <label className="form-label">Trigger Type</label>
                                    <select
                                        className="form-select"
                                        value={formData.triggerType}
                                        onChange={e => setFormData({ ...formData, triggerType: e.target.value })}
                                    >
                                        <option value="exact">Exact Match</option>
                                        <option value="contains">Contains</option>
                                        <option value="startswith">Starts With</option>
                                        <option value="regex">Regex Pattern</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Apply to Device</label>
                                    <select
                                        className="form-select"
                                        value={formData.deviceId}
                                        onChange={e => setFormData({ ...formData, deviceId: e.target.value })}
                                    >
                                        <option value="all">All Devices</option>
                                        {devices.map(d => (
                                            <option key={d.id} value={d.id}>{d.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Keywords / Trigger</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="e.g., hello, hi, halo"
                                    value={formData.keywords}
                                    onChange={e => setFormData({ ...formData, keywords: e.target.value })}
                                />
                                <p className="form-hint">For 'contains' and 'exact', you can use comma-separated values.</p>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Priority</label>
                                <input
                                    type="number"
                                    className="form-input"
                                    value={formData.priority}
                                    onChange={e => setFormData({ ...formData, priority: e.target.value })}
                                />
                                <p className="form-hint">Higher number means higher priority.</p>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Response Message</label>
                                <textarea
                                    className="form-textarea"
                                    placeholder="Type your automatic response here..."
                                    rows={6}
                                    value={formData.response}
                                    onChange={e => setFormData({ ...formData, response: e.target.value })}
                                />
                            </div>

                            <div style={{
                                padding: 'var(--spacing-md)',
                                background: 'rgba(59, 130, 246, 0.1)',
                                borderRadius: 'var(--radius-md)',
                                display: 'flex',
                                gap: 'var(--spacing-md)'
                            }}>
                                <AlertCircle size={20} style={{ color: 'var(--info)', flexShrink: 0 }} />
                                <p style={{
                                    margin: 0,
                                    fontSize: '0.75rem',
                                    color: 'var(--info)'
                                }}>
                                    Rules are processed in priority order. If multiple rules match, only the first one will trigger.
                                </p>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
                                Cancel
                            </button>
                            <button className="btn btn-primary" onClick={handleSaveRule} disabled={submitting}>
                                {submitting ? <Loader2 className="animate-spin" size={16} /> : null}
                                {editingRule ? 'Save Changes' : 'Create Rule'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
