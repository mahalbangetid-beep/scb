import { useState, useEffect } from 'react'
import {
    FileText, Save, Loader2, AlertCircle, CheckCircle2,
    Image, Palette, Building2, Globe, Phone, Mail,
    RefreshCw, Eye, X, Type
} from 'lucide-react'
import api from '../../services/api'

export default function InvoiceTemplate() {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState(null)
    const [success, setSuccess] = useState(null)
    const [showPreview, setShowPreview] = useState(false)

    const [form, setForm] = useState({
        companyName: 'DICREWA',
        tagline: 'SMM Automation Platform',
        address: '',
        phone: '',
        email: 'support@dicrewa.com',
        website: '',
        logoUrl: '',
        accentColor: '#6c5ce7',
        footerText: 'Thank you for your payment!',
        footerSubtext: 'This invoice was generated automatically.',
    })

    useEffect(() => {
        fetchConfig()
    }, [])

    useEffect(() => {
        if (success || error) {
            const t = setTimeout(() => { setSuccess(null); setError(null) }, 4000)
            return () => clearTimeout(t)
        }
    }, [success, error])

    const fetchConfig = async () => {
        try {
            setLoading(true)
            const res = await api.get('/admin/invoice-template')
            if (res.data) {
                setForm(prev => ({ ...prev, ...res.data }))
            }
        } catch (err) {
            // If 404 or no config yet, keep defaults
            console.warn('No invoice template config found, using defaults')
        } finally {
            setLoading(false)
        }
    }

    const handleSave = async () => {
        try {
            setSaving(true)
            setError(null)
            await api.put('/admin/invoice-template', form)
            setSuccess('Invoice template saved successfully!')
        } catch (err) {
            setError(err.error?.message || err.message || 'Failed to save template')
        } finally {
            setSaving(false)
        }
    }

    const updateField = (key, value) => {
        setForm(prev => ({ ...prev, [key]: value }))
    }

    if (loading) {
        return (
            <div className="it-page">
                <div className="it-loading">
                    <Loader2 className="it-spinner" size={32} />
                    <p>Loading template settings...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="it-page">
            {/* Header */}
            <div className="it-header">
                <div className="it-header-left">
                    <div className="it-header-icon">
                        <FileText size={28} />
                    </div>
                    <div>
                        <h1>Invoice Template</h1>
                        <p>Customize your PDF invoice design and company details</p>
                    </div>
                </div>
                <div className="it-header-actions">
                    <button className="it-btn it-btn-ghost" onClick={() => setShowPreview(true)}>
                        <Eye size={16} /> Preview
                    </button>
                    <button className="it-btn it-btn-primary" onClick={handleSave} disabled={saving}>
                        {saving ? <Loader2 className="it-spinner" size={16} /> : <Save size={16} />}
                        Save Changes
                    </button>
                </div>
            </div>

            {/* Alerts */}
            {error && (
                <div className="it-alert it-alert-error">
                    <AlertCircle size={18} />
                    <span>{error}</span>
                    <button onClick={() => setError(null)}><X size={14} /></button>
                </div>
            )}
            {success && (
                <div className="it-alert it-alert-success">
                    <CheckCircle2 size={18} />
                    <span>{success}</span>
                </div>
            )}

            <div className="it-grid">
                {/* Company Info Section */}
                <div className="it-section">
                    <div className="it-section-header">
                        <Building2 size={18} />
                        <h2>Company Information</h2>
                    </div>
                    <div className="it-section-body">
                        <div className="it-field">
                            <label>Company Name</label>
                            <input
                                type="text"
                                value={form.companyName}
                                onChange={e => updateField('companyName', e.target.value)}
                                placeholder="Your Company Name"
                            />
                            <span className="it-hint">Displayed as the main heading on the invoice</span>
                        </div>
                        <div className="it-field">
                            <label>Tagline / Subtitle</label>
                            <input
                                type="text"
                                value={form.tagline}
                                onChange={e => updateField('tagline', e.target.value)}
                                placeholder="e.g. SMM Automation Platform"
                            />
                        </div>
                        <div className="it-field">
                            <label><Mail size={14} /> Email</label>
                            <input
                                type="email"
                                value={form.email}
                                onChange={e => updateField('email', e.target.value)}
                                placeholder="billing@company.com"
                            />
                        </div>
                        <div className="it-field">
                            <label><Phone size={14} /> Phone</label>
                            <input
                                type="text"
                                value={form.phone}
                                onChange={e => updateField('phone', e.target.value)}
                                placeholder="+1 234 567 8900"
                            />
                        </div>
                        <div className="it-field">
                            <label><Globe size={14} /> Website</label>
                            <input
                                type="text"
                                value={form.website}
                                onChange={e => updateField('website', e.target.value)}
                                placeholder="https://yoursite.com"
                            />
                        </div>
                        <div className="it-field it-field-full">
                            <label>Address</label>
                            <textarea
                                value={form.address}
                                onChange={e => updateField('address', e.target.value)}
                                placeholder="123 Business Street, Suite 100&#10;City, State 12345&#10;Country"
                                rows={3}
                            />
                        </div>
                    </div>
                </div>

                {/* Branding Section */}
                <div className="it-section">
                    <div className="it-section-header">
                        <Palette size={18} />
                        <h2>Branding & Design</h2>
                    </div>
                    <div className="it-section-body">
                        <div className="it-field">
                            <label><Image size={14} /> Logo URL</label>
                            <input
                                type="text"
                                value={form.logoUrl}
                                onChange={e => updateField('logoUrl', e.target.value)}
                                placeholder="https://yoursite.com/logo.png"
                            />
                            <span className="it-hint">Direct URL to your logo image (PNG/JPG, max 200x80px recommended)</span>
                        </div>
                        {form.logoUrl && (
                            <div className="it-logo-preview">
                                <span className="it-preview-label">Logo Preview:</span>
                                <img
                                    src={form.logoUrl}
                                    alt="Logo"
                                    onError={e => { e.target.style.display = 'none' }}
                                    style={{ maxWidth: 180, maxHeight: 60, objectFit: 'contain' }}
                                />
                            </div>
                        )}
                        <div className="it-field">
                            <label><Palette size={14} /> Accent Color</label>
                            <div className="it-color-picker">
                                <input
                                    type="color"
                                    value={form.accentColor}
                                    onChange={e => updateField('accentColor', e.target.value)}
                                />
                                <input
                                    type="text"
                                    value={form.accentColor}
                                    onChange={e => updateField('accentColor', e.target.value)}
                                    placeholder="#6c5ce7"
                                    pattern="^#[0-9a-fA-F]{6}$"
                                    style={{ maxWidth: 120 }}
                                />
                                <div
                                    className="it-color-swatch"
                                    style={{ background: form.accentColor }}
                                />
                            </div>
                            <span className="it-hint">Used for header, divider, and total row in the PDF</span>
                        </div>

                        {/* Quick color presets */}
                        <div className="it-color-presets">
                            <span className="it-preset-label">Presets:</span>
                            {['#6c5ce7', '#2d3436', '#e17055', '#00b894', '#0984e3', '#6366f1', '#d63031', '#fdcb6e'].map(c => (
                                <button
                                    key={c}
                                    className={`it-preset-btn ${form.accentColor === c ? 'active' : ''}`}
                                    style={{ background: c }}
                                    onClick={() => updateField('accentColor', c)}
                                    title={c}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer Section */}
                <div className="it-section it-section-full">
                    <div className="it-section-header">
                        <Type size={18} />
                        <h2>Footer Text</h2>
                    </div>
                    <div className="it-section-body it-footer-section">
                        <div className="it-field">
                            <label>Footer Message</label>
                            <input
                                type="text"
                                value={form.footerText}
                                onChange={e => updateField('footerText', e.target.value)}
                                placeholder="Thank you for your payment!"
                            />
                            <span className="it-hint">Primary footer text shown at the bottom of the invoice</span>
                        </div>
                        <div className="it-field">
                            <label>Footer Subtext</label>
                            <input
                                type="text"
                                value={form.footerSubtext}
                                onChange={e => updateField('footerSubtext', e.target.value)}
                                placeholder="This invoice was generated automatically by Your Company."
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Live Preview Modal */}
            {showPreview && (
                <div className="it-modal-overlay" onClick={() => setShowPreview(false)}>
                    <div className="it-modal" onClick={e => e.stopPropagation()}>
                        <div className="it-modal-header">
                            <h3><Eye size={18} /> Invoice Preview</h3>
                            <button onClick={() => setShowPreview(false)}><X size={20} /></button>
                        </div>
                        <div className="it-modal-body">
                            <div className="it-preview-card">
                                {/* Header */}
                                <div className="it-preview-header" style={{ borderBottom: `3px solid ${form.accentColor}` }}>
                                    <div>
                                        {form.logoUrl ? (
                                            <img src={form.logoUrl} alt="Logo" style={{ maxHeight: 40, marginBottom: 6 }}
                                                onError={e => { e.target.style.display = 'none' }} />
                                        ) : null}
                                        <div style={{ fontSize: 20, fontWeight: 700, color: form.accentColor }}>
                                            {form.companyName || 'Company Name'}
                                        </div>
                                        <div style={{ fontSize: 10, color: '#999' }}>{form.tagline}</div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: 18, fontWeight: 700 }}>INVOICE</div>
                                        <div style={{ fontSize: 11, color: '#666' }}>INV-202604-0001</div>
                                        <div style={{ fontSize: 10, color: '#888' }}>April 2, 2026</div>
                                    </div>
                                </div>

                                {/* From / Bill To */}
                                <div style={{ display: 'flex', gap: 24, margin: '16px 0' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 9, color: '#999', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>From</div>
                                        <div style={{ fontSize: 11, fontWeight: 600 }}>{form.companyName}</div>
                                        {form.address && <div style={{ fontSize: 10, color: '#666', whiteSpace: 'pre-line' }}>{form.address}</div>}
                                        {form.email && <div style={{ fontSize: 10, color: '#666' }}>{form.email}</div>}
                                        {form.phone && <div style={{ fontSize: 10, color: '#666' }}>{form.phone}</div>}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 9, color: '#999', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Bill To</div>
                                        <div style={{ fontSize: 11, fontWeight: 600 }}>John Doe</div>
                                        <div style={{ fontSize: 10, color: '#666' }}>john@example.com</div>
                                        <div style={{ fontSize: 10, color: '#666' }}>@johndoe</div>
                                    </div>
                                </div>

                                {/* Items */}
                                <div style={{ border: '1px solid #eee', borderRadius: 6, overflow: 'hidden', margin: '12px 0' }}>
                                    <div style={{
                                        display: 'grid', gridTemplateColumns: '1fr 60px 80px',
                                        padding: '8px 12px', background: form.accentColor, color: '#fff',
                                        fontSize: 10, fontWeight: 600, textTransform: 'uppercase'
                                    }}>
                                        <span>Description</span>
                                        <span style={{ textAlign: 'center' }}>Qty</span>
                                        <span style={{ textAlign: 'right' }}>Amount</span>
                                    </div>
                                    <div style={{
                                        display: 'grid', gridTemplateColumns: '1fr 60px 80px',
                                        padding: '10px 12px', fontSize: 11, background: '#f9f9f9'
                                    }}>
                                        <span>Credit Top-Up via eSewa (500 NPR)</span>
                                        <span style={{ textAlign: 'center' }}>1</span>
                                        <span style={{ textAlign: 'right' }}>$3.72</span>
                                    </div>
                                    <div style={{
                                        display: 'flex', justifyContent: 'space-between',
                                        padding: '10px 12px', borderTop: `2px solid ${form.accentColor}`,
                                        fontWeight: 700, fontSize: 13
                                    }}>
                                        <span>Total</span>
                                        <span style={{ color: form.accentColor }}>$3.72 USD</span>
                                    </div>
                                </div>

                                {/* Footer */}
                                <div style={{ marginTop: 20, paddingTop: 12, borderTop: '1px solid #eee', textAlign: 'center' }}>
                                    <div style={{ fontSize: 11, color: '#888' }}>{form.footerText}</div>
                                    <div style={{ fontSize: 9, color: '#aaa', marginTop: 2 }}>{form.footerSubtext}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <style>{styles}</style>
        </div>
    )
}

const styles = `
    .it-page {
        padding: 1.5rem;
        max-width: 1200px;
        margin: 0 auto;
    }
    .it-loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 300px;
        color: var(--text-secondary);
        gap: 12px;
    }
    @keyframes itSpin { to { transform: rotate(360deg); } }
    .it-spinner { animation: itSpin 1s linear infinite; }

    /* Header */
    .it-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 1.5rem;
        flex-wrap: wrap;
        gap: 1rem;
    }
    .it-header-left {
        display: flex;
        align-items: center;
        gap: 1rem;
    }
    .it-header-icon {
        width: 52px;
        height: 52px;
        border-radius: 14px;
        background: linear-gradient(135deg, #6c5ce7, #a55eea);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        box-shadow: 0 4px 15px rgba(108, 92, 231, 0.3);
    }
    .it-header h1 {
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--text-primary);
        margin: 0;
    }
    .it-header p {
        font-size: 0.875rem;
        color: var(--text-secondary);
        margin: 0.15rem 0 0;
    }
    .it-header-actions {
        display: flex;
        gap: 0.5rem;
    }

    /* Buttons */
    .it-btn {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.6rem 1.2rem;
        border-radius: 10px;
        font-size: 0.875rem;
        font-weight: 600;
        border: none;
        cursor: pointer;
        transition: all 0.2s ease;
        font-family: inherit;
    }
    .it-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .it-btn-ghost {
        background: var(--bg-tertiary);
        color: var(--text-secondary);
        border: 1px solid var(--border-color);
    }
    .it-btn-ghost:hover { background: var(--bg-card-hover); color: var(--text-primary); }
    .it-btn-primary {
        background: linear-gradient(135deg, #6c5ce7, #a55eea);
        color: white;
        box-shadow: 0 2px 10px rgba(108, 92, 231, 0.3);
    }
    .it-btn-primary:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 4px 15px rgba(108, 92, 231, 0.4);
    }

    /* Alerts */
    .it-alert {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.875rem 1.25rem;
        border-radius: 12px;
        margin-bottom: 1.25rem;
        font-size: 0.875rem;
        font-weight: 500;
        animation: itSlideDown 0.3s ease;
    }
    @keyframes itSlideDown {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
    }
    .it-alert-error {
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.25);
        color: #ef4444;
    }
    .it-alert-success {
        background: rgba(16, 185, 129, 0.1);
        border: 1px solid rgba(16, 185, 129, 0.25);
        color: #10b981;
    }
    .it-alert button {
        margin-left: auto;
        background: none;
        border: none;
        cursor: pointer;
        color: inherit;
        padding: 2px;
    }

    /* Grid layout */
    .it-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 1.25rem;
    }
    @media (max-width: 768px) {
        .it-grid { grid-template-columns: 1fr; }
    }
    .it-section-full { grid-column: 1 / -1; }

    /* Sections */
    .it-section {
        background: var(--bg-card);
        border: 1px solid var(--border-color);
        border-radius: 14px;
        overflow: hidden;
    }
    .it-section-header {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        padding: 1rem 1.25rem;
        background: var(--bg-tertiary);
        border-bottom: 1px solid var(--border-color);
        color: var(--text-primary);
    }
    .it-section-header h2 {
        font-size: 0.95rem;
        font-weight: 600;
        margin: 0;
    }
    .it-section-body {
        padding: 1.25rem;
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    .it-footer-section {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
    }
    @media (max-width: 768px) {
        .it-footer-section { grid-template-columns: 1fr; }
    }

    /* Fields */
    .it-field { display: flex; flex-direction: column; gap: 0.35rem; }
    .it-field-full { grid-column: 1 / -1; }
    .it-field label {
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--text-secondary);
        display: flex;
        align-items: center;
        gap: 5px;
    }
    .it-field input,
    .it-field textarea {
        padding: 0.6rem 0.85rem;
        border: 1px solid var(--border-color);
        border-radius: 8px;
        font-size: 0.875rem;
        color: var(--text-primary);
        background: var(--bg-secondary);
        font-family: inherit;
        transition: all 0.2s;
        outline: none;
    }
    .it-field input:focus,
    .it-field textarea:focus {
        border-color: #6c5ce7;
        box-shadow: 0 0 0 3px rgba(108, 92, 231, 0.15);
    }
    .it-field textarea { resize: vertical; min-height: 70px; }
    .it-hint {
        font-size: 0.7rem;
        color: var(--text-muted);
    }

    /* Color picker */
    .it-color-picker {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    .it-color-picker input[type="color"] {
        width: 38px;
        height: 38px;
        border: 2px solid var(--border-color);
        border-radius: 8px;
        cursor: pointer;
        padding: 2px;
    }
    .it-color-swatch {
        width: 28px;
        height: 28px;
        border-radius: 6px;
        border: 2px solid rgba(0,0,0,0.1);
    }
    .it-color-presets {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
    }
    .it-preset-label {
        font-size: 0.75rem;
        color: var(--text-muted);
        margin-right: 4px;
    }
    .it-preset-btn {
        width: 24px;
        height: 24px;
        border-radius: 6px;
        border: 2px solid transparent;
        cursor: pointer;
        transition: all 0.15s;
    }
    .it-preset-btn:hover {
        transform: scale(1.15);
    }
    .it-preset-btn.active {
        border-color: var(--text-primary);
        box-shadow: 0 0 0 2px var(--bg-card);
    }

    /* Logo preview */
    .it-logo-preview {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        background: var(--bg-secondary);
        border: 1px dashed var(--border-color);
        border-radius: 8px;
    }
    .it-preview-label {
        font-size: 0.75rem;
        color: var(--text-muted);
    }

    /* Preview Modal */
    .it-modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        padding: 20px;
    }
    .it-modal {
        background: var(--bg-card);
        border-radius: 16px;
        width: 100%;
        max-width: 620px;
        max-height: 85vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        box-shadow: 0 25px 50px rgba(0,0,0,0.3);
    }
    .it-modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid var(--border-color);
    }
    .it-modal-header h3 {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 0;
        font-size: 1rem;
    }
    .it-modal-header button {
        background: none;
        border: none;
        cursor: pointer;
        color: var(--text-secondary);
        padding: 4px;
    }
    .it-modal-body {
        padding: 20px;
        overflow-y: auto;
    }
    .it-preview-card {
        background: #fff;
        color: #333;
        border-radius: 10px;
        padding: 28px;
        box-shadow: 0 2px 20px rgba(0,0,0,0.08);
        font-family: 'Segoe UI', sans-serif;
    }
    .it-preview-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        padding-bottom: 16px;
        margin-bottom: 16px;
    }
`
