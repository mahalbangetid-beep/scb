import { useState, useEffect, useRef } from 'react'
import {
    Send,
    Upload,
    FileText,
    Image,
    Clock,
    Calendar,
    CheckCircle,
    XCircle,
    X,
    Loader2,
    RefreshCw,
    Info
} from 'lucide-react'
import api from '../services/api'
import { formatDistanceToNow, format } from 'date-fns'

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
        mediaFile: null,
        mediaPreview: null,
        scheduleEnabled: false,
        scheduledAt: ''
    })

    const fileInputRef = useRef(null)

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

    const handleFileChange = (e) => {
        const file = e.target.files[0]
        if (!file) return

        // Validate file type (images only for now)
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
        if (!allowedTypes.includes(file.type)) {
            alert('Only image files (JPEG, PNG, GIF, WebP) are supported')
            return
        }

        // Max 5MB
        if (file.size > 5 * 1024 * 1024) {
            alert('File size must be less than 5MB')
            return
        }

        const reader = new FileReader()
        reader.onloadend = () => {
            setFormData(prev => ({
                ...prev,
                mediaFile: file,
                mediaPreview: reader.result
            }))
        }
        reader.readAsDataURL(file)
    }

    const removeMedia = () => {
        setFormData(prev => ({
            ...prev,
            mediaFile: null,
            mediaPreview: null
        }))
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
    }

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

            const scheduledAt = formData.scheduleEnabled && formData.scheduledAt
                ? new Date(formData.scheduledAt).toISOString()
                : undefined

            if (formData.mediaFile) {
                // Use multipart FormData when there's a file
                const payload = new FormData()
                payload.append('name', formData.name)
                payload.append('deviceId', formData.deviceId)
                payload.append('message', formData.message)
                recipientList.forEach(r => payload.append('recipients[]', r))
                payload.append('media', formData.mediaFile)
                if (scheduledAt) payload.append('scheduledAt', scheduledAt)

                await api.post('/broadcast', payload, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                })
            } else {
                // JSON payload when no file
                const payload = {
                    name: formData.name,
                    deviceId: formData.deviceId,
                    message: formData.message,
                    recipients: recipientList
                }
                if (scheduledAt) payload.scheduledAt = scheduledAt

                await api.post('/broadcast', payload)
            }

            const isScheduled = formData.scheduleEnabled && formData.scheduledAt
            alert(isScheduled ? 'Broadcast scheduled successfully!' : 'Broadcast campaign created and started!')
            setActiveTab('campaigns')
            fetchCampaigns()
            setFormData({
                name: '', deviceId: '', message: '', recipients: '',
                mediaFile: null, mediaPreview: null, scheduleEnabled: false, scheduledAt: ''
            })
        } catch (error) {
            console.error('Failed to start broadcast:', error)
            alert(error.response?.data?.message || 'Failed to start broadcast')
        } finally {
            setSubmitting(false)
        }
    }

    const getStatusBadge = (status) => {
        switch (status) {
            case 'completed':
                return <span className="badge badge-success"><CheckCircle size={12} /> Completed</span>
            case 'processing':
                return <span className="badge badge-info"><Loader2 size={12} className="animate-spin" /> Processing</span>
            case 'pending':
                return <span className="badge badge-warning"><Clock size={12} /> Pending</span>
            case 'scheduled':
                return <span className="badge badge-warning"><Calendar size={12} /> Scheduled</span>
            case 'failed':
                return <span className="badge badge-error"><XCircle size={12} /> Failed</span>
            case 'cancelled':
                return <span className="badge badge-neutral"><XCircle size={12} /> Cancelled</span>
            default:
                return <span className="badge badge-neutral">{status}</span>
        }
    }

    const recipientCount = formData.recipients.split('\n').filter(r => r.trim()).length

    // Get minimum datetime for schedule (now + 5 minutes)
    const getMinScheduleDate = () => {
        const now = new Date()
        now.setMinutes(now.getMinutes() + 5)
        // datetime-local expects local time, not UTC
        const pad = (n) => String(n).padStart(2, '0')
        return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
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
                                placeholder={"+62812345678\n+62856789012"}
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

                        {/* Media Attachment */}
                        <div className="form-group">
                            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <Image size={14} /> Image Attachment
                                <span style={{ fontWeight: 400, fontSize: '0.75rem', color: 'var(--text-muted)' }}>(optional)</span>
                            </label>

                            {formData.mediaPreview ? (
                                <div style={{
                                    position: 'relative',
                                    display: 'inline-block',
                                    borderRadius: 'var(--radius-md)',
                                    overflow: 'hidden',
                                    border: '1px solid var(--border-color)'
                                }}>
                                    <img
                                        src={formData.mediaPreview}
                                        alt="Preview"
                                        style={{ maxWidth: '200px', maxHeight: '150px', display: 'block' }}
                                    />
                                    <button
                                        onClick={removeMedia}
                                        style={{
                                            position: 'absolute',
                                            top: '4px',
                                            right: '4px',
                                            background: 'rgba(0,0,0,0.7)',
                                            color: '#fff',
                                            border: 'none',
                                            borderRadius: '50%',
                                            width: '24px',
                                            height: '24px',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}
                                    >
                                        <X size={14} />
                                    </button>
                                    <div style={{
                                        padding: '4px 8px',
                                        background: 'var(--bg-secondary)',
                                        fontSize: '0.7rem',
                                        color: 'var(--text-muted)'
                                    }}>
                                        {formData.mediaFile?.name} ({(formData.mediaFile?.size / 1024).toFixed(0)} KB)
                                    </div>
                                </div>
                            ) : (
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    style={{
                                        border: '2px dashed var(--border-color)',
                                        borderRadius: 'var(--radius-md)',
                                        padding: 'var(--spacing-lg)',
                                        textAlign: 'center',
                                        cursor: 'pointer',
                                        transition: 'border-color 0.2s ease, background 0.2s ease'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.borderColor = 'var(--primary-color)'
                                        e.currentTarget.style.background = 'rgba(99,102,241,0.03)'
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.borderColor = 'var(--border-color)'
                                        e.currentTarget.style.background = 'transparent'
                                    }}
                                >
                                    <Upload size={24} style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }} />
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                        Click to upload an image
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                        JPEG, PNG, GIF, WebP — Max 5MB
                                    </div>
                                </div>
                            )}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/jpeg,image/png,image/gif,image/webp"
                                onChange={handleFileChange}
                                style={{ display: 'none' }}
                            />
                        </div>

                        {/* Schedule Toggle */}
                        <div className="form-group" style={{
                            padding: 'var(--spacing-md)',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--border-color)',
                            background: formData.scheduleEnabled ? 'rgba(99,102,241,0.03)' : 'transparent',
                            transition: 'background 0.2s ease'
                        }}>
                            <label style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 'var(--spacing-sm)',
                                cursor: 'pointer',
                                marginBottom: formData.scheduleEnabled ? 'var(--spacing-md)' : 0
                            }}>
                                <input
                                    type="checkbox"
                                    checked={formData.scheduleEnabled}
                                    onChange={(e) => setFormData(prev => ({
                                        ...prev,
                                        scheduleEnabled: e.target.checked,
                                        scheduledAt: e.target.checked ? prev.scheduledAt : ''
                                    }))}
                                />
                                <Calendar size={16} style={{ color: 'var(--primary-color)' }} />
                                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Schedule for later</span>
                            </label>

                            {formData.scheduleEnabled && (
                                <div>
                                    <label className="form-label" style={{ fontSize: '0.8rem', marginBottom: '4px' }}>
                                        Select date and time
                                    </label>
                                    <input
                                        type="datetime-local"
                                        className="form-input"
                                        value={formData.scheduledAt}
                                        onChange={(e) => setFormData({ ...formData, scheduledAt: e.target.value })}
                                        min={getMinScheduleDate()}
                                        style={{ maxWidth: '300px' }}
                                    />
                                    {formData.scheduledAt && (
                                        <div style={{
                                            marginTop: '6px',
                                            fontSize: '0.75rem',
                                            color: 'var(--text-muted)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}>
                                            <Info size={12} />
                                            Will be sent on {format(new Date(formData.scheduledAt), 'EEEE, MMM dd yyyy \'at\' HH:mm')}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Action Buttons */}
                        <div style={{ display: 'flex', gap: 'var(--spacing-md)', marginTop: 'var(--spacing-lg)', paddingTop: 'var(--spacing-lg)', borderTop: '1px solid var(--border-color)' }}>
                            {formData.scheduleEnabled && formData.scheduledAt ? (
                                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSendNow} disabled={submitting}>
                                    {submitting ? <Loader2 className="animate-spin" size={16} /> : <Calendar size={16} />}
                                    Schedule Broadcast
                                </button>
                            ) : (
                                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSendNow} disabled={submitting}>
                                    {submitting ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                                    Send Now
                                </button>
                            )}
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
                            <div style={{ background: '#DCF8C6', color: '#000', borderRadius: 'var(--radius-lg)', maxWidth: '90%', marginLeft: 'auto', overflow: 'hidden' }}>
                                {/* Image Preview */}
                                {formData.mediaPreview && (
                                    <img
                                        src={formData.mediaPreview}
                                        alt="Media"
                                        style={{ width: '100%', display: 'block' }}
                                    />
                                )}
                                <div style={{ padding: 'var(--spacing-md)', fontSize: '0.875rem' }}>
                                    {formData.message || 'Your message will appear here...'}
                                </div>
                            </div>
                        </div>
                        <div style={{ marginTop: 'var(--spacing-lg)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: '4px' }}>
                                <span>Recipients:</span>
                                <strong>{recipientCount}</strong>
                            </div>
                            {formData.mediaFile && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: '4px' }}>
                                    <span>Attachment:</span>
                                    <strong style={{ fontSize: '0.8rem' }}>📷 Image</strong>
                                </div>
                            )}
                            {formData.scheduleEnabled && formData.scheduledAt && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: '4px' }}>
                                    <span>Scheduled:</span>
                                    <strong style={{ fontSize: '0.8rem' }}>{format(new Date(formData.scheduledAt), 'MMM dd, HH:mm')}</strong>
                                </div>
                            )}
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
                                    <th>Progress</th>
                                    <th>Date</th>
                                    <th>Device</th>
                                </tr>
                            </thead>
                            <tbody>
                                {campaigns.length > 0 ? campaigns.map((campaign) => (
                                    <tr key={campaign.id}>
                                        <td>
                                            <div style={{ fontWeight: 500 }}>{campaign.name}</div>
                                            {campaign.scheduledAt && campaign.status === 'scheduled' && (
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px', marginTop: '2px' }}>
                                                    <Calendar size={10} />
                                                    {format(new Date(campaign.scheduledAt), 'MMM dd, yyyy HH:mm')}
                                                </div>
                                            )}
                                        </td>
                                        <td>{getStatusBadge(campaign.status)}</td>
                                        <td>
                                            <div style={{ fontSize: '0.8rem' }}>
                                                <span style={{ color: '#22c55e', fontWeight: 600 }}>{campaign.sent || 0}</span>
                                                <span style={{ color: 'var(--text-muted)' }}> / {campaign.totalRecipients || 0}</span>
                                                {(campaign.failed || 0) > 0 && (
                                                    <span style={{ color: '#ef4444', fontWeight: 600, marginLeft: '4px' }}>({campaign.failed} failed)</span>
                                                )}
                                            </div>
                                        </td>
                                        <td style={{ fontSize: '0.75rem' }}>{formatDistanceToNow(new Date(campaign.createdAt), { addSuffix: true })}</td>
                                        <td>{campaign.device?.name || 'N/A'}</td>
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
