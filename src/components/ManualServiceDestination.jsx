import { useState, useEffect } from 'react'
import { Save, Loader2, MapPin, MessageCircle, Phone } from 'lucide-react'
import api from '../services/api'

export default function ManualServiceDestination({ panelId }) {
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState(null)
    const [success, setSuccess] = useState(null)
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
                setForm({
                    whatsappNumber: cfg.whatsappNumber || '',
                    whatsappGroupJid: cfg.whatsappGroupJid || '',
                    telegramChatId: cfg.telegramChatId || '',
                    errorGroupJid: cfg.errorGroupJid || '',
                    errorChatId: cfg.errorChatId || ''
                })
            }
        } catch (e) { /* No config yet, that's fine */ }
        setLoading(false)
    }

    const handleSave = async () => {
        setSaving(true)
        setError(null)
        try {
            await api.post(`/provider-config/manual-destination`, {
                panelId,
                ...form
            })
            setSuccess('Destination saved successfully!')
            await fetchConfig()
        } catch (e) { setError(e.response?.data?.message || 'Failed to save') }
        setSaving(false)
    }

    if (!panelId) return <div className="empty-state"><p>Select a panel first</p></div>

    return (
        <div>
            <div style={{ marginBottom: 'var(--spacing-md)' }}>
                <h3 style={{ margin: '0 0 var(--spacing-xs)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <MapPin size={18} /> Manual Service Destination
                </h3>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                    When an order has no provider (manual mode), commands will be forwarded to these destinations. Multiple WA numbers can be separated by commas.
                </p>
            </div>

            {error && <div className="alert alert-error" style={{ marginBottom: 'var(--spacing-md)' }}>{error}</div>}
            {success && <div className="alert alert-success" style={{ marginBottom: 'var(--spacing-md)' }}>{success}</div>}

            {loading ? (
                <div style={{ textAlign: 'center', padding: 'var(--spacing-xl)' }}><Loader2 size={24} className="animate-spin" /></div>
            ) : (
                <>
                    {/* Normal forwarding destinations */}
                    <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                        <h4 style={{ margin: '0 0 var(--spacing-sm)', color: 'var(--text-primary)', fontSize: 14 }}>
                            <MessageCircle size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                            Command Forwarding (Refill/Cancel/Speed Up)
                        </h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-sm)' }}>
                            <div>
                                <label className="form-label">WhatsApp DM Number(s)</label>
                                <input className="form-input" placeholder="e.g. 628123456789, 628987654321" value={form.whatsappNumber} onChange={e => setForm({ ...form, whatsappNumber: e.target.value })} />
                                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Separate multiple numbers with commas</span>
                            </div>
                            <div>
                                <label className="form-label">WhatsApp Group JID</label>
                                <input className="form-input" placeholder="e.g. 120363xxx@g.us" value={form.whatsappGroupJid} onChange={e => setForm({ ...form, whatsappGroupJid: e.target.value })} />
                            </div>
                            <div>
                                <label className="form-label">Telegram Chat ID / Username</label>
                                <input className="form-input" placeholder="e.g. -1001234567890 or @username" value={form.telegramChatId} onChange={e => setForm({ ...form, telegramChatId: e.target.value })} />
                            </div>
                        </div>
                    </div>

                    {/* Error forwarding destinations */}
                    <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                        <h4 style={{ margin: '0 0 var(--spacing-sm)', color: 'var(--color-error)', fontSize: 14 }}>
                            <Phone size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                            Error/Failed Order Forwarding
                        </h4>
                        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 var(--spacing-sm)' }}>
                            When an order status is Error or Failed, it will be forwarded here automatically.
                        </p>
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

                    <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Destination
                    </button>
                </>
            )}
        </div>
    )
}
