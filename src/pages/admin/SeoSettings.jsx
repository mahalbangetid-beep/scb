import { useState, useEffect } from 'react'
import {
    Search, Globe, Eye, EyeOff, Edit2, Plus, Trash2,
    Save, X, Loader2, RefreshCw, Tag, FileText, Code
} from 'lucide-react'
import api from '../../services/api'

export default function SeoSettings() {
    const [pages, setPages] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [editingPage, setEditingPage] = useState(null)
    const [showAddModal, setShowAddModal] = useState(false)
    const [saving, setSaving] = useState(false)

    const [form, setForm] = useState({
        pageTitle: '',
        metaKeywords: [],
        metaDescription: '',
        metaRobots: '',
        customHeader: '',
        isVisible: true
    })

    const [addForm, setAddForm] = useState({ pageSlug: '', pageName: '' })
    const [keywordInput, setKeywordInput] = useState('')

    useEffect(() => { fetchPages() }, [])

    const fetchPages = async () => {
        try {
            setLoading(true)
            const res = await api.get('/seo/admin/pages')
            setPages(res.data || res || [])
        } catch (err) {
            console.error('Failed to fetch SEO pages:', err)
        } finally {
            setLoading(false)
        }
    }

    const handleEdit = (page) => {
        setEditingPage(page)
        setForm({
            pageTitle: page.pageTitle || '',
            metaKeywords: Array.isArray(page.metaKeywords) ? page.metaKeywords : [],
            metaDescription: page.metaDescription || '',
            metaRobots: page.metaRobots || '',
            customHeader: page.customHeader || '',
            isVisible: page.isVisible
        })
        setKeywordInput('')
    }

    const handleSave = async () => {
        if (!editingPage) return
        try {
            setSaving(true)
            // Coerce empty strings to null for nullable fields (prevents Prisma edge cases)
            const payload = {
                ...form,
                metaRobots: form.metaRobots || null,
                customHeader: form.customHeader || null,
                metaDescription: form.metaDescription || null,
                pageTitle: form.pageTitle || null,
                metaKeywords: Array.isArray(form.metaKeywords) && form.metaKeywords.length > 0
                    ? form.metaKeywords
                    : null
            }
            await api.put(`/seo/admin/pages/${editingPage.id}`, payload)
            setEditingPage(null)
            await fetchPages()
        } catch (err) {
            console.error('Failed to save SEO settings:', err)
            const errRaw = err?.error?.message || err?.message || err?.error || err
            const errMsg = typeof errRaw === 'string' ? errRaw : JSON.stringify(errRaw)
            alert('Failed to save: ' + (errMsg || 'Unknown error'))
        } finally {
            setSaving(false)
        }
    }

    const handleAddPage = async () => {
        if (!addForm.pageSlug || !addForm.pageName) return
        try {
            setSaving(true)
            await api.post('/seo/admin/pages', addForm)
            setShowAddModal(false)
            setAddForm({ pageSlug: '', pageName: '' })
            await fetchPages()
        } catch (err) {
            console.error('Failed to add page:', err)
            const addErrRaw = err?.error?.message || err?.message || err?.error || err
            alert('Failed to add: ' + (typeof addErrRaw === 'string' ? addErrRaw : JSON.stringify(addErrRaw)))
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (id) => {
        if (!confirm('Delete this page SEO entry?')) return
        try {
            await api.delete(`/seo/admin/pages/${id}`)
            await fetchPages()
        } catch (err) {
            console.error('Failed to delete:', err)
        }
    }

    const handleToggleVisibility = async (page) => {
        try {
            await api.put(`/seo/admin/pages/${page.id}`, { isVisible: !page.isVisible })
            await fetchPages()
        } catch (err) {
            console.error('Failed to toggle visibility:', err)
        }
    }

    const addKeyword = () => {
        // Split by comma to support pasting multiple keywords at once
        const newKeywords = keywordInput.split(',')
            .map(k => k.trim())
            .filter(k => k.length > 0 && !form.metaKeywords.includes(k))
        if (newKeywords.length > 0) {
            setForm({ ...form, metaKeywords: [...form.metaKeywords, ...newKeywords] })
        }
        setKeywordInput('')
    }

    const removeKeyword = (kw) => {
        setForm({ ...form, metaKeywords: form.metaKeywords.filter(k => k !== kw) })
    }

    const handleKeywordKeyDown = (e) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            addKeyword()
        }
    }

    const handleKeywordPaste = (e) => {
        const pastedText = e.clipboardData.getData('text')
        // If pasted text contains commas, handle it ourselves
        if (pastedText.includes(',')) {
            e.preventDefault()
            const newKeywords = pastedText.split(',')
                .map(k => k.trim())
                .filter(k => k.length > 0 && !form.metaKeywords.includes(k))
            if (newKeywords.length > 0) {
                setForm({ ...form, metaKeywords: [...form.metaKeywords, ...newKeywords] })
            }
            setKeywordInput('')
        }
    }

    const filteredPages = pages.filter(p =>
        p.pageName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.pageSlug.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const getPreviewTitle = () => form.pageTitle || editingPage?.pageName || 'Page Title'
    const getPreviewDesc = () => form.metaDescription || 'No description set for this page.'

    if (loading) {
        return (
            <div className="page-container">
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
                    <Loader2 className="animate-spin" size={32} />
                    <p>Loading SEO settings...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <h1 className="page-title">SEO Settings</h1>
                    <p className="page-subtitle">Manage meta tags and SEO for all pages</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-secondary" onClick={fetchPages}>
                        <RefreshCw size={18} /> Refresh
                    </button>
                    <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                        <Plus size={18} /> Add Page
                    </button>
                </div>
            </div>

            <div className="seo-search" style={{ marginBottom: '16px' }}>
                <Search size={18} />
                <input
                    type="text"
                    placeholder="Search pages..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <div className="seo-tbl-wrap">
                <table className="seo-tbl">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Slug</th>
                            <th>Title</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredPages.map(page => (
                            <tr key={page.id}>
                                <td>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500 }}>
                                        <Globe size={16} /> {page.pageName}
                                    </span>
                                </td>
                                <td><code className="seo-slug">/{page.pageSlug}</code></td>
                                <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {page.pageTitle || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Not set</span>}
                                </td>
                                <td>
                                    <button
                                        className={`seo-vis-btn ${page.isVisible ? 'on' : 'off'}`}
                                        onClick={() => handleToggleVisibility(page)}
                                    >
                                        {page.isVisible ? <><Eye size={14} /> Visible</> : <><EyeOff size={14} /> Hidden</>}
                                    </button>
                                </td>
                                <td>
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                        <button className="seo-act-btn" onClick={() => handleEdit(page)} title="Edit SEO">
                                            <Edit2 size={16} />
                                        </button>
                                        <button className="seo-act-btn del" onClick={() => handleDelete(page.id)} title="Delete">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {filteredPages.length === 0 && (
                            <tr><td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No pages found</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {editingPage && (
                <div className="seo-overlay" onClick={() => setEditingPage(null)}>
                    <div className="seo-dialog seo-dialog-lg" onClick={e => e.stopPropagation()}>
                        <div className="seo-dialog-head">
                            <h2>Edit SEO — {editingPage.pageName}</h2>
                            <button className="seo-act-btn" onClick={() => setEditingPage(null)}><X size={20} /></button>
                        </div>
                        <div className="seo-dialog-body">
                            <div className="seo-preview">
                                <div className="seo-preview-label">Search engine listing preview</div>
                                <div className="seo-preview-title">{getPreviewTitle()}</div>
                                <div className="seo-preview-url">https://yoursite.com/{editingPage.pageSlug}</div>
                                <div className="seo-preview-desc">{getPreviewDesc()}</div>
                            </div>

                            <div className="form-group">
                                <label className="form-label"><FileText size={14} /> Page Title</label>
                                <input type="text" className="form-input" placeholder="e.g. My Site - Best SMM Panel"
                                    value={form.pageTitle} onChange={e => setForm({ ...form, pageTitle: e.target.value })} />
                            </div>

                            <div className="form-group">
                                <label className="form-label"><Tag size={14} /> Meta Keywords</label>
                                <div className="seo-kw-box">
                                    {form.metaKeywords.map(kw => (
                                        <span key={kw} className="seo-kw-chip">
                                            {kw}
                                            <button onClick={() => removeKeyword(kw)}><X size={12} /></button>
                                        </span>
                                    ))}
                                    <input type="text" className="seo-kw-input" placeholder="Type and press Enter..."
                                        value={keywordInput} onChange={e => setKeywordInput(e.target.value)}
                                        onKeyDown={handleKeywordKeyDown} onBlur={addKeyword}
                                        onPaste={handleKeywordPaste} />
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Meta Robots</label>
                                <input type="text" className="form-input" placeholder="e.g. index, follow"
                                    value={form.metaRobots} onChange={e => setForm({ ...form, metaRobots: e.target.value })} />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Meta Description</label>
                                <textarea className="form-input" rows={3} placeholder="Description for search results..."
                                    value={form.metaDescription} onChange={e => setForm({ ...form, metaDescription: e.target.value })} />
                            </div>

                            <div className="form-group">
                                <label className="form-label"><Code size={14} /> Custom Header</label>
                                <textarea className="form-input" rows={4} placeholder="Custom HTML/scripts for <head>..."
                                    style={{ fontFamily: "'Courier New', monospace", fontSize: '0.85rem' }}
                                    value={form.customHeader} onChange={e => setForm({ ...form, customHeader: e.target.value })} />
                            </div>
                        </div>
                        <div className="seo-dialog-foot">
                            <button className="btn btn-secondary" onClick={() => setEditingPage(null)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                                {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showAddModal && (
                <div className="seo-overlay" onClick={() => setShowAddModal(false)}>
                    <div className="seo-dialog" onClick={e => e.stopPropagation()}>
                        <div className="seo-dialog-head">
                            <h2>Add Page</h2>
                            <button className="seo-act-btn" onClick={() => setShowAddModal(false)}><X size={20} /></button>
                        </div>
                        <div className="seo-dialog-body">
                            <div className="form-group">
                                <label className="form-label">Page Name</label>
                                <input type="text" className="form-input" placeholder="e.g. Blog"
                                    value={addForm.pageName} onChange={e => setAddForm({ ...addForm, pageName: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Page Slug</label>
                                <input type="text" className="form-input" placeholder="e.g. blog"
                                    value={addForm.pageSlug}
                                    onChange={e => setAddForm({ ...addForm, pageSlug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} />
                            </div>
                        </div>
                        <div className="seo-dialog-foot">
                            <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleAddPage} disabled={saving || !addForm.pageSlug || !addForm.pageName}>
                                {saving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                                Add Page
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .seo-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.7);
                    backdrop-filter: blur(4px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                    padding: 16px;
                }
                .seo-dialog {
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: 16px;
                    width: 100%;
                    max-width: 500px;
                    max-height: 85vh;
                    overflow: auto;
                }
                .seo-dialog-lg {
                    max-width: 700px;
                }
                .seo-dialog-head {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 16px 20px;
                    border-bottom: 1px solid var(--border-color);
                }
                .seo-dialog-head h2 {
                    font-size: 1.125rem;
                    font-weight: 600;
                    margin: 0;
                }
                .seo-dialog-body {
                    padding: 20px;
                }
                .seo-dialog-foot {
                    display: flex;
                    justify-content: flex-end;
                    gap: 8px;
                    padding: 16px 20px;
                    border-top: 1px solid var(--border-color);
                }
                .seo-search {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px 12px;
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: 8px;
                }
                .seo-search input {
                    flex: 1;
                    background: none;
                    border: none;
                    outline: none;
                    color: var(--text-primary);
                    font-size: 0.875rem;
                }
                .seo-tbl-wrap {
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: 12px;
                    overflow: hidden;
                }
                .seo-tbl {
                    width: 100%;
                    border-collapse: collapse;
                }
                .seo-tbl th {
                    padding: 12px 16px;
                    text-align: left;
                    font-weight: 500;
                    color: var(--text-secondary);
                    font-size: 0.875rem;
                    background: var(--bg-tertiary);
                    border-bottom: 1px solid var(--border-color);
                }
                .seo-tbl td {
                    padding: 12px 16px;
                    border-bottom: 1px solid var(--border-color);
                    vertical-align: middle;
                }
                .seo-tbl tr:last-child td {
                    border-bottom: none;
                }
                .seo-tbl tr:hover {
                    background: var(--bg-tertiary);
                }
                .seo-slug {
                    padding: 2px 8px;
                    background: var(--bg-tertiary);
                    border: 1px solid var(--border-color);
                    border-radius: 4px;
                    font-size: 0.8rem;
                    color: var(--text-secondary);
                }
                .seo-vis-btn {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    padding: 4px 10px;
                    border: 1px solid transparent;
                    border-radius: 4px;
                    font-size: 0.8rem;
                    cursor: pointer;
                    transition: all 0.2s;
                    background: none;
                }
                .seo-vis-btn.on {
                    background: rgba(34, 197, 94, 0.1);
                    color: #22c55e;
                    border-color: rgba(34, 197, 94, 0.2);
                }
                .seo-vis-btn.off {
                    background: rgba(107, 114, 128, 0.1);
                    color: #6b7280;
                    border-color: rgba(107, 114, 128, 0.2);
                }
                .seo-act-btn {
                    padding: 6px;
                    background: none;
                    border: 1px solid var(--border-color);
                    border-radius: 6px;
                    color: var(--text-secondary);
                    cursor: pointer;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .seo-act-btn:hover {
                    background: var(--bg-tertiary);
                    color: var(--text-primary);
                }
                .seo-act-btn.del:hover {
                    background: rgba(239, 68, 68, 0.1);
                    color: #ef4444;
                    border-color: rgba(239, 68, 68, 0.3);
                }
                .seo-preview {
                    background: var(--bg-primary);
                    border: 1px solid var(--border-color);
                    border-radius: 8px;
                    padding: 16px;
                    margin-bottom: 20px;
                }
                .seo-preview-label {
                    font-size: 0.75rem;
                    color: var(--text-muted);
                    margin-bottom: 8px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                .seo-preview-title {
                    font-size: 1.125rem;
                    color: #1a0dab;
                    margin-bottom: 2px;
                }
                .seo-preview-url {
                    font-size: 0.8rem;
                    color: #006621;
                    margin-bottom: 4px;
                }
                .seo-preview-desc {
                    font-size: 0.85rem;
                    color: #545454;
                    line-height: 1.4;
                }
                .seo-kw-box {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                    padding: 8px;
                    background: var(--bg-primary);
                    border: 1px solid var(--border-color);
                    border-radius: 8px;
                    min-height: 42px;
                    align-items: center;
                }
                .seo-kw-chip {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    padding: 4px 10px;
                    background: var(--primary-500);
                    color: white;
                    border-radius: 20px;
                    font-size: 0.8rem;
                    font-weight: 500;
                }
                .seo-kw-chip button {
                    background: none;
                    border: none;
                    color: white;
                    cursor: pointer;
                    padding: 0;
                    display: flex;
                    opacity: 0.7;
                }
                .seo-kw-chip button:hover {
                    opacity: 1;
                }
                .seo-kw-input {
                    flex: 1;
                    min-width: 120px;
                    border: none;
                    outline: none;
                    background: transparent;
                    font-size: 0.875rem;
                    color: var(--text-primary);
                    padding: 4px;
                }
                @media (max-width: 768px) {
                    .seo-tbl th:nth-child(2),
                    .seo-tbl td:nth-child(2),
                    .seo-tbl th:nth-child(3),
                    .seo-tbl td:nth-child(3) {
                        display: none;
                    }
                }
            `}</style>
        </div>
    )
}
