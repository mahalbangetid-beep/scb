import { useState, useEffect, useRef } from 'react'
import {
    Hash,
    Type,
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
    Info,
    MessageSquare,
    Download,
    ChevronDown,
    ChevronUp,
    StopCircle,
    BarChart3,
    Users,
    CheckSquare,
    Contact
} from 'lucide-react'
import api from '../services/api'
import { formatDistanceToNow, format } from 'date-fns'

export default function Broadcast() {
    const [activeTab, setActiveTab] = useState('new')
    const [campaigns, setCampaigns] = useState([])
    const [devices, setDevices] = useState([])
    const [telegramBots, setTelegramBots] = useState([])
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [marketingConfig, setMarketingConfig] = useState(null)
    const [watermarkTemplates, setWatermarkTemplates] = useState([])
    const [savingTemplate, setSavingTemplate] = useState(false)
    const [newTemplateName, setNewTemplateName] = useState('')
    const [expandedCampaign, setExpandedCampaign] = useState(null)
    const [cancellingId, setCancellingId] = useState(null)
    const autoRefreshRef = useRef(null)
    const [availableGroups, setAvailableGroups] = useState([])
    const [groupsLoading, setGroupsLoading] = useState(false)
    const [retrievingContacts, setRetrievingContacts] = useState(false)


    // Form state
    const [formData, setFormData] = useState({
        name: '',
        platform: 'WHATSAPP',
        deviceId: '',
        telegramBotId: '',
        message: '',
        recipients: '',
        mediaFile: null,
        mediaPreview: null,
        autoIdEnabled: true, // Default enabled per spec
        autoIdPrefix: '',
        watermarkEnabled: false,
        watermarkText: '',
        broadcastType: 'number', // 'number', 'group', 'both'
        selectedGroups: [], // array of groupJid
        scheduleEnabled: false,
        scheduledAt: ''
    })

    const fileInputRef = useRef(null)
    const csvInputRef = useRef(null)

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

    // Auto-refresh when any campaign is processing (Bug 5.4: real-time updates)
    useEffect(() => {
        const hasProcessing = campaigns.some(c => c.status === 'processing')
        if (hasProcessing && activeTab === 'campaigns') {
            autoRefreshRef.current = setInterval(fetchCampaigns, 5000)
        } else {
            if (autoRefreshRef.current) clearInterval(autoRefreshRef.current)
        }
        return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current) }
    }, [campaigns, activeTab])

    const fetchDevices = async () => {
        try {
            const res = await api.get('/devices')
            setDevices(res.data || [])
        } catch (error) {
            console.error('Failed to fetch devices:', error)
        }
    }

    const fetchTelegramBots = async () => {
        try {
            const res = await api.get('/telegram/bots')
            setTelegramBots(res.data || [])
        } catch (error) {
            console.error('Failed to fetch Telegram bots:', error)
        }
    }

    const fetchMarketingConfig = async () => {
        try {
            const res = await api.get('/marketing/config')
            const cfg = res.data || res
            setMarketingConfig(cfg)
            // Sync form defaults from server config
            setFormData(prev => ({
                ...prev,
                autoIdEnabled: cfg.autoIdEnabled !== false,
                autoIdPrefix: cfg.autoIdPrefix || '',
                watermarkEnabled: cfg.watermarkEnabled || false,
                watermarkText: cfg.defaultWatermark || ''
            }))
        } catch (error) {
            console.error('Failed to fetch marketing config:', error)
        }
    }

    const fetchWatermarkTemplates = async () => {
        try {
            const res = await api.get('/marketing/watermarks')
            const data = res.data || res
            setWatermarkTemplates(data.templates || [])
        } catch (error) {
            console.error('Failed to fetch watermark templates:', error)
        }
    }

    const handleSaveTemplate = async () => {
        if (!newTemplateName.trim() || !formData.watermarkText.trim()) return
        setSavingTemplate(true)
        try {
            const res = await api.post('/marketing/watermarks', {
                name: newTemplateName.trim(),
                text: formData.watermarkText.trim()
            })
            const data = res.data || res
            setWatermarkTemplates(data.templates || [])
            setNewTemplateName('')
        } catch (error) {
            alert(error.message || 'Failed to save template')
        } finally {
            setSavingTemplate(false)
        }
    }

    useEffect(() => {
        fetchCampaigns()
        fetchDevices()
        fetchTelegramBots()
        fetchMarketingConfig()
        fetchWatermarkTemplates()
    }, [])

    // Fetch groups when device changes and platform is WA
    useEffect(() => {
        if (formData.platform === 'WHATSAPP' && formData.deviceId && formData.broadcastType !== 'number') {
            fetchGroups(formData.deviceId)
        }
    }, [formData.deviceId, formData.broadcastType, formData.platform])

    const fetchGroups = async (deviceId) => {
        setGroupsLoading(true)
        try {
            const res = await api.get(`/support-groups/for/marketing?deviceId=${deviceId}`)
            setAvailableGroups(res.data || [])
        } catch (error) {
            console.error('Failed to fetch groups:', error)
            setAvailableGroups([])
        } finally {
            setGroupsLoading(false)
        }
    }

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
        const isWA = formData.platform === 'WHATSAPP'
        const isGroupMode = formData.broadcastType === 'group'
        const isBothMode = formData.broadcastType === 'both'
        const needsRecipients = formData.broadcastType !== 'group'
        const needsGroups = formData.broadcastType !== 'number'

        if (!formData.name || !formData.message) {
            alert('Please fill in campaign name and message')
            return
        }
        if (needsRecipients && !formData.recipients?.trim()) {
            alert('Please add at least one recipient')
            return
        }
        if (needsGroups && formData.selectedGroups.length === 0) {
            alert('Please select at least one group')
            return
        }
        if (isWA && !formData.deviceId) {
            alert('Please select a WhatsApp device')
            return
        }
        if (!isWA && !formData.telegramBotId) {
            alert('Please select a Telegram bot')
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
                const payload = new FormData()
                payload.append('name', formData.name)
                payload.append('platform', formData.platform)
                if (isWA) payload.append('deviceId', formData.deviceId)
                if (!isWA) payload.append('telegramBotId', formData.telegramBotId)
                payload.append('message', formData.message)
                payload.append('broadcastType', formData.broadcastType)
                if (needsRecipients) {
                    recipientList.forEach(r => payload.append('recipients[]', r))
                }
                if (needsGroups) {
                    formData.selectedGroups.forEach(g => payload.append('targetGroups[]', g))
                }
                payload.append('media', formData.mediaFile)
                payload.append('autoIdEnabled', formData.autoIdEnabled)
                payload.append('watermarkText', formData.watermarkEnabled ? (formData.watermarkText || '') : '')
                if (scheduledAt) payload.append('scheduledAt', scheduledAt)

                await api.post('/broadcast', payload, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                })
            } else {
                const payload = {
                    name: formData.name,
                    platform: formData.platform,
                    message: formData.message,
                    broadcastType: formData.broadcastType,
                    recipients: needsRecipients ? recipientList : [],
                    targetGroups: needsGroups ? formData.selectedGroups : undefined,
                    autoIdEnabled: formData.autoIdEnabled,
                    watermarkText: formData.watermarkEnabled ? (formData.watermarkText || '') : ''
                }
                if (isWA) payload.deviceId = formData.deviceId
                if (!isWA) payload.telegramBotId = formData.telegramBotId
                if (scheduledAt) payload.scheduledAt = scheduledAt

                await api.post('/broadcast', payload)
            }

            const isScheduled = formData.scheduleEnabled && formData.scheduledAt
            alert(isScheduled ? 'Broadcast scheduled successfully!' : 'Broadcast campaign created and started!')
            setActiveTab('campaigns')
            fetchCampaigns()
            setFormData({
                name: '', platform: 'WHATSAPP', deviceId: '', telegramBotId: '', message: '', recipients: '',
                mediaFile: null, mediaPreview: null,
                autoIdEnabled: marketingConfig?.autoIdEnabled !== false,
                autoIdPrefix: marketingConfig?.autoIdPrefix || '',
                watermarkEnabled: marketingConfig?.watermarkEnabled || false,
                watermarkText: marketingConfig?.defaultWatermark || '',
                broadcastType: 'number', selectedGroups: [],
                scheduleEnabled: false, scheduledAt: ''
            })
        } catch (error) {
            console.error('Failed to start broadcast:', error)
            alert(error.error?.message || error.message || 'Failed to start broadcast')
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

    // Compute duplicate count for indicator (Bug 5.5)
    const duplicateInfo = (() => {
        const lines = formData.recipients.split('\n').map(r => r.trim().replace(/[^\d+]/g, '')).filter(r => r.length >= 5)
        const unique = new Set(lines)
        return { total: lines.length, unique: unique.size, dupes: lines.length - unique.size }
    })()

    const handleCsvImport = (e) => {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = (event) => {
            const text = event.target.result
            // Parse CSV: extract phone numbers from first column
            const lines = text.split(/\r?\n/).filter(l => l.trim())
            const phones = []
            for (const line of lines) {
                const cols = line.split(',')
                const raw = cols[0].replace(/["']/g, '').trim()
                // Skip header rows
                if (/^(phone|number|no|nama|name|contact)/i.test(raw)) continue
                // Clean: keep only digits and leading +
                const cleaned = raw.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '')
                if (cleaned && cleaned.replace(/\D/g, '').length >= 5) phones.push(cleaned)
            }
            if (phones.length === 0) {
                alert('No valid phone numbers found in CSV')
                return
            }
            setFormData(prev => ({
                ...prev,
                recipients: prev.recipients
                    ? prev.recipients + '\n' + phones.join('\n')
                    : phones.join('\n')
            }))
        }
        reader.readAsText(file)
        if (csvInputRef.current) csvInputRef.current.value = ''
    }

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
                            <label className="form-label">Platform</label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                    type="button"
                                    className={`btn ${formData.platform === 'WHATSAPP' ? 'btn-primary' : 'btn-secondary'}`}
                                    style={{ flex: 1 }}
                                    onClick={() => setFormData({ ...formData, platform: 'WHATSAPP', telegramBotId: '' })}
                                >
                                    <MessageSquare size={16} /> WhatsApp
                                </button>
                                <button
                                    type="button"
                                    className={`btn ${formData.platform === 'TELEGRAM' ? 'btn-primary' : 'btn-secondary'}`}
                                    style={{ flex: 1 }}
                                    onClick={() => setFormData({ ...formData, platform: 'TELEGRAM', deviceId: '' })}
                                >
                                    <Send size={16} /> Telegram
                                </button>
                            </div>
                        </div>

                        {formData.platform === 'WHATSAPP' ? (
                            <div className="form-group">
                                <label className="form-label">Select Device</label>
                                <select
                                    className="form-select"
                                    value={formData.deviceId}
                                    onChange={(e) => setFormData({ ...formData, deviceId: e.target.value })}
                                >
                                    <option value="">Choose a WhatsApp device...</option>
                                    {devices.map(d => (
                                        <option key={d.id} value={d.id}>{d.name} ({d.phone || 'No phone'})</option>
                                    ))}
                                </select>
                            </div>
                        ) : (
                            <div className="form-group">
                                <label className="form-label">Select Telegram Bot</label>
                                <select
                                    className="form-select"
                                    value={formData.telegramBotId}
                                    onChange={(e) => setFormData({ ...formData, telegramBotId: e.target.value })}
                                >
                                    <option value="">Choose a Telegram bot...</option>
                                    {telegramBots.map(b => (
                                        <option key={b.id} value={b.id}>
                                            {b.botName || b.botUsername || 'Bot'} ({b.status})
                                        </option>
                                    ))}
                                </select>
                                {telegramBots.length === 0 && (
                                    <div className="form-hint" style={{ color: 'var(--warning)', marginTop: '4px' }}>
                                        No Telegram bots found. Add one in Telegram settings first.
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Broadcast Type Selector (Bug 5.6) — WA only */}
                        {formData.platform === 'WHATSAPP' && (
                            <div className="form-group">
                                <label className="form-label">Broadcast Target</label>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    {[
                                        { value: 'number', label: 'Numbers', icon: <MessageSquare size={14} /> },
                                        { value: 'group', label: 'Groups', icon: <Users size={14} /> },
                                        { value: 'both', label: 'Both', icon: <CheckSquare size={14} /> }
                                    ].map(opt => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            className={`btn ${formData.broadcastType === opt.value ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                                            style={{ flex: 1 }}
                                            onClick={() => setFormData(prev => ({
                                                ...prev,
                                                broadcastType: opt.value,
                                                selectedGroups: opt.value === 'number' ? [] : prev.selectedGroups
                                            }))}
                                        >
                                            {opt.icon} {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Group Selection (Bug 5.6) */}
                        {formData.platform === 'WHATSAPP' && formData.broadcastType !== 'number' && (
                            <div className="form-group">
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                    <label className="form-label" style={{ marginBottom: 0 }}>
                                        Select Groups ({formData.selectedGroups.length} selected)
                                    </label>
                                    <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        style={{ fontSize: '0.7rem', padding: '2px 8px' }}
                                        onClick={() => {
                                            if (formData.selectedGroups.length === availableGroups.length) {
                                                setFormData(prev => ({ ...prev, selectedGroups: [] }))
                                            } else {
                                                setFormData(prev => ({
                                                    ...prev,
                                                    selectedGroups: availableGroups.map(g => g.groupJid)
                                                }))
                                            }
                                        }}
                                    >
                                        {formData.selectedGroups.length === availableGroups.length && availableGroups.length > 0
                                            ? 'Deselect All'
                                            : 'Select All'}
                                    </button>
                                </div>
                                {!formData.deviceId ? (
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '8px' }}>
                                        Select a device first to load groups.
                                    </div>
                                ) : groupsLoading ? (
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Loader2 className="animate-spin" size={14} /> Loading groups...
                                    </div>
                                ) : availableGroups.length === 0 ? (
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '8px' }}>
                                        No marketing groups found. Add groups in the Support Groups page first.
                                    </div>
                                ) : (
                                    <div style={{
                                        maxHeight: '160px',
                                        overflow: 'auto',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: 'var(--radius-md)',
                                        padding: '4px'
                                    }}>
                                        {availableGroups.map(g => (
                                            <label
                                                key={g.groupJid}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '8px',
                                                    padding: '6px 8px',
                                                    cursor: 'pointer',
                                                    borderRadius: '4px',
                                                    fontSize: '0.85rem',
                                                    background: formData.selectedGroups.includes(g.groupJid) ? 'rgba(34,197,94,0.06)' : 'transparent'
                                                }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={formData.selectedGroups.includes(g.groupJid)}
                                                    onChange={(e) => {
                                                        setFormData(prev => ({
                                                            ...prev,
                                                            selectedGroups: e.target.checked
                                                                ? [...prev.selectedGroups, g.groupJid]
                                                                : prev.selectedGroups.filter(j => j !== g.groupJid)
                                                        }))
                                                    }}
                                                />
                                                <div>
                                                    <div style={{ fontWeight: 500 }}>{g.groupName}</div>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{g.groupJid}</div>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

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

                        {formData.broadcastType !== 'group' && (
                            <div className="form-group">
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px', flexWrap: 'wrap', gap: 4 }}>
                                    <label className="form-label" style={{ marginBottom: 0 }}>Recipients (one per line)</label>
                                    <div style={{ display: 'flex', gap: 4 }}>
                                        <button
                                            type="button"
                                            className="btn btn-primary btn-sm"
                                            style={{ fontSize: '0.7rem', padding: '2px 8px' }}
                                            disabled={retrievingContacts}
                                            onClick={async () => {
                                                setRetrievingContacts(true)
                                                try {
                                                    const res = await api.get('/contact-backup/all-contacts')
                                                    const data = res.data?.data || res.data || {}
                                                    const contacts = data.contacts || []
                                                    if (contacts.length === 0) {
                                                        alert('No contacts found. Please backup your devices first in Contact Backups page.')
                                                        return
                                                    }
                                                    const phones = contacts.map(c => c.phone).filter(Boolean)
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        recipients: prev.recipients
                                                            ? prev.recipients + '\n' + phones.join('\n')
                                                            : phones.join('\n')
                                                    }))
                                                    alert(`Retrieved ${phones.length} contacts from ${data.totalDevices || 0} device(s)`)
                                                } catch (error) {
                                                    alert(error.response?.data?.message || 'Failed to retrieve contacts')
                                                } finally {
                                                    setRetrievingContacts(false)
                                                }
                                            }}
                                        >
                                            {retrievingContacts ? <Loader2 size={12} className="animate-spin" /> : <Contact size={12} />} Retrieve All Contacts
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-secondary btn-sm"
                                            style={{ fontSize: '0.7rem', padding: '2px 8px' }}
                                            onClick={() => csvInputRef.current?.click()}
                                        >
                                            <Upload size={12} /> Import CSV
                                        </button>
                                    </div>
                                    <input
                                        ref={csvInputRef}
                                        type="file"
                                        accept=".csv,.txt"
                                        onChange={handleCsvImport}
                                        style={{ display: 'none' }}
                                    />
                                </div>
                                <textarea
                                    className="form-textarea"
                                    placeholder={formData.platform === 'TELEGRAM' ? "Enter Telegram Chat IDs (one per line)" : "+62812345678\n+62856789012"}
                                    value={formData.recipients}
                                    onChange={(e) => setFormData({ ...formData, recipients: e.target.value })}
                                    rows={4}
                                />
                                {recipientCount > 0 && (
                                    <div style={{ display: 'flex', gap: 'var(--spacing-md)', marginTop: '4px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        <span>{recipientCount} recipient{recipientCount !== 1 ? 's' : ''}</span>
                                        {duplicateInfo.dupes > 0 && (
                                            <span style={{ color: '#f59e0b' }}>
                                                ⚠ {duplicateInfo.dupes} duplicate{duplicateInfo.dupes !== 1 ? 's' : ''} detected
                                                {marketingConfig?.removeDuplicates !== false
                                                    ? ' (will be auto-removed)'
                                                    : ''}
                                            </span>
                                        )}
                                        {duplicateInfo.dupes === 0 && recipientCount > 1 && (
                                            <span style={{ color: '#22c55e' }}>✓ No duplicates</span>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

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

                        {/* Auto ID Numbering (Bug 5.2) */}
                        <div className="form-group" style={{
                            padding: 'var(--spacing-md)',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--border-color)',
                            background: formData.autoIdEnabled ? 'rgba(34,197,94,0.03)' : 'transparent',
                            transition: 'background 0.2s ease'
                        }}>
                            <label style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 'var(--spacing-sm)',
                                cursor: 'pointer',
                                marginBottom: formData.autoIdEnabled ? 'var(--spacing-md)' : 0
                            }}>
                                <input
                                    type="checkbox"
                                    checked={formData.autoIdEnabled}
                                    onChange={(e) => setFormData(prev => ({
                                        ...prev,
                                        autoIdEnabled: e.target.checked
                                    }))}
                                />
                                <Hash size={16} style={{ color: '#22c55e' }} />
                                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Auto ID Numbering</span>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>(Anti-Spam)</span>
                            </label>

                            {formData.autoIdEnabled && (
                                <div>
                                    <label className="form-label" style={{ fontSize: '0.8rem', marginBottom: '4px' }}>
                                        ID Prefix (optional)
                                    </label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="e.g. REF-"
                                        value={formData.autoIdPrefix}
                                        onChange={(e) => {
                                            const newPrefix = e.target.value
                                            setFormData({ ...formData, autoIdPrefix: newPrefix })
                                            // Persist prefix to server config
                                            api.put('/marketing/config', { autoIdPrefix: newPrefix }).catch(() => { })
                                        }}
                                        style={{ maxWidth: '200px' }}
                                    />
                                    <div style={{
                                        marginTop: '8px',
                                        fontSize: '0.75rem',
                                        color: 'var(--text-muted)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}>
                                        <Info size={12} />
                                        Next ID: <strong>{formData.autoIdPrefix}{marketingConfig?.autoIdCounter || 1}</strong>
                                        {' → '}
                                        <strong>{formData.autoIdPrefix}{(marketingConfig?.autoIdCounter || 1) + Math.max(recipientCount - 1, 0)}</strong>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Watermark Section (Bug 5.3) */}
                        <div className="form-group" style={{
                            padding: 'var(--spacing-md)',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--border-color)',
                            background: formData.watermarkEnabled ? 'rgba(168,85,247,0.03)' : 'transparent',
                            transition: 'background 0.2s ease'
                        }}>
                            <label style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 'var(--spacing-sm)',
                                cursor: 'pointer',
                                marginBottom: formData.watermarkEnabled ? 'var(--spacing-md)' : 0
                            }}>
                                <input
                                    type="checkbox"
                                    checked={formData.watermarkEnabled}
                                    onChange={(e) => {
                                        const enabled = e.target.checked
                                        setFormData(prev => ({ ...prev, watermarkEnabled: enabled }))
                                        api.put('/marketing/config', { watermarkEnabled: enabled }).catch(() => { })
                                    }}
                                />
                                <Type size={16} style={{ color: '#a855f7' }} />
                                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Watermark</span>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>(appended to message)</span>
                            </label>

                            {formData.watermarkEnabled && (
                                <div>
                                    {/* Template Selector */}
                                    {watermarkTemplates.length > 0 && (
                                        <div style={{ marginBottom: 'var(--spacing-sm)' }}>
                                            <label className="form-label" style={{ fontSize: '0.8rem', marginBottom: '4px' }}>
                                                Load from template
                                            </label>
                                            <select
                                                className="form-select"
                                                value=""
                                                onChange={(e) => {
                                                    if (e.target.value) {
                                                        const tmpl = watermarkTemplates.find(t => t.name === e.target.value)
                                                        if (tmpl) setFormData(prev => ({ ...prev, watermarkText: tmpl.text }))
                                                    }
                                                }}
                                                style={{ fontSize: '0.85rem' }}
                                            >
                                                <option value="">Select a template...</option>
                                                {watermarkTemplates.map(t => (
                                                    <option key={t.name} value={t.name}>{t.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    {/* Custom Watermark Text */}
                                    <label className="form-label" style={{ fontSize: '0.8rem', marginBottom: '4px' }}>
                                        Watermark Text
                                    </label>
                                    <textarea
                                        className="form-textarea"
                                        placeholder="e.g. Powered by YourBrand ✨"
                                        value={formData.watermarkText}
                                        onChange={(e) => setFormData({ ...formData, watermarkText: e.target.value })}
                                        rows={2}
                                        style={{ fontSize: '0.85rem' }}
                                    />

                                    {/* Save as Template */}
                                    <div style={{ display: 'flex', gap: '6px', marginTop: '8px', alignItems: 'center' }}>
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="Template name"
                                            value={newTemplateName}
                                            onChange={(e) => setNewTemplateName(e.target.value)}
                                            style={{ flex: 1, fontSize: '0.8rem', padding: '4px 8px' }}
                                        />
                                        <button
                                            type="button"
                                            className="btn btn-secondary btn-sm"
                                            onClick={handleSaveTemplate}
                                            disabled={savingTemplate || !newTemplateName.trim() || !formData.watermarkText.trim()}
                                            style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                                        >
                                            {savingTemplate ? <Loader2 className="animate-spin" size={12} /> : 'Save Template'}
                                        </button>
                                    </div>
                                </div>
                            )}
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
                                <div style={{ padding: 'var(--spacing-md)', fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>
                                    {formData.message || 'Your message will appear here...'}
                                    {formData.watermarkEnabled && formData.watermarkText && (
                                        <div style={{ marginTop: '6px', color: '#888', fontSize: '0.8rem', fontStyle: 'italic' }}>
                                            {formData.watermarkText}
                                        </div>
                                    )}
                                    {formData.autoIdEnabled && (
                                        <div style={{ marginTop: '4px', color: '#666', fontSize: '0.8rem' }}>
                                            ID: {formData.autoIdPrefix}{marketingConfig?.autoIdCounter || 1}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div style={{ marginTop: 'var(--spacing-lg)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: '4px' }}>
                                <span>Targets:</span>
                                <strong>
                                    {formData.broadcastType === 'group'
                                        ? `${formData.selectedGroups.length} group${formData.selectedGroups.length !== 1 ? 's' : ''}`
                                        : formData.broadcastType === 'both'
                                            ? `${recipientCount} numbers, ${formData.selectedGroups.length} groups`
                                            : `${recipientCount} recipient${recipientCount !== 1 ? 's' : ''}`
                                    }
                                </strong>
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

                    {campaigns.length > 0 ? campaigns.map((campaign) => {
                        const total = campaign.totalRecipients || 0
                        const sent = campaign.sent || 0
                        const failed = campaign.failed || 0
                        const remaining = Math.max(total - sent - failed, 0)
                        const successRate = total > 0 ? ((sent / total) * 100).toFixed(1) : '0.0'
                        const isExpanded = expandedCampaign === campaign.id
                        const isActive = ['processing'].includes(campaign.status)

                        return (
                            <div key={campaign.id} style={{
                                borderBottom: '1px solid var(--border-color)',
                                transition: 'background 0.15s ease'
                            }}>
                                {/* Campaign Row */}
                                <div
                                    onClick={() => setExpandedCampaign(isExpanded ? null : campaign.id)}
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: '2fr 0.8fr 1fr 1.5fr 1fr 0.5fr',
                                        alignItems: 'center',
                                        padding: 'var(--spacing-md) var(--spacing-lg)',
                                        cursor: 'pointer',
                                        background: isExpanded ? 'var(--bg-secondary)' : 'transparent'
                                    }}
                                >
                                    <div>
                                        <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{campaign.name}</div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                            {campaign.platform === 'TELEGRAM'
                                                ? (campaign.telegramBot?.botName || campaign.telegramBot?.botUsername || 'Bot')
                                                : (campaign.device?.name || 'N/A')}
                                        </div>
                                    </div>
                                    <div>
                                        <span className={`badge ${campaign.platform === 'TELEGRAM' ? 'badge-info' : 'badge-success'}`} style={{ fontSize: '0.65rem' }}>
                                            {campaign.platform === 'TELEGRAM' ? '✈️ TG' : '💬 WA'}
                                        </span>
                                    </div>
                                    <div>{getStatusBadge(campaign.status)}</div>
                                    <div>
                                        {/* Progress bar */}
                                        <div style={{
                                            background: 'var(--bg-tertiary)',
                                            borderRadius: '4px',
                                            height: '6px',
                                            overflow: 'hidden',
                                            marginBottom: '4px'
                                        }}>
                                            <div style={{
                                                height: '100%',
                                                width: total > 0 ? `${((sent + failed) / total) * 100}%` : '0%',
                                                background: failed > 0 ? 'linear-gradient(90deg, #22c55e, #ef4444)' : '#22c55e',
                                                borderRadius: '4px',
                                                transition: 'width 0.5s ease'
                                            }} />
                                        </div>
                                        <div style={{ fontSize: '0.75rem' }}>
                                            <span style={{ color: '#22c55e', fontWeight: 600 }}>{sent}</span>
                                            <span style={{ color: 'var(--text-muted)' }}> / {total}</span>
                                            {failed > 0 && (
                                                <span style={{ color: '#ef4444', fontWeight: 600, marginLeft: '4px' }}>({failed} failed)</span>
                                            )}
                                        </div>
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        {formatDistanceToNow(new Date(campaign.createdAt), { addSuffix: true })}
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    </div>
                                </div>

                                {/* Expanded Detail Panel (Bug 5.4) */}
                                {isExpanded && (
                                    <div style={{
                                        padding: 'var(--spacing-lg)',
                                        background: 'var(--bg-secondary)',
                                        borderTop: '1px solid var(--border-color)'
                                    }}>
                                        {/* Stats Grid */}
                                        <div style={{
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                                            gap: 'var(--spacing-md)',
                                            marginBottom: 'var(--spacing-lg)'
                                        }}>
                                            <div style={{
                                                padding: 'var(--spacing-md)',
                                                background: 'var(--bg-primary)',
                                                borderRadius: 'var(--radius-md)',
                                                textAlign: 'center'
                                            }}>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Total Contacts</div>
                                                <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{total}</div>
                                            </div>
                                            <div style={{
                                                padding: 'var(--spacing-md)',
                                                background: 'var(--bg-primary)',
                                                borderRadius: 'var(--radius-md)',
                                                textAlign: 'center'
                                            }}>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Sent</div>
                                                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#22c55e' }}>{sent}</div>
                                            </div>
                                            <div style={{
                                                padding: 'var(--spacing-md)',
                                                background: 'var(--bg-primary)',
                                                borderRadius: 'var(--radius-md)',
                                                textAlign: 'center'
                                            }}>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Remaining</div>
                                                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f59e0b' }}>{remaining}</div>
                                            </div>
                                            <div style={{
                                                padding: 'var(--spacing-md)',
                                                background: 'var(--bg-primary)',
                                                borderRadius: 'var(--radius-md)',
                                                textAlign: 'center'
                                            }}>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Failed</div>
                                                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#ef4444' }}>{failed}</div>
                                            </div>
                                            <div style={{
                                                padding: 'var(--spacing-md)',
                                                background: 'var(--bg-primary)',
                                                borderRadius: 'var(--radius-md)',
                                                textAlign: 'center'
                                            }}>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Success Rate</div>
                                                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: parseFloat(successRate) >= 80 ? '#22c55e' : parseFloat(successRate) >= 50 ? '#f59e0b' : '#ef4444' }}>
                                                    {successRate}%
                                                </div>
                                            </div>
                                        </div>

                                        {/* Time Info */}
                                        <div style={{
                                            display: 'flex',
                                            gap: 'var(--spacing-xl)',
                                            marginBottom: 'var(--spacing-lg)',
                                            fontSize: '0.8rem',
                                            flexWrap: 'wrap'
                                        }}>
                                            <div>
                                                <span style={{ color: 'var(--text-muted)' }}>Created: </span>
                                                <strong>{format(new Date(campaign.createdAt), 'MMM dd, yyyy HH:mm:ss')}</strong>
                                            </div>
                                            {campaign.startedAt && (
                                                <div>
                                                    <span style={{ color: 'var(--text-muted)' }}>Start Time: </span>
                                                    <strong>{format(new Date(campaign.startedAt), 'MMM dd, yyyy HH:mm:ss')}</strong>
                                                </div>
                                            )}
                                            {campaign.completedAt && (
                                                <div>
                                                    <span style={{ color: 'var(--text-muted)' }}>End Time: </span>
                                                    <strong>{format(new Date(campaign.completedAt), 'MMM dd, yyyy HH:mm:ss')}</strong>
                                                </div>
                                            )}
                                            {campaign.startedAt && campaign.completedAt && (
                                                <div>
                                                    <span style={{ color: 'var(--text-muted)' }}>Duration: </span>
                                                    <strong>
                                                        {(() => {
                                                            const ms = new Date(campaign.completedAt) - new Date(campaign.startedAt)
                                                            const secs = Math.floor(ms / 1000)
                                                            if (secs < 60) return `${secs}s`
                                                            const mins = Math.floor(secs / 60)
                                                            return `${mins}m ${secs % 60}s`
                                                        })()}
                                                    </strong>
                                                </div>
                                            )}
                                        </div>

                                        {/* Action Buttons */}
                                        <div style={{ display: 'flex', gap: 'var(--spacing-sm)', flexWrap: 'wrap' }}>
                                            {isActive && (
                                                <button
                                                    className="btn btn-secondary btn-sm"
                                                    style={{ color: '#ef4444' }}
                                                    disabled={cancellingId === campaign.id}
                                                    onClick={async (e) => {
                                                        e.stopPropagation()
                                                        if (!confirm('Cancel this campaign?')) return
                                                        setCancellingId(campaign.id)
                                                        try {
                                                            await api.post(`/broadcast/${campaign.id}/cancel`)
                                                            fetchCampaigns()
                                                        } catch (err) {
                                                            alert(err.message || 'Failed to cancel')
                                                        } finally {
                                                            setCancellingId(null)
                                                        }
                                                    }}
                                                >
                                                    {cancellingId === campaign.id ? <Loader2 className="animate-spin" size={12} /> : <StopCircle size={12} />}
                                                    Cancel
                                                </button>
                                            )}
                                            {failed > 0 && (
                                                <button
                                                    className="btn btn-secondary btn-sm"
                                                    onClick={async (e) => {
                                                        e.stopPropagation()
                                                        try {
                                                            const csvText = await api.get(`/broadcast/${campaign.id}/failed-export`, {
                                                                responseType: 'text',
                                                                transformResponse: [(data) => data] // prevent JSON parsing, return raw CSV
                                                            })
                                                            const blob = new Blob([csvText], { type: 'text/csv' })
                                                            const url = URL.createObjectURL(blob)
                                                            const a = document.createElement('a')
                                                            a.href = url
                                                            a.download = `failed-${campaign.name}.csv`
                                                            a.click()
                                                            URL.revokeObjectURL(url)
                                                        } catch (err) {
                                                            alert('Failed to export: ' + (err.message || 'Unknown error'))
                                                        }
                                                    }}
                                                >
                                                    <Download size={12} /> Export Failed ({failed})
                                                </button>
                                            )}
                                            {isActive && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                    <Loader2 className="animate-spin" size={12} />
                                                    Auto-refreshing...
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )
                    }) : (
                        <div style={{ textAlign: 'center', padding: 'var(--spacing-xl)', color: 'var(--text-muted)' }}>
                            No campaigns found
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
