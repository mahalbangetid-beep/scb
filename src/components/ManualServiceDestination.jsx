import { useState, useEffect } from 'react'
import { Save, Loader2, MapPin, MessageCircle, Phone, CheckCircle, Edit3 } from 'lucide-react'
import api from '../services/api'

export default function ManualServiceDestination({ panelId }) {
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState(null)
    const [success, setSuccess] = useState(null)
    const [editing, setEditing] = useState(false)
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
            } else {
                setSavedConfig(null)
                setEditing(true)
            }
        } catch (e) {
            setSavedConfig(null)
            setEditing(true)
        }
        setLoading(false)
    }

    const handleSave = async () => {
        setSaving(true)
        setError(null)
        try {
            const res = await api.post(`/provider-config/manual-destination`, {
                panelId,
                ...form
            })
            if (res.data?.data) {
                setSavedConfig(res.data.data)
            }
            setSuccess('Destination saved successfully!')
            setEditing(false)
        } catch (e) { setError(e.response?.data?.message || 'Failed to save') }
        setSaving(false)
    }

    const hasAnyDestination = (cfg) => {
        return cfg && (cfg.whatsappNumber || cfg.whatsappGroupJid || cfg.telegramChatId || cfg.errorGroupJid || cfg.errorChatId)
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
                <>
                    {/* ==================== SAVED CONFIGURATION DISPLAY ==================== */}
                    {savedConfig && hasAnyDestination(savedConfig) && !editing && (
                        <div style={{
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: 'var(--radius-md)',
                            padding: 'var(--spacing-md)',
                            marginBottom: 'var(--spacing-lg)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-sm)' }}>
                                <h4 style={{ margin: 0, color: 'var(--color-success)', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <CheckCircle size={16} /> Destination Configured
                                </h4>
                                <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <Edit3 size={14} /> Edit
                                </button>
                            </div>

                            {/* Command forwarding */}
                            <div style={{ marginBottom: 'var(--spacing-sm)' }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                                    Command Forwarding (Refill/Cancel/Speed Up):
                                </span>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                    {savedConfig.whatsappNumber && (
                                        <span style={{ background: 'var(--bg-tertiary)', padding: '4px 10px', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
                                            📱 WA: {savedConfig.whatsappNumber}
                                        </span>
                                    )}
                                    {savedConfig.whatsappGroupJid && (
                                        <span style={{ background: 'var(--bg-tertiary)', padding: '4px 10px', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
                                            👥 Group: {savedConfig.whatsappGroupJid}
                                        </span>
                                    )}
                                    {savedConfig.telegramChatId && (
                                        <span style={{ background: 'var(--bg-tertiary)', padding: '4px 10px', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
                                            ✈️ TG: {savedConfig.telegramChatId}
                                        </span>
                                    )}
                                    {!savedConfig.whatsappNumber && !savedConfig.whatsappGroupJid && !savedConfig.telegramChatId && (
                                        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No command destination set</span>
                                    )}
                                </div>
                            </div>

                            {/* Error forwarding */}
                            {(savedConfig.errorGroupJid || savedConfig.errorChatId) && (
                                <div>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-error)', display: 'block', marginBottom: 4 }}>
                                        Error/Failed Forwarding:
                                    </span>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                        {savedConfig.errorGroupJid && (
                                            <span style={{ background: 'var(--bg-tertiary)', padding: '4px 10px', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
                                                ⚠️ Error Group: {savedConfig.errorGroupJid}
                                            </span>
                                        )}
                                        {savedConfig.errorChatId && (
                                            <span style={{ background: 'var(--bg-tertiary)', padding: '4px 10px', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
                                                ⚠️ Error TG: {savedConfig.errorChatId}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ==================== EDIT FORM ==================== */}
                    {(editing || !savedConfig || !hasAnyDestination(savedConfig)) && (
                        <>
                            <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                                <h4 style={{ margin: '0 0 var(--spacing-sm)', color: 'var(--text-primary)', fontSize: 14 }}>
                                    <MessageCircle size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                                    Command Forwarding (Refill/Cancel/Speed Up)
                                </h4>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-sm)' }}>
                                    <div>
                                        <label className="form-label">WhatsApp DM Number(s)</label>
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

                            <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                                <h4 style={{ margin: '0 0 var(--spacing-sm)', color: 'var(--color-error)', fontSize: 14 }}>
                                    <Phone size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                                    Error/Failed Order Forwarding
                                </h4>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-sm)' }}>
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

                            <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Destination
                                </button>
                                {savedConfig && hasAnyDestination(savedConfig) && (
                                    <button className="btn btn-secondary" onClick={() => setEditing(false)}>
                                        Cancel
                                    </button>
                                )}
                            </div>
                        </>
                    )}
                </>
            )}
        </div>
    )
}
