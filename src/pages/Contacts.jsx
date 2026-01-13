import { useState, useEffect } from 'react'
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
    Search as SearchIcon
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

    // Form state
    const [formData, setFormData] = useState({ name: '', phone: '', email: '', notes: '', tags: [] })
    const [submitting, setSubmitting] = useState(false)
    const [editId, setEditId] = useState(null)

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
            res.data?.forEach(c => c.tags?.forEach(t => allTags.add(t.name)))
            setTags(Array.from(allTags).map(t => ({ name: t, color: tagColors[t] || '#6366f1' })))
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
            } else {
                await api.post('/contacts', formData)
            }
            setShowModal(false)
            setFormData({ name: '', phone: '', email: '', notes: '', tags: [] })
            setEditId(null)
            fetchContacts(pagination.page)
        } catch (error) {
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
            tags: contact.tags?.map(t => t.name) || []
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
                    <button className="btn btn-secondary">
                        <Upload size={16} />
                        Import
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
                                            {contact.tags?.map((t, idx) => (
                                                <span key={idx} style={{ padding: '2px 8px', fontSize: '0.625rem', fontWeight: 500, borderRadius: 'var(--radius-full)', background: `${tagColors[t.name] || '#6366f1'}20`, color: tagColors[t.name] || '#6366f1' }}>
                                                    {t.name}
                                                </span>
                                            ))}
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

            {/* Modal */}
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
