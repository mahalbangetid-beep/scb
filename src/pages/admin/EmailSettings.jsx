import { useState, useEffect } from 'react';
import DOMPurify from 'dompurify';
import {
    Mail, Send, FileText, Search, Edit3, Trash2, Plus,
    ToggleLeft, ToggleRight, AlertTriangle, CheckCircle2,
    Loader2, RefreshCw, TestTube, Clock,
    Eye, X, Zap, Settings
} from 'lucide-react';
import api from '../../services/api';

const EmailSettings = () => {
    const [templates, setTemplates] = useState([]);
    const [logs, setLogs] = useState([]);
    const [stats, setStats] = useState(null);
    const [smtpStatus, setSmtpStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('templates');
    const [searchTerm, setSearchTerm] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState('edit'); // edit | preview | create
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [formData, setFormData] = useState({ slug: '', name: '', subject: '', body: '', description: '', variables: '' });

    // Test email
    const [testEmail, setTestEmail] = useState('');
    const [testingSMTP, setTestingSMTP] = useState(false);
    const [sendingTest, setSendingTest] = useState(false);

    // Logs pagination
    const [logsPage, setLogsPage] = useState(1);
    const [logsPagination, setLogsPagination] = useState({ total: 0, pages: 0 });

    useEffect(() => {
        fetchAll();
    }, []);

    useEffect(() => {
        if (activeTab === 'logs') fetchLogs();
    }, [activeTab, logsPage]);

    const fetchAll = async () => {
        setLoading(true);
        try {
            // api interceptor already unwraps response.data
            // Backend uses successResponse() → {success, data, message}
            // So each result here is {success, data, message}
            const [tplRes, statsRes, smtpRes] = await Promise.all([
                api.get('/admin/email/templates'),
                api.get('/admin/email/stats'),
                api.get('/admin/email/smtp-status')
            ]);
            setTemplates(tplRes.data || []);
            setStats(statsRes.data || null);
            setSmtpStatus(smtpRes.data || null);
        } catch (err) {
            console.error('Email settings fetch error:', err);
            setError('Failed to load email settings');
        } finally {
            setLoading(false);
        }
    };

    const fetchLogs = async () => {
        try {
            const res = await api.get(`/admin/email/logs?page=${logsPage}&limit=15`);
            // Backend: successResponse(res, { logs, pagination })
            const payload = res.data || {};
            setLogs(payload.logs || []);
            setLogsPagination(payload.pagination || { total: 0, pages: 0 });
        } catch (err) {
            console.error('Failed to load logs:', err);
        }
    };

    const handleTestSMTP = async () => {
        setTestingSMTP(true);
        setError('');
        setSuccess('');
        try {
            const res = await api.post('/admin/email/test-connection');
            const result = res.data || res;
            if (result.success) {
                setSuccess('SMTP connection successful!');
            } else {
                setError(`SMTP test failed: ${result.reason || 'Unknown error'}`);
            }
        } catch (err) {
            setError(err?.reason || err?.message || 'SMTP connection failed');
        } finally {
            setTestingSMTP(false);
        }
    };

    const handleSendTest = async (templateId = null) => {
        if (!testEmail) { setError('Enter a test email address'); return; }
        setSendingTest(true);
        setError('');
        setSuccess('');
        try {
            const res = await api.post('/admin/email/send-test', { to: testEmail, templateId });
            const result = res.data || res;
            if (result.success) {
                setSuccess(`Test email sent to ${testEmail}!`);
            } else {
                setError(`Send failed: ${result.reason || 'Unknown error'}`);
            }
        } catch (err) {
            setError(err?.reason || err?.message || 'Failed to send test email');
        } finally {
            setSendingTest(false);
        }
    };

    const handleToggleTemplate = async (id) => {
        try {
            await api.post(`/admin/email/templates/${id}/toggle`);
            await fetchAll();
        } catch (err) {
            setError(err?.error?.message || err?.message || 'Failed to toggle template');
        }
    };

    const handleDeleteTemplate = async (id) => {
        if (!window.confirm('Delete this email template?')) return;
        try {
            await api.delete(`/admin/email/templates/${id}`);
            setSuccess('Template deleted');
            await fetchAll();
        } catch (err) {
            setError(err?.error?.message || err?.message || 'Failed to delete template');
        }
    };

    const handleSeedTemplates = async () => {
        try {
            await api.post('/admin/email/seed');
            setSuccess('Default templates seeded!');
            await fetchAll();
        } catch (err) {
            setError(err?.error?.message || err?.message || 'Failed to seed templates');
        }
    };

    const openEditModal = (template) => {
        setEditingTemplate(template);
        setFormData({
            slug: template.slug,
            name: template.name,
            subject: template.subject,
            body: template.body,
            description: template.description || '',
            variables: Array.isArray(template.variables) ? template.variables.join(', ') : ''
        });
        setModalMode('edit');
        setShowModal(true);
    };

    const openCreateModal = () => {
        setEditingTemplate(null);
        setFormData({ slug: '', name: '', subject: '', body: '', description: '', variables: '' });
        setModalMode('create');
        setShowModal(true);
    };

    const openPreviewModal = (template) => {
        setEditingTemplate(template);
        setModalMode('preview');
        setShowModal(true);
    };

    const handleSaveTemplate = async () => {
        setError('');
        try {
            const data = {
                name: formData.name,
                subject: formData.subject,
                body: formData.body,
                description: formData.description,
                variables: formData.variables ? formData.variables.split(',').map(v => v.trim()).filter(Boolean) : []
            };

            if (modalMode === 'create') {
                data.slug = formData.slug;
                await api.post('/admin/email/templates', data);
                setSuccess('Template created!');
            } else {
                await api.put(`/admin/email/templates/${editingTemplate.id}`, data);
                setSuccess('Template updated!');
            }
            setShowModal(false);
            await fetchAll();
        } catch (err) {
            setError(err?.error?.message || err?.error || err?.message || 'Failed to save template');
        }
    };

    const clearAlerts = () => { setError(''); setSuccess(''); };

    if (loading) {
        return (
            <div className="page-container">
                <div className="loading-state">
                    <div className="spinner"></div>
                    <p>Loading email settings...</p>
                </div>
            </div>
        );
    }

    const filteredTemplates = (templates || []).filter(t =>
        !searchTerm ||
        (t.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.slug || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="page-container">
            <div className="page-header">
                <div className="header-content">
                    <h1><Mail size={28} /> Email Notifications</h1>
                    <p className="header-subtitle">Manage email templates, SMTP config, and delivery logs</p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                    <button className="btn btn-secondary" onClick={fetchAll}><RefreshCw size={16} /> Refresh</button>
                </div>
            </div>

            {error && <div className="alert alert-error" onClick={clearAlerts} style={{ cursor: 'pointer' }}><AlertTriangle size={20} />{error}</div>}
            {success && <div className="alert alert-success" onClick={clearAlerts} style={{ cursor: 'pointer' }}><CheckCircle2 size={20} />{success}</div>}

            {/* SMTP Status + Stats Cards */}
            <div className="em-stats-grid">
                <div className="card em-stat-card">
                    <div className="em-stat-icon" style={{ background: smtpStatus?.configured ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)' }}>
                        <Settings size={20} style={{ color: smtpStatus?.configured ? '#10b981' : '#ef4444' }} />
                    </div>
                    <div>
                        <div className="em-stat-label">SMTP Status</div>
                        <div className="em-stat-value" style={{ color: smtpStatus?.configured ? '#10b981' : '#ef4444' }}>
                            {smtpStatus?.configured ? 'Configured' : 'Not Configured'}
                        </div>
                        {smtpStatus?.host && <div className="em-stat-sub">{smtpStatus.host}:{smtpStatus.port}</div>}
                    </div>
                </div>
                <div className="card em-stat-card">
                    <div className="em-stat-icon" style={{ background: 'rgba(99, 102, 241, 0.15)' }}>
                        <FileText size={20} style={{ color: '#6366f1' }} />
                    </div>
                    <div>
                        <div className="em-stat-label">Templates</div>
                        <div className="em-stat-value">{stats?.templateCount || 0}</div>
                    </div>
                </div>
                <div className="card em-stat-card">
                    <div className="em-stat-icon" style={{ background: 'rgba(16, 185, 129, 0.15)' }}>
                        <Send size={20} style={{ color: '#10b981' }} />
                    </div>
                    <div>
                        <div className="em-stat-label">Total Sent</div>
                        <div className="em-stat-value">{stats?.totalSent || 0}</div>
                        <div className="em-stat-sub">{stats?.sentToday || 0} today</div>
                    </div>
                </div>
                <div className="card em-stat-card">
                    <div className="em-stat-icon" style={{ background: 'rgba(239, 68, 68, 0.15)' }}>
                        <AlertTriangle size={20} style={{ color: '#ef4444' }} />
                    </div>
                    <div>
                        <div className="em-stat-label">Failed</div>
                        <div className="em-stat-value" style={{ color: '#ef4444' }}>{stats?.totalFailed || 0}</div>
                    </div>
                </div>
            </div>

            {/* SMTP Test Section */}
            <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}><TestTube size={18} /> SMTP Testing</h3>
                    <button className="btn btn-secondary btn-sm" onClick={handleTestSMTP} disabled={testingSMTP}>
                        {testingSMTP ? <><Loader2 size={14} className="spin" /> Testing...</> : 'Test Connection'}
                    </button>
                    <div style={{ display: 'flex', gap: 'var(--spacing-sm)', flex: 1, minWidth: '280px' }}>
                        <input
                            type="email"
                            className="form-input"
                            placeholder="test@example.com"
                            value={testEmail}
                            onChange={e => setTestEmail(e.target.value)}
                            style={{ flex: 1 }}
                        />
                        <button className="btn btn-primary btn-sm" onClick={() => handleSendTest()} disabled={sendingTest || !testEmail}>
                            {sendingTest ? <Loader2 size={14} className="spin" /> : <><Send size={14} /> Send Test</>}
                        </button>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="tabs" style={{ marginBottom: 'var(--spacing-lg)' }}>
                <button className={`tab ${activeTab === 'templates' ? 'active' : ''}`} onClick={() => setActiveTab('templates')}>
                    <FileText size={16} /> Templates
                </button>
                <button className={`tab ${activeTab === 'logs' ? 'active' : ''}`} onClick={() => { setActiveTab('logs'); setLogsPage(1); }}>
                    <Clock size={16} /> Delivery Logs
                </button>
            </div>

            {/* Templates Tab */}
            {activeTab === 'templates' && (
                <>
                    <div style={{ display: 'flex', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-lg)', flexWrap: 'wrap' }}>
                        <div className="search-box" style={{ flex: 1, minWidth: '250px' }}>
                            <Search size={18} />
                            <input
                                type="text"
                                placeholder="Search templates..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <button className="btn btn-primary" onClick={openCreateModal}><Plus size={16} /> New Template</button>
                        {templates.length === 0 && (
                            <button className="btn btn-secondary" onClick={handleSeedTemplates}><Zap size={16} /> Seed Defaults</button>
                        )}
                    </div>

                    <div className="em-templates-grid">
                        {filteredTemplates.length > 0 ? filteredTemplates.map(tpl => (
                            <div key={tpl.id} className={`card em-template-card ${!tpl.isActive ? 'disabled' : ''}`}>
                                <div className="em-tpl-header">
                                    <div style={{ flex: 1 }}>
                                        <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <Mail size={16} style={{ color: 'var(--primary-color)' }} />
                                            {tpl.name}
                                        </h4>
                                        <code style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono, monospace)' }}>{tpl.slug}</code>
                                    </div>
                                    <button
                                        className="btn btn-ghost btn-icon"
                                        onClick={() => handleToggleTemplate(tpl.id)}
                                        title={tpl.isActive ? 'Disable' : 'Enable'}
                                    >
                                        {tpl.isActive ?
                                            <ToggleRight size={22} style={{ color: '#10b981' }} /> :
                                            <ToggleLeft size={22} style={{ color: 'var(--text-muted)' }} />
                                        }
                                    </button>
                                </div>

                                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.5rem 0', minHeight: '2.5em' }}>
                                    {tpl.description || 'No description'}
                                </p>

                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                                    <strong>Subject:</strong> {tpl.subject}
                                </div>

                                {Array.isArray(tpl.variables) && tpl.variables.length > 0 && (
                                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                                        {tpl.variables.map((v, i) => (
                                            <span key={i} className="badge badge-info" style={{ fontSize: '0.6rem' }}>
                                                {'{{' + v + '}}'}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                <div className="em-tpl-actions">
                                    <button className="btn btn-ghost btn-sm" onClick={() => openPreviewModal(tpl)}><Eye size={14} /> Preview</button>
                                    <button className="btn btn-ghost btn-sm" onClick={() => openEditModal(tpl)}><Edit3 size={14} /> Edit</button>
                                    <button className="btn btn-ghost btn-sm" onClick={() => handleSendTest(tpl.id)} disabled={!testEmail}>
                                        <Send size={14} /> Test
                                    </button>
                                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }} onClick={() => handleDeleteTemplate(tpl.id)}>
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        )) : (
                            <div className="card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 'var(--spacing-xl)', color: 'var(--text-muted)' }}>
                                {searchTerm ? 'No templates matching your search' : (
                                    <>
                                        <p>No email templates yet</p>
                                        <button className="btn btn-primary" onClick={handleSeedTemplates}><Zap size={16} /> Seed Default Templates</button>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* Logs Tab */}
            {activeTab === 'logs' && (
                <div className="card">
                    <div className="table-responsive">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Time</th>
                                    <th>To</th>
                                    <th>Subject</th>
                                    <th>Template</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.length > 0 ? logs.map(log => (
                                    <tr key={log.id}>
                                        <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                            {new Date(log.createdAt).toLocaleString()}
                                        </td>
                                        <td>
                                            <div style={{ fontSize: '0.85rem' }}>{log.to}</div>
                                            {log.user && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>@{log.user.username}</div>}
                                        </td>
                                        <td style={{ fontSize: '0.85rem', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {log.subject}
                                        </td>
                                        <td>
                                            {log.template && <span className="badge badge-info" style={{ fontSize: '0.65rem' }}>{log.template}</span>}
                                        </td>
                                        <td>
                                            <span className={`badge ${log.status === 'sent' ? 'badge-success' : 'badge-error'}`}>
                                                {log.status}
                                            </span>
                                            {log.error && (
                                                <div style={{ fontSize: '0.65rem', color: 'var(--error)', marginTop: '2px' }}>{log.error}</div>
                                            )}
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={5} style={{ textAlign: 'center', padding: 'var(--spacing-xl)', color: 'var(--text-muted)' }}>
                                            No email logs yet
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {logsPagination.pages > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--spacing-sm)', marginTop: 'var(--spacing-md)' }}>
                            <button className="btn btn-ghost btn-sm" disabled={logsPage <= 1} onClick={() => setLogsPage(p => p - 1)}>Previous</button>
                            <span style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                Page {logsPage} of {logsPagination.pages}
                            </span>
                            <button className="btn btn-ghost btn-sm" disabled={logsPage >= logsPagination.pages} onClick={() => setLogsPage(p => p + 1)}>Next</button>
                        </div>
                    )}
                </div>
            )}

            {/* Template Modal */}
            {showModal && (
                <div className="modal-overlay open" onClick={() => setShowModal(false)}>
                    <div className="modal" style={{ maxWidth: modalMode === 'preview' ? '700px' : '600px' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>
                                {modalMode === 'preview' && <><Eye size={18} /> Preview: {editingTemplate?.name}</>}
                                {modalMode === 'edit' && <><Edit3 size={18} /> Edit Template</>}
                                {modalMode === 'create' && <><Plus size={18} /> New Template</>}
                            </h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            {modalMode === 'preview' ? (
                                <div className="em-preview-container">
                                    <div className="em-preview-meta">
                                        <div><strong>Subject:</strong> {editingTemplate?.subject}</div>
                                        <div><strong>Variables:</strong> {Array.isArray(editingTemplate?.variables) ? editingTemplate.variables.map(v => `{{${v}}}`).join(', ') : 'None'}</div>
                                    </div>
                                    <div
                                        className="em-preview-body"
                                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(editingTemplate?.body || '') }}
                                    />
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                                    {modalMode === 'create' && (
                                        <div className="form-group">
                                            <label className="form-label">Slug (unique identifier)</label>
                                            <input className="form-input" value={formData.slug} onChange={e => setFormData({ ...formData, slug: e.target.value })} placeholder="e.g., order_confirmed" />
                                        </div>
                                    )}
                                    <div className="form-group">
                                        <label className="form-label">Name</label>
                                        <input className="form-input" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Template display name" />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Description</label>
                                        <input className="form-input" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="When is this email sent?" />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Subject <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{'(supports {{variables}})'}</span></label>
                                        <input className="form-input" value={formData.subject} onChange={e => setFormData({ ...formData, subject: e.target.value })} placeholder="Email subject line" />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Body (HTML) <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{'(supports {{variables}})'}</span></label>
                                        <textarea className="form-input" rows={10} value={formData.body} onChange={e => setFormData({ ...formData, body: e.target.value })} placeholder="<h2>Hello {{username}}</h2><p>Your order is confirmed!</p>" style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.8rem' }} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Variables <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>(comma-separated)</span></label>
                                        <input className="form-input" value={formData.variables} onChange={e => setFormData({ ...formData, variables: e.target.value })} placeholder="username, amount, date" />
                                    </div>
                                </div>
                            )}
                        </div>
                        {modalMode !== 'preview' && (
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                                <button className="btn btn-primary" onClick={handleSaveTemplate}>
                                    {modalMode === 'create' ? 'Create Template' : 'Save Changes'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <style>{`
                .em-stats-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                    gap: var(--spacing-md);
                    margin-bottom: var(--spacing-lg);
                }
                .em-stat-card {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-md);
                    padding: var(--spacing-md) var(--spacing-lg);
                }
                .em-stat-icon {
                    width: 44px;
                    height: 44px;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                }
                .em-stat-label {
                    font-size: 0.75rem;
                    color: var(--text-muted);
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                .em-stat-value {
                    font-size: 1.25rem;
                    font-weight: 700;
                    color: var(--text-primary);
                }
                .em-stat-sub {
                    font-size: 0.7rem;
                    color: var(--text-muted);
                }
                .em-templates-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
                    gap: var(--spacing-md);
                }
                .em-template-card {
                    display: flex;
                    flex-direction: column;
                    transition: all 0.2s;
                }
                .em-template-card:hover {
                    border-color: var(--primary-color);
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(99, 102, 241, 0.1);
                }
                .em-template-card.disabled {
                    opacity: 0.55;
                }
                .em-tpl-header {
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    margin-bottom: 0.5rem;
                }
                .em-tpl-actions {
                    display: flex;
                    gap: 4px;
                    margin-top: auto;
                    padding-top: 0.75rem;
                    border-top: 1px solid var(--border-color);
                }
                .em-preview-container {
                    border-radius: var(--radius-md);
                    overflow: hidden;
                }
                .em-preview-meta {
                    background: var(--bg-tertiary);
                    padding: var(--spacing-md);
                    font-size: 0.85rem;
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                    margin-bottom: var(--spacing-md);
                    border-radius: var(--radius-md);
                }
                .em-preview-body {
                    background: #1e293b;
                    padding: var(--spacing-lg);
                    border-radius: var(--radius-md);
                    color: #cbd5e1;
                    font-size: 0.9rem;
                    line-height: 1.7;
                }
                .em-preview-body h2 { color: #10b981; margin-top: 0; }
                .em-preview-body .info-box { background: #0f172a; border-left: 4px solid #10b981; padding: 12px 16px; margin: 12px 0; border-radius: 0 8px 8px 0; }
                .em-preview-body .info-box .label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; }
                .em-preview-body .info-box .value { font-size: 16px; font-weight: 700; color: #10b981; }
                .em-preview-body .btn { display: inline-block; background: linear-gradient(135deg, #10b981, #059669); color: #fff; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 13px; }
                .tabs {
                    display: flex;
                    gap: 0.5rem;
                    border-bottom: 2px solid var(--border-color);
                    padding-bottom: 0;
                }
                .tab {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    padding: 0.75rem 1.25rem;
                    border: none;
                    background: none;
                    color: var(--text-secondary);
                    font-size: 0.95rem;
                    cursor: pointer;
                    border-bottom: 3px solid transparent;
                    margin-bottom: -2px;
                    transition: all 0.2s ease;
                }
                .tab:hover { color: var(--text-primary); }
                .tab.active { color: var(--primary-color); border-bottom-color: var(--primary-color); font-weight: 600; }
                @keyframes spin { to { transform: rotate(360deg); } }
                .spin { animation: spin 1s linear infinite; }
            `}</style>
        </div>
    );
};

export default EmailSettings;
