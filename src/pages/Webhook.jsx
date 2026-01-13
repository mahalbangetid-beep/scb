import { useState, useEffect } from 'react'
import {
    Webhook as WebhookIcon,
    Plus,
    Edit,
    Trash2,
    Copy,
    ExternalLink,
    CheckCircle,
    XCircle,
    RefreshCw,
    Eye,
    EyeOff,
    Code,
    Zap,
    Clock,
    X,
    AlertCircle,
    Activity,
    Loader2
} from 'lucide-react'
import api from '../services/api'
import { formatDistanceToNow } from 'date-fns'

const eventTypesList = [
    { value: 'message.received', label: 'Message Received', description: 'When an incoming message is received' },
    { value: 'message.sent', label: 'Message Sent', description: 'When a message is successfully sent' },
    { value: 'message.delivered', label: 'Message Delivered', description: 'When a message is delivered to recipient' },
    { value: 'message.read', label: 'Message Read', description: 'When a message is read by recipient' },
    { value: 'message.failed', label: 'Message Failed', description: 'When a message fails to send' },
    { value: 'contact.new', label: 'New Contact', description: 'When a new contact messages for the first time' },
    { value: 'device.connected', label: 'Device Connected', description: 'When a device connects successfully' },
    { value: 'device.disconnected', label: 'Device Disconnected', description: 'When a device loses connection' },
]

export default function Webhook() {
    const [webhooks, setWebhooks] = useState([])
    const [logs, setLogs] = useState([])
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [showModal, setShowModal] = useState(false)
    const [editingWebhook, setEditingWebhook] = useState(null)
    const [activeTab, setActiveTab] = useState('webhooks')
    const [showSecret, setShowSecret] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        url: '',
        secret: '',
        events: [],
        isActive: true
    })

    const fetchWebhooks = async () => {
        try {
            setRefreshing(true)
            const res = await api.get('/webhooks')
            setWebhooks(res.data || [])
        } catch (error) {
            console.error('Failed to fetch webhooks:', error)
        } finally {
            setLoading(false)
            setRefreshing(false)
        }
    }

    const fetchLogs = async () => {
        try {
            const res = await api.get('/webhooks/logs')
            setLogs(res.data || [])
        } catch (error) {
            console.error('Failed to fetch logs:', error)
        }
    }

    useEffect(() => {
        fetchWebhooks()
        fetchLogs()
    }, [])

    const handleSaveWebhook = async () => {
        if (!formData.name || !formData.url || formData.events.length === 0) return
        setSubmitting(true)
        try {
            if (editingWebhook) {
                await api.put(`/webhooks/${editingWebhook.id}`, formData)
            } else {
                await api.post('/webhooks', formData)
            }
            setShowModal(false)
            fetchWebhooks()
        } catch (error) {
            console.error('Failed to save webhook:', error)
        } finally {
            setSubmitting(false)
        }
    }

    const handleDeleteWebhook = async (id) => {
        if (!confirm('Are you sure?')) return
        try {
            await api.delete(`/webhooks/${id}`)
            fetchWebhooks()
        } catch (error) {
            console.error('Failed to delete webhook:', error)
        }
    }

    const toggleWebhookStatus = async (webhook) => {
        try {
            await api.put(`/webhooks/${webhook.id}`, { isActive: !webhook.isActive })
            setWebhooks(webhooks.map(w => w.id === webhook.id ? { ...w, isActive: !w.isActive } : w))
        } catch (error) {
            console.error('Failed to toggle status:', error)
        }
    }

    const handleEventToggle = (eventValue) => {
        setFormData(prev => {
            const newEvents = prev.events.includes(eventValue)
                ? prev.events.filter(e => e !== eventValue)
                : [...prev.events, eventValue]
            return { ...prev, events: newEvents }
        })
    }

    const openEditModal = (webhook) => {
        setEditingWebhook(webhook)
        setFormData({
            name: webhook.name,
            url: webhook.url,
            secret: webhook.secret || '',
            events: webhook.events || [],
            isActive: webhook.isActive
        })
        setShowModal(true)
    }

    const openNewModal = () => {
        setEditingWebhook(null)
        setFormData({
            name: '',
            url: '',
            secret: '',
            events: [],
            isActive: true
        })
        setShowModal(true)
    }

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
                    <h1 className="page-title">Webhooks</h1>
                    <p className="page-subtitle">Configure webhook endpoints for real-time event notifications</p>
                </div>
                <button className="btn btn-primary" onClick={openNewModal}>
                    <Plus size={16} />
                    Add Webhook
                </button>
            </div>

            {/* Stats */}
            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                <div className="stat-card">
                    <div className="stat-card-header">
                        <div className="stat-icon primary">
                            <WebhookIcon size={24} />
                        </div>
                    </div>
                    <div className="stat-value">{webhooks.length}</div>
                    <div className="stat-label">Total Webhooks</div>
                </div>
                <div className="stat-card">
                    <div className="stat-card-header">
                        <div className="stat-icon success">
                            <Zap size={24} />
                        </div>
                    </div>
                    <div className="stat-value">{webhooks.filter(w => w.isActive).length}</div>
                    <div className="stat-label">Active</div>
                </div>
                <div className="stat-card">
                    <div className="stat-card-header">
                        <div className="stat-icon info">
                            <Activity size={24} />
                        </div>
                    </div>
                    <div className="stat-value">{logs.length.toLocaleString()}</div>
                    <div className="stat-label">Recent Calls</div>
                </div>
                <div className="stat-card">
                    <div className="stat-card-header">
                        <div className="stat-icon warning">
                            <CheckCircle size={24} />
                        </div>
                    </div>
                    <div className="stat-value">{(webhooks.reduce((acc, w) => acc + (w.successRate || 0), 0) / (webhooks.length || 1)).toFixed(1)}%</div>
                    <div className="stat-label">Avg. Success</div>
                </div>
            </div>

            {/* Tabs */}
            <div className="tabs" style={{ maxWidth: '400px', marginBottom: 'var(--spacing-xl)' }}>
                <button className={`tab ${activeTab === 'webhooks' ? 'active' : ''}`} onClick={() => setActiveTab('webhooks')}>
                    <WebhookIcon size={16} /> Webhooks
                </button>
                <button className={`tab ${activeTab === 'logs' ? 'active' : ''}`} onClick={() => setActiveTab('logs')}>
                    <Clock size={16} /> Logs
                </button>
            </div>

            {activeTab === 'webhooks' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                    {webhooks.length > 0 ? webhooks.map((webhook) => (
                        <div key={webhook.id} className="card">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-sm)' }}>
                                        <h4 style={{ margin: 0 }}>{webhook.name}</h4>
                                        <span className={`badge ${webhook.isActive ? 'badge-success' : 'badge-neutral'}`}>
                                            <span className={`status-dot ${webhook.isActive ? 'online' : 'offline'}`}></span>
                                            {webhook.isActive ? 'Active' : 'Inactive'}
                                        </span>
                                    </div>

                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', padding: 'var(--spacing-sm) var(--spacing-md)',
                                        background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--spacing-md)', maxWidth: 'fit-content'
                                    }}>
                                        <Code size={14} style={{ color: 'var(--text-muted)' }} />
                                        <code style={{ fontSize: '0.75rem', color: 'var(--primary-400)', fontFamily: 'var(--font-mono)' }}>{webhook.url}</code>
                                    </div>

                                    <div style={{ display: 'flex', gap: 'var(--spacing-sm)', flexWrap: 'wrap', marginBottom: 'var(--spacing-md)' }}>
                                        {webhook.events?.map((event, idx) => (
                                            <span key={idx} className="badge badge-info" style={{ fontSize: '0.625rem' }}>{event}</span>
                                        ))}
                                    </div>

                                    <div style={{ display: 'flex', gap: 'var(--spacing-xl)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        <span>Last triggered: <strong style={{ color: 'var(--text-secondary)' }}>{webhook.lastTriggered ? formatDistanceToNow(new Date(webhook.lastTriggered), { addSuffix: true }) : 'Never'}</strong></span>
                                        <span>Total calls: <strong style={{ color: 'var(--text-secondary)' }}>{webhook._count?.logs || 0}</strong></span>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                                    <button className="btn btn-ghost btn-icon" onClick={() => openEditModal(webhook)}><Edit size={18} /></button>
                                    <button className="btn btn-ghost btn-icon" style={{ color: 'var(--error)' }} onClick={() => handleDeleteWebhook(webhook.id)}><Trash2 size={18} /></button>
                                </div>
                            </div>
                        </div>
                    )) : (
                        <div className="card" style={{ textAlign: 'center', padding: 'var(--spacing-xl)', color: 'var(--text-muted)' }}>
                            No webhooks configured
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'logs' && (
                <div className="card">
                    <div className="card-header">
                        <div>
                            <h3 className="card-title">Webhook Logs</h3>
                            <p className="card-subtitle">Recent webhook calls and their responses</p>
                        </div>
                        <button className="btn btn-secondary btn-sm" onClick={fetchLogs}>
                            <RefreshCw size={14} /> Refresh
                        </button>
                    </div>
                    <div className="table-container" style={{ border: 'none' }}>
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Webhook</th>
                                    <th>Event</th>
                                    <th>Status</th>
                                    <th>Response</th>
                                    <th>Time</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.length > 0 ? logs.map((log) => (
                                    <tr key={log.id}>
                                        <td style={{ fontWeight: 500 }}>{log.webhook?.name}</td>
                                        <td><span className="badge badge-info" style={{ fontSize: '0.625rem' }}>{log.event}</span></td>
                                        <td>
                                            <span className={`badge ${log.statusCode >= 200 && log.statusCode < 300 ? 'badge-success' : 'badge-error'}`}>
                                                {log.statusCode >= 200 && log.statusCode < 300 ? <CheckCircle size={12} /> : <XCircle size={12} />}
                                                {log.statusCode >= 200 && log.statusCode < 300 ? 'success' : 'failed'}
                                            </span>
                                        </td>
                                        <td><code style={{ fontSize: '0.75rem' }}>{log.statusCode}</code></td>
                                        <td style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}</td>
                                    </tr>
                                )) : (
                                    <tr><td colSpan="5" style={{ textAlign: 'center', padding: 'var(--spacing-xl)' }}>No logs found</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay open" onClick={() => setShowModal(false)}>
                    <div className="modal" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">{editingWebhook ? 'Edit Webhook' : 'Add New Webhook'}</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label className="form-label">Webhook Name</label>
                                <input type="text" className="form-input" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Endpoint URL</label>
                                <input type="url" className="form-input" value={formData.url} onChange={e => setFormData({ ...formData, url: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Secret Key (Optional)</label>
                                <input type="text" className="form-input" value={formData.secret} onChange={e => setFormData({ ...formData, secret: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Events to Subscribe</label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--spacing-sm)', marginTop: 'var(--spacing-sm)' }}>
                                    {eventTypesList.map((event) => (
                                        <label key={event.value} style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--spacing-sm)', padding: 'var(--spacing-sm) var(--spacing-md)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
                                            <input type="checkbox" checked={formData.events.includes(event.value)} onChange={() => handleEventToggle(event.value)} />
                                            <div>
                                                <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{event.label}</div>
                                                <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)' }}>{event.description}</div>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleSaveWebhook} disabled={submitting}>
                                {submitting ? <Loader2 className="animate-spin" size={16} /> : null}
                                {editingWebhook ? 'Save Changes' : 'Create Webhook'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
