import { useState, useEffect } from 'react'
import {
    MessageSquare,
    Save,
    RefreshCw,
    AlertCircle,
    CheckCircle,
    Loader2,
    Edit3,
    Eye,
    RotateCcw,
    ChevronDown,
    ChevronRight,
    Copy,
    Check
} from 'lucide-react'
import api from '../services/api'

const TEMPLATE_CATEGORIES = {
    status: {
        label: 'Status Responses',
        icon: '📊',
        templates: ['STATUS_SUCCESS', 'STATUS_NOT_FOUND', 'STATUS_ERROR']
    },
    refill: {
        label: 'Refill Responses',
        icon: '🔄',
        templates: ['REFILL_SUCCESS', 'REFILL_PENDING', 'REFILL_STATUS_INVALID', 'REFILL_NO_GUARANTEE', 'REFILL_EXPIRED', 'REFILL_FORWARDED', 'REFILL_ERROR']
    },
    cancel: {
        label: 'Cancel Responses',
        icon: '❌',
        templates: ['CANCEL_SUCCESS', 'CANCEL_STATUS_INVALID', 'CANCEL_ERROR']
    },
    speedup: {
        label: 'Speedup Responses',
        icon: '⚡',
        templates: ['SPEEDUP_SUCCESS', 'SPEEDUP_ERROR']
    },
    bulk: {
        label: 'Bulk Orders (Multiple Orders)',
        icon: '📦',
        templates: ['BULK_HEADER', 'BULK_SUCCESS_LABEL', 'BULK_ALREADY_CANCELLED', 'BULK_ALREADY_COMPLETED', 'BULK_PARTIAL_REFUND', 'BULK_COOLDOWN', 'BULK_COOLDOWN_HINT', 'BULK_NOT_FOUND', 'BULK_OTHER_ERRORS', 'BULK_SUMMARY']
    },
    general: {
        label: 'General Responses',
        icon: '💬',
        templates: ['COOLDOWN', 'DISABLED', 'ACCESS_DENIED']
    }
}

export default function ResponseTemplates() {
    const [loading, setLoading] = useState(true)
    const [templates, setTemplates] = useState([])
    const [expandedCategories, setExpandedCategories] = useState(['status', 'refill'])
    const [editingTemplate, setEditingTemplate] = useState(null)
    const [editValue, setEditValue] = useState('')
    const [previewData, setPreviewData] = useState(null)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [error, setError] = useState(null)

    useEffect(() => {
        fetchTemplates()
    }, [])

    const fetchTemplates = async () => {
        try {
            setLoading(true)
            const res = await api.get('/templates')
            setTemplates(res.data || [])
        } catch (err) {
            console.error('Failed to fetch templates:', err)
            setError('Failed to load templates')
        } finally {
            setLoading(false)
        }
    }

    const handleEdit = (template) => {
        setEditingTemplate(template.command)
        setEditValue(template.template)
        setPreviewData(null)
    }

    const handlePreview = async () => {
        try {
            const res = await api.post('/templates/preview', {
                command: editingTemplate,
                template: editValue
            })
            setPreviewData(res.data)
        } catch (err) {
            console.error('Preview failed:', err)
        }
    }

    const handleSave = async () => {
        try {
            setSaving(true)
            await api.put(`/templates/${editingTemplate}`, {
                template: editValue
            })
            setSaved(true)
            setTimeout(() => setSaved(false), 3000)
            setEditingTemplate(null)
            fetchTemplates()
        } catch (err) {
            setError('Failed to save template')
        } finally {
            setSaving(false)
        }
    }

    const handleReset = async (command) => {
        if (!confirm('Reset this template to default?')) return
        try {
            await api.delete(`/templates/${command}`)
            fetchTemplates()
        } catch (err) {
            setError('Failed to reset template')
        }
    }

    const handleResetAll = async () => {
        if (!confirm('Reset ALL templates to default? This cannot be undone.')) return
        try {
            await api.post('/templates/reset-all')
            fetchTemplates()
        } catch (err) {
            setError('Failed to reset templates')
        }
    }

    const toggleCategory = (category) => {
        setExpandedCategories(prev =>
            prev.includes(category)
                ? prev.filter(c => c !== category)
                : [...prev, category]
        )
    }

    const getTemplateByCommand = (command) => {
        return templates.find(t => t.command === command) || { command, template: '', isCustom: false }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="animate-spin" size={48} style={{ color: 'var(--primary-500)' }} />
            </div>
        )
    }

    return (
        <div className="animate-fade-in">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Response Templates</h1>
                    <p className="page-subtitle">Customize bot response messages for different scenarios</p>
                </div>
                <button className="btn btn-secondary" onClick={handleResetAll}>
                    <RotateCcw size={16} />
                    Reset All to Default
                </button>
            </div>

            {saved && (
                <div style={{ padding: 'var(--spacing-md)', background: 'var(--success-light)', borderRadius: 'var(--radius-lg)', marginBottom: 'var(--spacing-lg)', display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
                    <CheckCircle size={20} style={{ color: 'var(--success)' }} />
                    <span style={{ color: 'var(--success)' }}>Template saved successfully!</span>
                </div>
            )}

            {error && (
                <div style={{ padding: 'var(--spacing-md)', background: 'var(--error-light)', borderRadius: 'var(--radius-lg)', marginBottom: 'var(--spacing-lg)', display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
                    <AlertCircle size={20} style={{ color: 'var(--error)' }} />
                    <span style={{ color: 'var(--error)' }}>{error}</span>
                </div>
            )}

            {/* Edit Modal */}
            {editingTemplate && (
                <div className="modal-overlay open" onClick={() => setEditingTemplate(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px' }}>
                        <div className="modal-header">
                            <h3>Edit Template: {editingTemplate}</h3>
                            <button className="modal-close" onClick={() => setEditingTemplate(null)}>&times;</button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label className="form-label">Template Content</label>
                                <textarea
                                    className="form-input"
                                    rows={6}
                                    value={editValue}
                                    onChange={e => setEditValue(e.target.value)}
                                    style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}
                                />
                                <p className="form-hint">
                                    Available variables: {'{order_id}'}, {'{status}'}, {'{service}'}, {'{link}'}, {'{remains}'}, {'{start_count}'}, {'{charge}'}, {'{provider}'}, {'{guarantee}'}, {'{error}'}
                                </p>
                            </div>

                            <button className="btn btn-secondary" onClick={handlePreview} style={{ marginBottom: 'var(--spacing-md)' }}>
                                <Eye size={16} />
                                Preview
                            </button>

                            {previewData && (
                                <div style={{ background: 'var(--bg-tertiary)', padding: 'var(--spacing-md)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--spacing-md)' }}>
                                    <strong style={{ display: 'block', marginBottom: 'var(--spacing-sm)' }}>Preview:</strong>
                                    <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit' }}>{previewData.preview}</pre>
                                </div>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setEditingTemplate(null)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                Save Template
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Template Categories */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                {Object.entries(TEMPLATE_CATEGORIES).map(([key, category]) => (
                    <div key={key} className="card" style={{ overflow: 'hidden' }}>
                        <div
                            className="card-header"
                            style={{ cursor: 'pointer', background: 'var(--bg-tertiary)' }}
                            onClick={() => toggleCategory(key)}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
                                <span style={{ fontSize: '1.5rem' }}>{category.icon}</span>
                                <div>
                                    <h3 className="card-title">{category.label}</h3>
                                    <p className="card-subtitle">{category.templates.length} templates</p>
                                </div>
                            </div>
                            {expandedCategories.includes(key) ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                        </div>

                        {expandedCategories.includes(key) && (
                            <div style={{ padding: 'var(--spacing-md)' }}>
                                {category.templates.map(command => {
                                    const template = getTemplateByCommand(command)
                                    return (
                                        <div key={command} style={{
                                            padding: 'var(--spacing-md)',
                                            borderBottom: '1px solid var(--border-color)',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'flex-start',
                                            gap: 'var(--spacing-md)'
                                        }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-xs)' }}>
                                                    <code style={{ background: 'var(--bg-tertiary)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem' }}>
                                                        {command}
                                                    </code>
                                                    {template.isCustom && (
                                                        <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>Custom</span>
                                                    )}
                                                </div>
                                                <p style={{
                                                    fontSize: '0.85rem',
                                                    color: 'var(--text-secondary)',
                                                    whiteSpace: 'pre-wrap',
                                                    margin: 0,
                                                    maxHeight: '60px',
                                                    overflow: 'hidden'
                                                }}>
                                                    {template.template || template.defaultTemplate || 'No template set'}
                                                </p>
                                            </div>
                                            <div style={{ display: 'flex', gap: 'var(--spacing-xs)', flexShrink: 0 }}>
                                                <button className="btn btn-sm btn-secondary" onClick={() => handleEdit(template)}>
                                                    <Edit3 size={14} />
                                                </button>
                                                {template.isCustom && (
                                                    <button className="btn btn-sm btn-ghost" onClick={() => handleReset(command)}>
                                                        <RotateCcw size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <style>{`
                .btn-sm {
                    padding: 6px 10px;
                    font-size: 0.75rem;
                }
                .btn-ghost {
                    background: transparent;
                    color: var(--text-secondary);
                }
                .btn-ghost:hover {
                    background: var(--bg-tertiary);
                }
            `}</style>
        </div>
    )
}
