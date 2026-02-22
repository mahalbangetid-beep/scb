import { useState, useEffect } from 'react'
import {
    Shield,
    Plus,
    Edit3,
    Trash2,
    Save,
    X,
    AlertCircle,
    CheckCircle,
    Loader2,
    Search,
    ToggleLeft,
    ToggleRight,
    Zap,
    RefreshCw,
    ChevronDown,
    Settings
} from 'lucide-react'
import api from '../services/api'

export default function GuaranteeRules() {
    const [loading, setLoading] = useState(true)
    const [rules, setRules] = useState([])
    const [config, setConfig] = useState(null)
    const [panels, setPanels] = useState([])
    const [selectedPanel, setSelectedPanel] = useState('')
    const [showAddModal, setShowAddModal] = useState(false)
    const [editingRule, setEditingRule] = useState(null)
    const [error, setError] = useState(null)
    const [success, setSuccess] = useState(null)
    const [testInput, setTestInput] = useState('')
    const [testResult, setTestResult] = useState(null)
    const [testing, setTesting] = useState(false)
    const [showConfigPanel, setShowConfigPanel] = useState(false)

    const [formData, setFormData] = useState({
        keyword: '',
        action: 'guarantee',
        days: 30,
        isLifetime: false,
        priority: 100,
        panelId: ''
    })

    useEffect(() => {
        fetchData()
    }, [selectedPanel])

    const fetchData = async () => {
        try {
            setLoading(true)
            const [rulesRes, configRes, panelsRes] = await Promise.all([
                api.get(`/guarantee/rules${selectedPanel ? `?panelId=${selectedPanel}` : ''}`),
                api.get('/guarantee/config'),
                api.get('/smm-panels').catch(() => ({ data: { data: [] } }))
            ])
            setRules(rulesRes.data?.data || rulesRes.data || [])
            setConfig(configRes.data?.data || configRes.data || null)
            setPanels(panelsRes.data?.data || [])
        } catch (err) {
            setError('Failed to load guarantee rules')
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const handleSaveRule = async () => {
        try {
            if (!formData.keyword.trim()) {
                setError('Keyword is required')
                return
            }

            if (editingRule) {
                await api.put(`/guarantee/rules/${editingRule.id}`, formData)
                setSuccess('Rule updated')
            } else {
                await api.post('/guarantee/rules', formData)
                setSuccess('Rule created')
            }

            setShowAddModal(false)
            setEditingRule(null)
            setFormData({ keyword: '', action: 'guarantee', days: 30, isLifetime: false, priority: 100, panelId: '' })
            fetchData()
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to save rule')
        }
        setTimeout(() => { setSuccess(null); setError(null); }, 3000)
    }

    const handleDeleteRule = async (id) => {
        if (!confirm('Delete this rule?')) return
        try {
            await api.delete(`/guarantee/rules/${id}`)
            setSuccess('Rule deleted')
            fetchData()
        } catch (err) {
            setError('Failed to delete rule')
        }
        setTimeout(() => { setSuccess(null); setError(null); }, 3000)
    }

    const handleToggleRule = async (rule) => {
        try {
            await api.put(`/guarantee/rules/${rule.id}`, { isActive: !rule.isActive })
            fetchData()
        } catch (err) {
            setError('Failed to toggle rule')
        }
    }

    const handleEditRule = (rule) => {
        setEditingRule(rule)
        setFormData({
            keyword: rule.keyword,
            action: rule.action,
            days: rule.days || 30,
            isLifetime: rule.isLifetime || false,
            priority: rule.priority || 100,
            panelId: rule.panelId || ''
        })
        setShowAddModal(true)
    }

    const handleTest = async () => {
        if (!testInput.trim()) return
        try {
            setTesting(true)
            const res = await api.post('/guarantee/test-rules', {
                serviceName: testInput,
                panelId: selectedPanel || null
            })
            setTestResult(res.data?.data || res.data)
        } catch (err) {
            setTestResult({ message: '❌ Test failed: ' + (err.response?.data?.message || err.message) })
        } finally {
            setTesting(false)
        }
    }

    const handleUpdateConfig = async (updates) => {
        try {
            await api.put('/guarantee/config', updates)
            setSuccess('Configuration updated')
            fetchData()
        } catch (err) {
            setError('Failed to update config')
        }
        setTimeout(() => { setSuccess(null); setError(null); }, 3000)
    }

    const noGuaranteeRules = rules.filter(r => r.action === 'no_guarantee')
    const guaranteeRules = rules.filter(r => r.action === 'guarantee')

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
                    <h1 className="page-title">Guarantee Rules</h1>
                    <p className="page-subtitle">Manage service guarantee detection rules per panel</p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                    <button className="btn btn-secondary" onClick={() => setShowConfigPanel(!showConfigPanel)}>
                        <Settings size={16} />
                        Config
                    </button>
                    <button className="btn btn-primary" onClick={() => { setEditingRule(null); setFormData({ keyword: '', action: 'guarantee', days: 30, isLifetime: false, priority: 100, panelId: '' }); setShowAddModal(true); }}>
                        <Plus size={16} />
                        Add Rule
                    </button>
                </div>
            </div>

            {success && (
                <div style={{ padding: 'var(--spacing-md)', background: 'var(--success-light)', borderRadius: 'var(--radius-lg)', marginBottom: 'var(--spacing-lg)', display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
                    <CheckCircle size={20} style={{ color: 'var(--success)' }} />
                    <span style={{ color: 'var(--success)' }}>{success}</span>
                </div>
            )}

            {error && (
                <div style={{ padding: 'var(--spacing-md)', background: 'var(--error-light)', borderRadius: 'var(--radius-lg)', marginBottom: 'var(--spacing-lg)', display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
                    <AlertCircle size={20} style={{ color: 'var(--error)' }} />
                    <span style={{ color: 'var(--error)' }}>{error}</span>
                </div>
            )}

            {/* Config Panel */}
            {showConfigPanel && config && (
                <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
                    <div className="card-header">
                        <h3 className="card-title">⚙️ Guarantee Configuration</h3>
                    </div>
                    <div style={{ padding: 'var(--spacing-lg)', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 'var(--spacing-md)' }}>
                        <div className="form-group">
                            <label className="form-label">Detection Method</label>
                            <select className="form-input" value={config.detectionMethod || 'manual'} onChange={e => handleUpdateConfig({ detectionMethod: e.target.value })}>
                                <option value="manual">Manual (Keyword Rules)</option>
                                <option value="api">API Based (refill field)</option>
                                <option value="both">Both (API + Manual fallback)</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Default Guarantee Days</label>
                            <input type="number" className="form-input" value={config.defaultDays} min={1} max={365}
                                onChange={e => handleUpdateConfig({ defaultDays: parseInt(e.target.value) || 30 })} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">No Guarantee Action</label>
                            <select className="form-input" value={config.noGuaranteeAction} onChange={e => handleUpdateConfig({ noGuaranteeAction: e.target.value })}>
                                <option value="DENY">Deny Refill</option>
                                <option value="ALLOW">Allow Refill</option>
                                <option value="ASK">Ask User</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Validation Enabled</label>
                            <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }}
                                onClick={() => handleUpdateConfig({ isEnabled: !config.isEnabled })}>
                                {config.isEnabled ? <><ToggleRight size={16} style={{ color: 'var(--success)' }} /> Enabled</> : <><ToggleLeft size={16} /> Disabled</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Panel Filter */}
            <div style={{ display: 'flex', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)', alignItems: 'center', flexWrap: 'wrap' }}>
                <select className="form-input" style={{ maxWidth: '300px' }} value={selectedPanel} onChange={e => setSelectedPanel(e.target.value)}>
                    <option value="">All Panels (Global Rules)</option>
                    {panels.map(p => (
                        <option key={p.id} value={p.id}>{p.alias || p.name || p.url}</option>
                    ))}
                </select>

                {/* Test Section */}
                <div style={{ display: 'flex', gap: 'var(--spacing-xs)', flex: 1, minWidth: '300px' }}>
                    <input className="form-input" placeholder="Test service name, e.g. 'Instagram Followers | 30 Days ♻️'"
                        value={testInput} onChange={e => { setTestInput(e.target.value); setTestResult(null); }}
                        onKeyDown={e => e.key === 'Enter' && handleTest()} />
                    <button className="btn btn-secondary" onClick={handleTest} disabled={testing}>
                        {testing ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                        Test
                    </button>
                </div>
            </div>

            {testResult && (
                <div className="card" style={{ marginBottom: 'var(--spacing-lg)', padding: 'var(--spacing-md)' }}>
                    <p style={{ margin: 0, fontSize: '0.95rem' }}>{testResult.message}</p>
                    {testResult.source && <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Source: {testResult.source} {testResult.matchedRule ? `→ "${testResult.matchedRule}"` : ''}</p>}
                </div>
            )}

            {/* No Guarantee Rules */}
            <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
                <div className="card-header" style={{ background: 'rgba(239, 68, 68, 0.1)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                        <span style={{ fontSize: '1.3rem' }}>🚫</span>
                        <div>
                            <h3 className="card-title">No Guarantee Keywords</h3>
                            <p className="card-subtitle">Service names containing these = no refill allowed</p>
                        </div>
                    </div>
                    <span className="badge badge-error">{noGuaranteeRules.length} rules</span>
                </div>
                <div style={{ padding: 'var(--spacing-md)' }}>
                    {noGuaranteeRules.length === 0 ? (
                        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 'var(--spacing-lg)' }}>No rules yet. Add keywords like "No Refill", "No Guarantee"</p>
                    ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-sm)' }}>
                            {noGuaranteeRules.map(rule => (
                                <div key={rule.id} style={{
                                    display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px',
                                    background: rule.isActive ? 'rgba(239, 68, 68, 0.08)' : 'var(--bg-tertiary)',
                                    borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)',
                                    opacity: rule.isActive ? 1 : 0.5
                                }}>
                                    <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{rule.keyword}</span>
                                    {rule.panelId && <span className="badge badge-info" style={{ fontSize: '0.65rem' }}>Panel</span>}
                                    <button onClick={() => handleToggleRule(rule)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}>
                                        {rule.isActive ? <ToggleRight size={16} style={{ color: 'var(--success)' }} /> : <ToggleLeft size={16} style={{ color: 'var(--text-secondary)' }} />}
                                    </button>
                                    <button onClick={() => handleEditRule(rule)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}>
                                        <Edit3 size={14} style={{ color: 'var(--text-secondary)' }} />
                                    </button>
                                    <button onClick={() => handleDeleteRule(rule.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}>
                                        <Trash2 size={14} style={{ color: 'var(--error)' }} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Guarantee Rules */}
            <div className="card">
                <div className="card-header" style={{ background: 'rgba(34, 197, 94, 0.1)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                        <span style={{ fontSize: '1.3rem' }}>♻️</span>
                        <div>
                            <h3 className="card-title">Guarantee Keywords</h3>
                            <p className="card-subtitle">Service names containing these = refill available with X days</p>
                        </div>
                    </div>
                    <span className="badge badge-success">{guaranteeRules.length} rules</span>
                </div>
                <div style={{ padding: 'var(--spacing-md)' }}>
                    {guaranteeRules.length === 0 ? (
                        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 'var(--spacing-lg)' }}>No rules yet. Add keywords like "30 Days ♻️"</p>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--spacing-sm)' }}>
                            {guaranteeRules.map(rule => (
                                <div key={rule.id} style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '10px 14px', background: rule.isActive ? 'rgba(34, 197, 94, 0.06)' : 'var(--bg-tertiary)',
                                    borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)',
                                    opacity: rule.isActive ? 1 : 0.5
                                }}>
                                    <div>
                                        <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{rule.keyword}</span>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--success)', marginLeft: '8px', fontWeight: 600 }}>
                                            → {rule.isLifetime ? 'Lifetime' : `${rule.days} Days`}
                                        </span>
                                        {rule.panelId && <span className="badge badge-info" style={{ fontSize: '0.6rem', marginLeft: '6px' }}>Panel</span>}
                                    </div>
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                        <button onClick={() => handleToggleRule(rule)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}>
                                            {rule.isActive ? <ToggleRight size={16} style={{ color: 'var(--success)' }} /> : <ToggleLeft size={16} style={{ color: 'var(--text-secondary)' }} />}
                                        </button>
                                        <button onClick={() => handleEditRule(rule)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}>
                                            <Edit3 size={14} style={{ color: 'var(--text-secondary)' }} />
                                        </button>
                                        <button onClick={() => handleDeleteRule(rule.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}>
                                            <Trash2 size={14} style={{ color: 'var(--error)' }} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Add/Edit Modal */}
            {showAddModal && (
                <div className="modal-overlay open" onClick={() => setShowAddModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                        <div className="modal-header">
                            <h3>{editingRule ? 'Edit Rule' : 'Add New Guarantee Rule'}</h3>
                            <button className="modal-close" onClick={() => setShowAddModal(false)}>&times;</button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label className="form-label">Keyword *</label>
                                <input className="form-input" placeholder="e.g. 30 Days ♻️ or No Refill"
                                    value={formData.keyword} onChange={e => setFormData({ ...formData, keyword: e.target.value })} />
                                <p className="form-hint">Text to search for in service names (case-insensitive)</p>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Action</label>
                                <select className="form-input" value={formData.action} onChange={e => setFormData({ ...formData, action: e.target.value })}>
                                    <option value="guarantee">✅ Has Guarantee (Refill Available)</option>
                                    <option value="no_guarantee">🚫 No Guarantee (No Refill)</option>
                                </select>
                            </div>

                            {formData.action === 'guarantee' && (
                                <>
                                    <div className="form-group">
                                        <label className="form-label">
                                            <input type="checkbox" checked={formData.isLifetime}
                                                onChange={e => setFormData({ ...formData, isLifetime: e.target.checked })}
                                                style={{ marginRight: '8px' }} />
                                            Lifetime Guarantee
                                        </label>
                                    </div>
                                    {!formData.isLifetime && (
                                        <div className="form-group">
                                            <label className="form-label">Guarantee Days</label>
                                            <input type="number" className="form-input" min={1} max={365}
                                                value={formData.days} onChange={e => setFormData({ ...formData, days: parseInt(e.target.value) || 30 })} />
                                        </div>
                                    )}
                                </>
                            )}

                            <div className="form-group">
                                <label className="form-label">Priority (lower = checked first)</label>
                                <input type="number" className="form-input" min={1} max={999}
                                    value={formData.priority} onChange={e => setFormData({ ...formData, priority: parseInt(e.target.value) || 100 })} />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Apply To Panel</label>
                                <select className="form-input" value={formData.panelId} onChange={e => setFormData({ ...formData, panelId: e.target.value })}>
                                    <option value="">All Panels (Global)</option>
                                    {panels.map(p => (
                                        <option key={p.id} value={p.id}>{p.alias || p.name || p.url}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleSaveRule}>
                                <Save size={16} />
                                {editingRule ? 'Update' : 'Create'} Rule
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
