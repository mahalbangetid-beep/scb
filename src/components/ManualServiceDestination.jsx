import { useState, useEffect } from 'react'
import { Save, Loader2, MapPin, MessageCircle, Phone, CheckCircle } from 'lucide-react'
import api from '../services/api'

export default function ManualServiceDestination({ panelId }) {
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState(null)
    const [success, setSuccess] = useState(null)
    const [savedConfig, setSavedConfig] = useState(null)
    const [form, setForm] = useState({
        whatsappNumber: '',
        whatsappGroupJid: '',
        telegramChatId: '',
        errorGroupJid: '',
        errorChatId: ''
    })

    useEffect(() => { if (panelId) fetchConfig() }, [panelId])
    useEffect(() => { if (error) { const t = setTimeout(() => setError(null), 5000); return () => clearTimeout(t) } }, [error])
    useEffect(() => { if (success) { const t = setTimeout(() => setSuccess(null), 3000); return () => clearTimeout(t) } }, [success])

    const fetchConfig = async () => {
        setLoading(true)
        try {
            const res = await api.get(`/provider-config/manual-destination?panelId=${panelId}`)
            if (res.data?.data) {
                const cfg = res.data.data
                setSavedConfig(cfg)
                setForm({
                    whatsappNumber: cfg.whatsappNumber || '',
                    whatsappGroupJid: cfg.whatsappGroupJid || '',
                    telegramChatId: cfg.telegramChatId || '',
                    errorGroupJid: cfg.errorGroupJid || '',
                    errorChatId: cfg.errorChatId || ''
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
        if (savedConfig.whatsappNumber) savedList.push({ type: 'Command', platform: 'WhatsApp DM', value: savedConfig.whatsappNumber })
        if (savedConfig.whatsappGroupJid) savedList.push({ type: 'Command', platform: 'WhatsApp Group', value: savedConfig.whatsappGroupJid })
        if (savedConfig.telegramChatId) savedList.push({ type: 'Command', platform: 'Telegram', value: savedConfig.telegramChatId })
        if (savedConfig.errorGroupJid) savedList.push({ type: 'Error', platform: 'WhatsApp Group', value: savedConfig.errorGroupJid })
        if (savedConfig.errorChatId) savedList.push({ type: 'Error', platform: 'Telegram', value: savedConfig.errorChatId })
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
                        <div style={{ marginBottom: 'var(--spacing-md)' }}>
                            <h4 style={{ margin: '0 0 var(--spacing-sm)', color: 'var(--text-primary)', fontSize: 14 }}>
                                <MessageCircle size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                                Command Forwarding
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

                        <div style={{ marginBottom: 'var(--spacing-md)' }}>
                            <h4 style={{ margin: '0 0 var(--spacing-sm)', color: 'var(--color-error)', fontSize: 14 }}>
                                <Phone size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                                Error / Failed Forwarding
                            </h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                                <div>
                                    <label className="form-label">Error WA Group JID</label>
                                    <input className="form-input" placeholder="e.g. 120363xxx@g.us" value={form.errorGroupJid} onChange={e => setForm({ ...form, errorGroupJid: e.target.value })} />
                                </div>
                                <div>
                                    <label className="form-label">Error Telegram Chat ID</label>
                                    <input className="form-input" placeholder="e.g. -1001234567890" value={form.errorChatId} onChange={e => setForm({ ...form, errorChatId: e.target.value })} />
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
                                            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border-color)' }}>Destination</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {savedList.map((item, i) => (
                                            <tr key={i} style={{ borderBottom: i < savedList.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                                                <td style={{ padding: '8px 12px' }}>
                                                    <span style={{
                                                        background: item.type === 'Command' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                                                        color: item.type === 'Command' ? 'var(--color-success)' : 'var(--color-error)',
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
                                                    <code style={{ background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>
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
