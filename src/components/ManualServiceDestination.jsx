import { useState, useEffect } from 'react'
import { Save, Loader2, MapPin, MessageCircle, Phone, CheckCircle, Smartphone } from 'lucide-react'
import api from '../services/api'

export default function ManualServiceDestination({ panelId }) {
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState(null)
    const [success, setSuccess] = useState(null)
    const [savedConfig, setSavedConfig] = useState(null)
    const [devices, setDevices] = useState([])
    const [form, setForm] = useState({
        deviceId: '',
        whatsappNumber: '',
        whatsappGroupJid: '',
        telegramChatId: '',
        refillTemplate: '',
        cancelTemplate: '',
        speedupTemplate: '',
        errorDeviceId: '',
        errorWhatsappNumber: '',
        errorGroupJid: '',
        errorChatId: '',
        errorTemplate: ''
    })

    useEffect(() => { if (panelId) { fetchConfig(); fetchDevices() } }, [panelId])
    useEffect(() => { if (error) { const t = setTimeout(() => setError(null), 5000); return () => clearTimeout(t) } }, [error])
    useEffect(() => { if (success) { const t = setTimeout(() => setSuccess(null), 3000); return () => clearTimeout(t) } }, [success])

    const fetchDevices = async () => {
        try {
            const res = await api.get('/devices')
            setDevices(res.data?.devices || res.data || [])
        } catch (e) { console.error('Failed to fetch devices') }
    }

    const fetchConfig = async () => {
        setLoading(true)
        try {
            const res = await api.get(`/provider-config/manual-destination?panelId=${panelId}`)
            if (res.data?.data) {
                const cfg = res.data.data
                setSavedConfig(cfg)
                setForm({
                    deviceId: cfg.deviceId || '',
                    whatsappNumber: cfg.whatsappNumber || '',
                    whatsappGroupJid: cfg.whatsappGroupJid || '',
                    telegramChatId: cfg.telegramChatId || '',
                    refillTemplate: cfg.refillTemplate || '',
                    cancelTemplate: cfg.cancelTemplate || '',
                    speedupTemplate: cfg.speedupTemplate || '',
                    errorDeviceId: cfg.errorDeviceId || '',
                    errorWhatsappNumber: cfg.errorWhatsappNumber || '',
                    errorGroupJid: cfg.errorGroupJid || '',
                    errorChatId: cfg.errorChatId || '',
                    errorTemplate: cfg.errorTemplate || ''
                })
            }
        } catch (e) { /* No config yet */ }
        setLoading(false)
    }

    const handleSave = async () => {
        setSaving(true)
        setError(null)
        try {
            const res = await api.post(`/provider-config/manual-destination`, { panelId, ...form })
            setSavedConfig(res.data?.data || { ...form })
            setSuccess('✅ Destination saved successfully!')
        } catch (e) { setError(e.response?.data?.message || 'Failed to save') }
        setSaving(false)
    }

    // Build saved destinations list
    const savedList = []
    if (savedConfig) {
        const devName = devices.find(d => d.id === savedConfig.deviceId)?.name
        if (devName) savedList.push({ type: 'Device', platform: 'Command Device', value: devName })
        if (savedConfig.whatsappNumber) savedList.push({ type: 'Command', platform: 'WhatsApp DM', value: savedConfig.whatsappNumber })
        if (savedConfig.whatsappGroupJid) savedList.push({ type: 'Command', platform: 'WhatsApp Group', value: savedConfig.whatsappGroupJid })
        if (savedConfig.telegramChatId) savedList.push({ type: 'Command', platform: 'Telegram', value: savedConfig.telegramChatId })
        if (savedConfig.refillTemplate) savedList.push({ type: 'Template', platform: 'Refill', value: savedConfig.refillTemplate.substring(0, 50) + (savedConfig.refillTemplate.length > 50 ? '...' : '') })
        if (savedConfig.cancelTemplate) savedList.push({ type: 'Template', platform: 'Cancel', value: savedConfig.cancelTemplate.substring(0, 50) + (savedConfig.cancelTemplate.length > 50 ? '...' : '') })
        if (savedConfig.speedupTemplate) savedList.push({ type: 'Template', platform: 'Speed Up', value: savedConfig.speedupTemplate.substring(0, 50) + (savedConfig.speedupTemplate.length > 50 ? '...' : '') })
        const errDevName = devices.find(d => d.id === savedConfig.errorDeviceId)?.name
        if (errDevName) savedList.push({ type: 'Error', platform: 'Error Device', value: errDevName })
        if (savedConfig.errorWhatsappNumber) savedList.push({ type: 'Error', platform: 'WhatsApp DM', value: savedConfig.errorWhatsappNumber })
        if (savedConfig.errorGroupJid) savedList.push({ type: 'Error', platform: 'WhatsApp Group', value: savedConfig.errorGroupJid })
        if (savedConfig.errorChatId) savedList.push({ type: 'Error', platform: 'Telegram', value: savedConfig.errorChatId })
        if (savedConfig.errorTemplate) savedList.push({ type: 'Error', platform: 'Template', value: savedConfig.errorTemplate.substring(0, 50) + (savedConfig.errorTemplate.length > 50 ? '...' : '') })
    }

    if (!panelId) return <div className="empty-state"><p>Select a panel first</p></div>

    return (
        <div>
            <div style={{ marginBottom: 'var(--spacing-md)' }}>
                <h3 style={{ margin: '0 0 var(--spacing-xs)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <MapPin size={18} /> Manual Service Destination
                </h3>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                    When an order has no provider (manual mode), commands will be forwarded to these destinations.
                </p>
            </div>

            {error && <div className="alert alert-error" style={{ marginBottom: 'var(--spacing-md)' }}>{error}</div>}
            {success && <div className="alert alert-success" style={{ marginBottom: 'var(--spacing-md)' }}>{success}</div>}

            {loading ? (
                <div style={{ textAlign: 'center', padding: 'var(--spacing-xl)' }}><Loader2 size={24} className="animate-spin" /></div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-lg)' }}>

                    {/* ==================== LEFT: FORM ==================== */}
                    <div>
                        {/* Device Selection */}
                        <div style={{ marginBottom: 'var(--spacing-md)', padding: 'var(--spacing-sm)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                            <h4 style={{ margin: '0 0 var(--spacing-sm)', color: 'var(--text-primary)', fontSize: 14 }}>
                                <Smartphone size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                                WhatsApp Device (Command Forwarding)
                            </h4>
                            <select className="form-select" value={form.deviceId} onChange={e => setForm({ ...form, deviceId: e.target.value })}>
                                <option value="">Select Device</option>
                                {devices.map(d => (
                                    <option key={d.id} value={d.id}>{d.name} ({d.status})</option>
                                ))}
                            </select>
                        </div>

                        {/* Command Destinations */}
                        <div style={{ marginBottom: 'var(--spacing-md)' }}>
                            <h4 style={{ margin: '0 0 var(--spacing-sm)', color: 'var(--text-primary)', fontSize: 14 }}>
                                <MessageCircle size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                                Command Forwarding Destinations
                            </h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                                <div>
                                    <label className="form-label">WhatsApp DM Number</label>
                                    <input className="form-input" placeholder="e.g. 628123456789" value={form.whatsappNumber} onChange={e => setForm({ ...form, whatsappNumber: e.target.value })} />
                                </div>
                                <div>
                                    <label className="form-label">WhatsApp Group JID</label>
                                    <input className="form-input" placeholder="e.g. 120363xxx@g.us" value={form.whatsappGroupJid} onChange={e => setForm({ ...form, whatsappGroupJid: e.target.value })} />
                                </div>
                                <div>
                                    <label className="form-label">Telegram Chat ID</label>
                                    <input className="form-input" placeholder="e.g. -1001234567890" value={form.telegramChatId} onChange={e => setForm({ ...form, telegramChatId: e.target.value })} />
                                </div>
                            </div>
                        </div>

                        {/* Command Templates */}
                        <div style={{ marginBottom: 'var(--spacing-md)' }}>
                            <h4 style={{ margin: '0 0 var(--spacing-xs)', color: 'var(--text-primary)', fontSize: 14 }}>
                                Command Text Templates
                            </h4>
                            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '0 0 var(--spacing-sm)' }}>
                                Variables: {'{order_id}'}, {'{service}'}, {'{link}'}, {'{quantity}'}
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                                <div>
                                    <label className="form-label">Refill Template</label>
                                    <textarea className="form-input" rows={2} placeholder="e.g. {order_id} refill" value={form.refillTemplate} onChange={e => setForm({ ...form, refillTemplate: e.target.value })} style={{ resize: 'vertical', minHeight: 40 }} />
                                </div>
                                <div>
                                    <label className="form-label">Cancel Template</label>
                                    <textarea className="form-input" rows={2} placeholder="e.g. {order_id} cancel" value={form.cancelTemplate} onChange={e => setForm({ ...form, cancelTemplate: e.target.value })} style={{ resize: 'vertical', minHeight: 40 }} />
                                </div>
                                <div>
                                    <label className="form-label">Speed Up Template</label>
                                    <textarea className="form-input" rows={2} placeholder="e.g. {order_id} speed up" value={form.speedupTemplate} onChange={e => setForm({ ...form, speedupTemplate: e.target.value })} style={{ resize: 'vertical', minHeight: 40 }} />
                                </div>
                            </div>
                        </div>

                        <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: 'var(--spacing-md) 0' }} />

                        {/* ==================== ERROR SECTION ==================== */}
                        <div style={{ marginBottom: 'var(--spacing-md)' }}>
                            <h4 style={{ margin: '0 0 var(--spacing-sm)', color: 'var(--color-error)', fontSize: 14 }}>
                                <Phone size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                                Error / Failed Order Forwarding
                            </h4>

                            {/* Error Device */}
                            <div style={{ marginBottom: 'var(--spacing-sm)', padding: 'var(--spacing-sm)', background: 'rgba(239,68,68,0.05)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(239,68,68,0.15)' }}>
                                <label className="form-label">WhatsApp Device (Error Forwarding)</label>
                                <select className="form-select" value={form.errorDeviceId} onChange={e => setForm({ ...form, errorDeviceId: e.target.value })}>
                                    <option value="">Select Device for Error Messages</option>
                                    {devices.map(d => (
                                        <option key={d.id} value={d.id}>{d.name} ({d.status})</option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                                <div>
                                    <label className="form-label">WhatsApp DM Number</label>
                                    <input className="form-input" placeholder="e.g. 628123456789" value={form.errorWhatsappNumber} onChange={e => setForm({ ...form, errorWhatsappNumber: e.target.value })} />
                                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Receive error notifications directly via WhatsApp DM</span>
                                </div>
                                <div>
                                    <label className="form-label">WhatsApp Group JID</label>
                                    <input className="form-input" placeholder="e.g. 120363xxx@g.us" value={form.errorGroupJid} onChange={e => setForm({ ...form, errorGroupJid: e.target.value })} />
                                </div>
                                <div>
                                    <label className="form-label">Telegram Chat ID</label>
                                    <input className="form-input" placeholder="e.g. -1001234567890" value={form.errorChatId} onChange={e => setForm({ ...form, errorChatId: e.target.value })} />
                                </div>
                                <div>
                                    <label className="form-label">Error Message Template</label>
                                    <textarea className="form-input" rows={2} placeholder="e.g. ⚠️ Error #{order_id} - {service}" value={form.errorTemplate} onChange={e => setForm({ ...form, errorTemplate: e.target.value })} style={{ resize: 'vertical', minHeight: 40 }} />
                                </div>
                            </div>
                        </div>

                        <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ minWidth: 160 }}>
                            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                            {savedConfig ? ' Update Destination' : ' Save Destination'}
                        </button>
                    </div>

                    {/* ==================== RIGHT: SAVED LIST ==================== */}
                    <div>
                        <h4 style={{ margin: '0 0 var(--spacing-sm)', color: 'var(--text-primary)', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <CheckCircle size={14} /> Saved Destinations
                        </h4>

                        {savedList.length === 0 ? (
                            <div style={{
                                background: 'var(--bg-secondary)',
                                border: '1px dashed var(--border-color)',
                                borderRadius: 'var(--radius-md)',
                                padding: 'var(--spacing-lg)',
                                textAlign: 'center',
                                color: 'var(--text-tertiary)',
                                fontSize: 13
                            }}>
                                No destinations saved yet.
                                <br />Fill the form and click Save.
                            </div>
                        ) : (
                            <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                    <thead>
                                        <tr style={{ background: 'var(--bg-secondary)' }}>
                                            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border-color)' }}>Type</th>
                                            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border-color)' }}>Platform</th>
                                            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border-color)' }}>Value</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {savedList.map((item, i) => (
                                            <tr key={i} style={{ borderBottom: i < savedList.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                                                <td style={{ padding: '8px 12px' }}>
                                                    <span style={{
                                                        background: item.type === 'Command' ? 'rgba(34,197,94,0.15)' : item.type === 'Error' ? 'rgba(239,68,68,0.15)' : item.type === 'Device' ? 'rgba(59,130,246,0.15)' : 'rgba(168,85,247,0.15)',
                                                        color: item.type === 'Command' ? 'var(--color-success)' : item.type === 'Error' ? 'var(--color-error)' : item.type === 'Device' ? 'var(--color-info, #3b82f6)' : 'rgb(168,85,247)',
                                                        padding: '2px 8px',
                                                        borderRadius: 'var(--radius-sm)',
                                                        fontSize: 11,
                                                        fontWeight: 600
                                                    }}>
                                                        {item.type}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{item.platform}</td>
                                                <td style={{ padding: '8px 12px' }}>
                                                    <code style={{ background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: 4, fontSize: 12, wordBreak: 'break-all' }}>
                                                        {item.value}
                                                    </code>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                </div>
            )}
        </div>
    )
}
