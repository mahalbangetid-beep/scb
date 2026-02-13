import { useState, useEffect, useRef } from 'react'
import {
    Users,
    Plus,
    Upload,
    Download,
    Search,
    Filter,
    Edit,
    Trash2,
    MessageSquare,
    Phone,
    Mail,
    Tag,
    MoreVertical,
    X,
    CheckCircle,
    UserPlus,
    Loader2,
    ChevronLeft,
    ChevronRight,
    Search as SearchIcon,
    FileText,
    AlertTriangle,
    Zap
} from 'lucide-react'
import api from '../services/api'
import { formatDistanceToNow } from 'date-fns'

const tagColors = {
    customer: '#25D366',
    vip: '#f59e0b',
    lead: '#3b82f6',
    new: '#8b5cf6',
    newsletter: '#ec4899',
    blocked: '#ef4444',
}

const getTagColor = (name) => tagColors[(name || '').toLowerCase()] || '#6366f1'

export default function Contacts() {
    const [contacts, setContacts] = useState([])
    const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 })
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedTag, setSelectedTag] = useState('all')
    const [showModal, setShowModal] = useState(false)
    const [selectedContacts, setSelectedContacts] = useState([])
    const [tags, setTags] = useState([])
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')

    // Form state
    const [formData, setFormData] = useState({ name: '', phone: '', email: '', notes: '', tags: [] })
    const [submitting, setSubmitting] = useState(false)
    const [editId, setEditId] = useState(null)

    // CSV Import state
    const [showImportModal, setShowImportModal] = useState(false)
    const [csvText, setCsvText] = useState('')
    const [csvFileName, setCsvFileName] = useState('')
    const [csvPreview, setCsvPreview] = useState(null)
    const [importTags, setImportTags] = useState('')
    const [importing, setImporting] = useState(false)
    const [importResult, setImportResult] = useState(null)
    const [importError, setImportError] = useState('')
    const fileInputRef = useRef(null)

    const fetchContacts = async (page = 1) => {
        try {
            setRefreshing(true)
            const params = {
                page,
                limit: 10,
                search: searchQuery || undefined,
                tag: selectedTag !== 'all' ? selectedTag : undefined
            }
            const res = await api.get('/contacts', { params })
            setContacts(res.data || [])
            setPagination(res.pagination)

            // Extract unique tags
            const allTags = new Set()
                ; (res.data || []).forEach(c => (c.tags || []).forEach(t => {
                    const tagName = typeof t === 'string' ? t : t.name
                    if (tagName) allTags.add(tagName)
                }))
            setTags(Array.from(allTags).map(t => ({ name: t, color: getTagColor(t) })))
        } catch (error) {
            console.error('Failed to fetch contacts:', error)
        } finally {
            setLoading(false)
            setRefreshing(false)
        }
    }

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchContacts(1)
        }, 500)
        return () => clearTimeout(timer)
    }, [searchQuery, selectedTag])

    const handleSaveContact = async () => {
        if (!formData.name || !formData.phone) return
        setSubmitting(true)
        try {
            if (editId) {
                await api.put(`/contacts/${editId}`, formData)
                setSuccess('Contact updated')
            } else {
                await api.post('/contacts', formData)
                setSuccess('Contact created')
            }
            setShowModal(false)
            setFormData({ name: '', phone: '', email: '', notes: '', tags: [] })
            setEditId(null)
            fetchContacts(pagination.page)
            setTimeout(() => setSuccess(''), 3000)
        } catch (error) {
            setError(error.message || 'Failed to save contact')
            console.error('Failed to save contact:', error)
        } finally {
            setSubmitting(false)
        }
    }

    const handleDeleteContact = async (id) => {
        if (!confirm('Are you sure?')) return
        try {
            await api.delete(`/contacts/${id}`)
            fetchContacts(pagination.page)
        } catch (error) {
            console.error('Failed to delete contact:', error)
        }
    }

    const handleEditContact = (contact) => {
        setFormData({
            name: contact.name,
            phone: contact.phone,
            email: contact.email || '',
            notes: contact.notes || '',
            tags: (contact.tags || []).map(t => typeof t === 'string' ? t : t.name)
        })
        setEditId(contact.id)
        setShowModal(true)
    }

    const toggleContact = (id) => {
        setSelectedContacts(prev =>
            prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
        )
    }

    const toggleAll = () => {
        setSelectedContacts(
            selectedContacts.length === contacts.length ? [] : contacts.map(c => c.id)
        )
    }

    const handlePageChange = (newPage) => {
        if (newPage >= 1 && newPage <= pagination.totalPages) {
            fetchContacts(newPage)
        }
    }

    // ===== CSV Import Handlers =====

    const handleFileSelect = (e) => {
        const file = e.target.files[0]
        if (!file) return

        if (!file.name.endsWith('.csv') && !file.name.endsWith('.txt')) {
            setError('Please select a CSV or TXT file')
            return
        }

        if (file.size > 5 * 1024 * 1024) {
            setError('File too large (max 5MB)')
            return
        }

        setCsvFileName(file.name)
        const reader = new FileReader()
        reader.onload = (evt) => {
            const text = evt.target.result
            setCsvText(text)
            parsePreview(text)
        }
        reader.readAsText(file)

        // Reset file input
        e.target.value = ''
    }

    const parsePreview = (text) => {
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
        if (lines.length < 2) {
            setCsvPreview(null)
            return
        }

        const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''))
        const previewRows = []
        for (let i = 1; i < Math.min(lines.length, 6); i++) {
            const values = parseCSVLine(lines[i])
            const row = {}
            headers.forEach((h, idx) => { row[h] = values[idx] || '' })
            previewRows.push(row)
        }

        setCsvPreview({
            headers,
            rows: previewRows,
            totalRows: lines.length - 1,
            hasPhone: headers.some(h =>
                ['phone', 'phone number', 'phonenumber', 'nomor', 'no', 'whatsapp', 'wa'].includes(h.toLowerCase())
            )
        })
    }

    const parseCSVLine = (line) => {
        const result = []
        let current = ''
        let inQuotes = false
        for (let i = 0; i < line.length; i++) {
            const ch = line[i]
            if (ch === '"' || ch === "'") {
                if (inQuotes && i + 1 < line.length && line[i + 1] === ch) {
                    current += ch
                    i++
                } else {
                    inQuotes = !inQuotes
                }
            } else if (ch === ',' && !inQuotes) {
                result.push(current.trim())
                current = ''
            } else {
                current += ch
            }
        }
        result.push(current.trim())
        return result
    }

    const handleImport = async () => {
        if (!csvText) {
            setImportError('No CSV data to import')
            return
        }

        setImporting(true)
        setImportResult(null)
        setImportError('')
        try {
            const tagsArray = importTags
                .split(',')
                .map(t => t.trim())
                .filter(Boolean)

            const res = await api.post('/contacts/import', {
                csv: csvText,
                tags: tagsArray.length > 0 ? tagsArray : undefined
            })

            setImportResult(res.data || res)
            fetchContacts(1)
            setSuccess(res.message || 'Import complete')
            setTimeout(() => setSuccess(''), 5000)
        } catch (err) {
            setImportError(err.message || err.error?.message || 'Import failed')
        } finally {
            setImporting(false)
        }
    }

    const resetImportModal = () => {
        setCsvText('')
        setCsvFileName('')
        setCsvPreview(null)
        setImportTags('')
        setImportResult(null)
        setImportError('')
        setShowImportModal(false)
    }

    const handleDownloadTemplate = () => {
        const template = 'name,phone,email,tags\nJohn Doe,+6281234567890,john@example.com,customer;vip\nJane Smith,+6289876543210,jane@example.com,lead\n'
        const blob = new Blob([template], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'contacts_template.csv'
        a.click()
        URL.revokeObjectURL(url)
    }

    if (loading && !refreshing) {
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
                    <h1 className="page-title">Contacts</h1>
                    <p className="page-subtitle">Manage your contact list and groups</p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--spacing-md)' }}>
                    <button className="btn btn-secondary" onClick={() => setShowImportModal(true)}>
                        <Upload size={16} />
                        Import CSV
                    </button>
                    <button className="btn btn-secondary" onClick={() => fetchContacts(pagination.page)}>
                        <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                    </button>
                    <button className="btn btn-primary" onClick={() => {
                        setFormData({ name: '', phone: '', email: '', notes: '', tags: [] })
                        setEditId(null)
                        setShowModal(true)
                    }}>
                        <Plus size={16} />
                        Add Contact
                    </button>
                </div>
            </div>

            {/* Alerts */}
            {error && (
                <div className="alert alert-error" style={{ marginBottom: 'var(--spacing-md)' }}>
                    <AlertTriangle size={18} />
                    <span>{error}</span>
                    <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}><X size={16} /></button>
                </div>
            )}
            {success && (
                <div className="alert alert-success" style={{ marginBottom: 'var(--spacing-md)' }}>
                    <Zap size={18} />
                    <span>{success}</span>
                </div>
            )}

            {/* Filters */}
            <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
                <div style={{ display: 'flex', gap: 'var(--spacing-md)', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '250px', position: 'relative' }}>
                        <SearchIcon
                            size={18}
                            style={{
                                position: 'absolute',
                                left: '12px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                color: 'var(--text-muted)'
                            }}
                        />
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Search by name, phone, or email..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ paddingLeft: '44px' }}
                        />
                    </div>

                    <div style={{ display: 'flex', gap: 'var(--spacing-sm)', flexWrap: 'wrap' }}>
                        <button
                            className={`btn ${selectedTag === 'all' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                            onClick={() => setSelectedTag('all')}
                        >
                            All
                        </button>
                        {tags.map((tag) => (
                            <button
                                key={tag.name}
                                className={`btn ${selectedTag === tag.name ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                                onClick={() => setSelectedTag(tag.name)}
                            >
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: tag.color }} />
                                {tag.name}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Contacts Table */}
            <div className="card">
                <div className="table-container" style={{ border: 'none' }}>
                    <table className="table">
                        <thead>
                            <tr>
                                <th style={{ width: '40px' }}>
                                    <input type="checkbox" checked={selectedContacts.length === contacts.length && contacts.length > 0} onChange={toggleAll} />
                                </th>
                                <th>Contact</th>
                                <th>Phone</th>
                                <th>Tags</th>
                                <th>Created</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {contacts.length > 0 ? contacts.map((contact) => (
                                <tr key={contact.id}>
                                    <td>
                                        <input type="checkbox" checked={selectedContacts.includes(contact.id)} onChange={() => toggleContact(contact.id)} />
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
                                            <div style={{
                                                width: '40px', height: '40px', borderRadius: 'var(--radius-full)', background: 'var(--gradient-primary)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.875rem', fontWeight: 600
                                            }}>
                                                {contact.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                            </div>
                                            <div>
                                                <div style={{ fontWeight: 500 }}>{contact.name}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{contact.email}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>{contact.phone}</td>
                                    <td>
                                        <div style={{ display: 'flex', gap: 'var(--spacing-xs)', flexWrap: 'wrap' }}>
                                            {(contact.tags || []).map((t, idx) => {
                                                const tagName = typeof t === 'string' ? t : t.name
                                                return (
                                                    <span key={idx} style={{ padding: '2px 8px', fontSize: '0.625rem', fontWeight: 500, borderRadius: 'var(--radius-full)', background: `${getTagColor(tagName)}20`, color: getTagColor(tagName) }}>
                                                        {tagName}
                                                    </span>
                                                )
                                            })}
                                        </div>
                                    </td>
                                    <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        {formatDistanceToNow(new Date(contact.createdAt), { addSuffix: true })}
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: 'var(--spacing-xs)' }}>
                                            <button className="btn btn-ghost btn-icon" onClick={() => handleEditContact(contact)}>
                                                <Edit size={14} />
                                            </button>
                                            <button className="btn btn-ghost btn-icon" style={{ color: 'var(--error)' }} onClick={() => handleDeleteContact(contact.id)}>
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan="6" style={{ textAlign: 'center', padding: 'var(--spacing-xl)', color: 'var(--text-muted)' }}>
                                        No contacts found
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {pagination.totalPages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--spacing-md) var(--spacing-lg)', borderTop: '1px solid var(--border-color)' }}>
                        <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                            Showing {contacts.length} of {pagination.total} contacts
                        </span>
                        <div style={{ display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'center' }}>
                            <button className="btn btn-secondary btn-sm" disabled={pagination.page === 1} onClick={() => handlePageChange(pagination.page - 1)}><ChevronLeft size={14} /></button>
                            <span style={{ fontSize: '0.875rem' }}>Page {pagination.page} of {pagination.totalPages}</span>
                            <button className="btn btn-secondary btn-sm" disabled={pagination.page === pagination.totalPages} onClick={() => handlePageChange(pagination.page + 1)}><ChevronRight size={14} /></button>
                        </div>
                    </div>
                )}
            </div>

            {/* Add/Edit Contact Modal */}
            {showModal && (
                <div className="modal-overlay open" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">{editId ? 'Edit Contact' : 'Add New Contact'}</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label className="form-label">Full Name</label>
                                <input type="text" className="form-input" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Phone Number</label>
                                <input type="tel" className="form-input" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Email (Optional)</label>
                                <input type="email" className="form-input" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Notes (Optional)</label>
                                <textarea className="form-textarea" rows={3} value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleSaveContact} disabled={submitting}>
                                {submitting ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                                {editId ? 'Update Contact' : 'Add Contact'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* CSV Import Modal */}
            {showImportModal && (
                <div className="modal-overlay open" onClick={() => resetImportModal()}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '680px' }}>
                        <div className="modal-header">
                            <h3 className="modal-title"><Upload size={20} /> Import Contacts from CSV</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => resetImportModal()}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            {/* Import Error */}
                            {importError && (
                                <div style={{
                                    padding: '0.75rem 1rem',
                                    borderRadius: '8px',
                                    marginBottom: '1rem',
                                    background: 'rgba(239, 68, 68, 0.08)',
                                    border: '1px solid rgba(239, 68, 68, 0.2)',
                                    color: '#ef4444',
                                    fontSize: '0.85rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem'
                                }}>
                                    <AlertTriangle size={16} />
                                    <span style={{ flex: 1 }}>{importError}</span>
                                    <button onClick={() => setImportError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: '2px' }}><X size={14} /></button>
                                </div>
                            )}
                            {/* Import Result */}
                            {importResult && (
                                <div style={{
                                    padding: '1rem',
                                    borderRadius: '10px',
                                    marginBottom: '1rem',
                                    background: 'rgba(34, 197, 94, 0.08)',
                                    border: '1px solid rgba(34, 197, 94, 0.2)'
                                }}>
                                    <div style={{ fontWeight: 600, marginBottom: '0.5rem', color: '#22c55e' }}>
                                        <CheckCircle size={16} style={{ display: 'inline', marginRight: '6px' }} />
                                        Import Complete
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', fontSize: '0.85rem' }}>
                                        <div><strong>{importResult.created || 0}</strong> created</div>
                                        <div><strong>{importResult.updated || 0}</strong> updated</div>
                                        <div><strong>{importResult.skipped || 0}</strong> skipped</div>
                                    </div>
                                    {importResult.errors?.length > 0 && (
                                        <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                            <div style={{ fontWeight: 500, marginBottom: '0.25rem' }}>Errors:</div>
                                            {importResult.errors.slice(0, 5).map((e, i) => (
                                                <div key={i} style={{ color: '#ef4444' }}>• {e.phone}: {e.error}</div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* File Upload Area */}
                            {!importResult && (
                                <>
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        accept=".csv,.txt"
                                        style={{ display: 'none' }}
                                        onChange={handleFileSelect}
                                    />

                                    <div
                                        onClick={() => fileInputRef.current?.click()}
                                        style={{
                                            border: '2px dashed var(--border-color)',
                                            borderRadius: '12px',
                                            padding: '2rem',
                                            textAlign: 'center',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            background: csvFileName ? 'rgba(37, 211, 102, 0.04)' : 'transparent',
                                            borderColor: csvFileName ? 'var(--primary-color)' : 'var(--border-color)',
                                            marginBottom: '1rem'
                                        }}
                                        onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--primary-color)' }}
                                        onDragLeave={(e) => { e.currentTarget.style.borderColor = csvFileName ? 'var(--primary-color)' : 'var(--border-color)' }}
                                        onDrop={(e) => {
                                            e.preventDefault()
                                            e.currentTarget.style.borderColor = 'var(--border-color)'
                                            const file = e.dataTransfer.files[0]
                                            if (file) {
                                                const fakeEvent = { target: { files: [file], value: '' } }
                                                handleFileSelect(fakeEvent)
                                            }
                                        }}
                                    >
                                        {csvFileName ? (
                                            <div>
                                                <FileText size={32} style={{ color: 'var(--primary-color)', marginBottom: '0.5rem' }} />
                                                <div style={{ fontWeight: 600 }}>{csvFileName}</div>
                                                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                                                    {csvPreview ? `${csvPreview.totalRows} contacts found` : 'Parsing...'}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                                                    Click to select a different file
                                                </div>
                                            </div>
                                        ) : (
                                            <div>
                                                <Upload size={32} style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }} />
                                                <div style={{ fontWeight: 500 }}>Click or drag CSV file here</div>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                                    Supports .csv and .txt files (max 5MB)
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Template download */}
                                    <button
                                        className="btn btn-ghost"
                                        onClick={handleDownloadTemplate}
                                        style={{ fontSize: '0.8rem', marginBottom: '1rem' }}
                                    >
                                        <Download size={14} /> Download CSV Template
                                    </button>

                                    {/* CSV Preview */}
                                    {csvPreview && (
                                        <div style={{ marginBottom: '1rem' }}>
                                            {!csvPreview.hasPhone && (
                                                <div style={{
                                                    padding: '0.75rem',
                                                    borderRadius: '8px',
                                                    background: 'rgba(239, 68, 68, 0.08)',
                                                    border: '1px solid rgba(239, 68, 68, 0.2)',
                                                    color: '#ef4444',
                                                    fontSize: '0.85rem',
                                                    marginBottom: '0.75rem',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.5rem'
                                                }}>
                                                    <AlertTriangle size={16} />
                                                    No "phone" column found! CSV must have a column named "phone", "wa", "whatsapp", or "nomor".
                                                </div>
                                            )}

                                            <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                                                Preview (first {csvPreview.rows.length} of {csvPreview.totalRows} rows)
                                            </div>
                                            <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                                <table className="table" style={{ fontSize: '0.8rem', margin: 0 }}>
                                                    <thead>
                                                        <tr>
                                                            {csvPreview.headers.map((h, i) => (
                                                                <th key={i} style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap' }}>{h}</th>
                                                            ))}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {csvPreview.rows.map((row, i) => (
                                                            <tr key={i}>
                                                                {csvPreview.headers.map((h, j) => (
                                                                    <td key={j} style={{ padding: '0.4rem 0.75rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                        {row[h] || ''}
                                                                    </td>
                                                                ))}
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}

                                    {/* Optional Tags */}
                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                        <label className="form-label">
                                            <Tag size={14} style={{ display: 'inline', marginRight: '4px' }} />
                                            Apply Tags to All Imported Contacts (Optional)
                                        </label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="e.g. customer, lead (comma-separated)"
                                            value={importTags}
                                            onChange={(e) => setImportTags(e.target.value)}
                                        />
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                                            These tags will be applied to all imported contacts in addition to any tags in the CSV.
                                        </span>
                                    </div>
                                </>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => resetImportModal()}>
                                {importResult ? 'Close' : 'Cancel'}
                            </button>
                            {!importResult && (
                                <button
                                    className="btn btn-primary"
                                    onClick={handleImport}
                                    disabled={importing || !csvText || (csvPreview && !csvPreview.hasPhone)}
                                >
                                    {importing ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
                                    {importing ? 'Importing...' : `Import ${csvPreview ? csvPreview.totalRows : 0} Contacts`}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

function RefreshCw({ size, className }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
            <path d="M3 21v-5h5" />
        </svg>
    )
}
