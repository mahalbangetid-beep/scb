import { useState, useEffect } from 'react'
import {
    Send,
    Upload,
    Users,
    FileText,
    Image,
    Paperclip,
    Clock,
    Calendar,
    Smartphone,
    CheckCircle,
    XCircle,
    AlertCircle,
    Plus,
    X,
    Eye,
    Trash2,
    Loader2,
    RefreshCw
} from 'lucide-react'
import api from '../services/api'
import { formatDistanceToNow } from 'date-fns'

export default function Broadcast() {
    const [activeTab, setActiveTab] = useState('new')
    const [campaigns, setCampaigns] = useState([])
    const [devices, setDevices] = useState([])
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        deviceId: '',
        message: '',
        recipients: '',
        scheduledAt: null
    })

    const fetchCampaigns = async () => {
        try {
            setRefreshing(true)
            const res = await api.get('/broadcast')
            setCampaigns(res.data || [])
        } catch (error) {
            console.error('Failed to fetch campaigns:', error)
        } finally {
            setLoading(false)
            setRefreshing(false)
        }
    }

    const fetchDevices = async () => {
        try {
            const res = await api.get('/devices')
            setDevices(res.data || [])
        } catch (error) {
            console.error('Failed to fetch devices:', error)
        }
    }

    useEffect(() => {
        fetchCampaigns()
        fetchDevices()
    }, [])

    const handleSendNow = async () => {
        if (!formData.name || !formData.deviceId || !formData.message || !formData.recipients) {
            alert('Please fill in all required fields')
            return
        }

        setSubmitting(true)
        try {
            const recipientList = formData.recipients
                .split('\n')
                .map(r => r.trim())
                .filter(r => r !== '')
                .map(r => ({ phone: r, name: '' }))

            await api.post('/broadcast', {
                name: formData.name,
                deviceId: formData.deviceId,
                message: formData.message,
                recipients: recipientList
            })

            alert('Broadcast campaign created and started!')
            setActiveTab('campaigns')
            fetchCampaigns()
            setFormData({ name: '', deviceId: '', message: '', recipients: '', scheduledAt: null })
        } catch (error) {
            console.error('Failed to start broadcast:', error)
            alert('Failed to start broadcast')
        } finally {
            setSubmitting(false)
        }
    }

    const getStatusBadge = (status) => {
        switch (status) {
            case 'completed':
                return <span className="badge badge-success"><CheckCircle size={12} /> Completed</span>
            case 'pending':
                return <span className="badge badge-info"><Loader2 size={12} className="animate-spin" /> Pending</span>
            case 'scheduled':
                return <span className="badge badge-warning"><Clock size={12} /> Scheduled</span>
            case 'failed':
                return <span className="badge badge-error"><XCircle size={12} /> Failed</span>
            default:
                return <span className="badge badge-neutral">{status}</span>
        }
    }

    if (loading && activeTab === 'campaigns') {
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
                    <h1 className="page-title">Broadcast Messages</h1>
                    <p className="page-subtitle">Send bulk messages to multiple contacts at once</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="tabs" style={{ maxWidth: '500px', marginBottom: 'var(--spacing-xl)' }}>
                <button className={`tab ${activeTab === 'new' ? 'active' : ''}`} onClick={() => setActiveTab('new')}>
                    <Send size={16} /> New Broadcast
                </button>
                <button className={`tab ${activeTab === 'campaigns' ? 'active' : ''}`} onClick={() => setActiveTab('campaigns')}>
                    <FileText size={16} /> Campaigns
                </button>
            </div>

            {activeTab === 'new' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: 'var(--spacing-xl)' }}>
                    <div className="card">
                        <div className="card-header">
                            <div>
                                <h3 className="card-title">Compose Message</h3>
                                <p className="card-subtitle">Create your broadcast message</p>
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Select Device</label>
                            <select
                                className="form-select"
                                value={formData.deviceId}
                                onChange={(e) => setFormData({ ...formData, deviceId: e.target.value })}
                            >
                                <option value="">Choose a device...</option>
                                {devices.map(d => (
                                    <option key={d.id} value={d.id}>{d.name} ({d.phone || 'No phone'})</option>
                                ))}
                            </select>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Campaign Name</label>
                            <input
                                type="text"
                                className="form-input"
                                placeholder="e.g., New Year Promo 2025"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Recipients (one per line)</label>
                            <textarea
                                className="form-textarea"
                                placeholder="+62812345678&#10;+62856789012"
                                value={formData.recipients}
                                onChange={(e) => setFormData({ ...formData, recipients: e.target.value })}
                                rows={4}
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Message</label>
                            <textarea
                                className="form-textarea"
                                placeholder="Type your message here..."
                                value={formData.message}
                                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                                rows={6}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: 'var(--spacing-md)', marginTop: 'var(--spacing-lg)', paddingTop: 'var(--spacing-lg)', borderTop: '1px solid var(--border-color)' }}>
                            <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSendNow} disabled={submitting}>
                                {submitting ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                                Send Now
                            </button>
                        </div>
                    </div>

                    {/* Preview Panel */}
                    <div className="card" style={{ background: 'var(--bg-tertiary)', position: 'sticky', top: 'var(--spacing-xl)', height: 'fit-content' }}>
                        <div className="card-header">
                            <div>
                                <h3 className="card-title">Preview</h3>
                                <p className="card-subtitle">Draft preview</p>
                            </div>
                        </div>
                        <div style={{ background: '#075E54', borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-lg)', minHeight: '200px' }}>
                            <div style={{ background: '#DCF8C6', color: '#000', padding: 'var(--spacing-md)', borderRadius: 'var(--radius-lg)', fontSize: '0.875rem', maxWidth: '90%', marginLeft: 'auto' }}>
                                {formData.message || 'Your message will appear here...'}
                            </div>
                        </div>
                        <div style={{ marginTop: 'var(--spacing-lg)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                                <span>Recipients:</span>
                                <strong>{formData.recipients.split('\n').filter(r => r.trim()).length}</strong>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'campaigns' && (
                <div className="card">
                    <div className="card-header">
                        <div>
                            <h3 className="card-title">Campaign History</h3>
                            <p className="card-subtitle">Manage your broadcasts</p>
                        </div>
                        <button className="btn btn-secondary btn-sm" onClick={fetchCampaigns}>
                            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                        </button>
                    </div>

                    <div className="table-container" style={{ border: 'none' }}>
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Campaign</th>
                                    <th>Status</th>
                                    <th>Date</th>
                                    <th>Device</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {campaigns.length > 0 ? campaigns.map((campaign) => (
                                    <tr key={campaign.id}>
                                        <td style={{ fontWeight: 500 }}>{campaign.name}</td>
                                        <td>{getStatusBadge(campaign.status)}</td>
                                        <td style={{ fontSize: '0.75rem' }}>{formatDistanceToNow(new Date(campaign.createdAt), { addSuffix: true })}</td>
                                        <td>{campaign.device?.name || 'N/A'}</td>
                                        <td>
                                            <button className="btn btn-ghost btn-icon">
                                                <Trash2 size={14} />
                                            </button>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr><td colSpan="5" style={{ textAlign: 'center', padding: 'var(--spacing-xl)' }}>No campaigns found</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    )
}
