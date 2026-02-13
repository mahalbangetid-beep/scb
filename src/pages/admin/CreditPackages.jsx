import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Star, DollarSign, Package, ToggleLeft, ToggleRight, Gift, AlertTriangle, Zap, Search } from 'lucide-react';
import api from '../../services/api';

const CreditPackages = () => {
    const [packages, setPackages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    const [formData, setFormData] = useState({
        name: '',
        description: '',
        price: '',
        credits: '',
        bonusCredits: '0',
        discountPct: '0',
        minPurchase: '1',
        maxPurchase: '',
        sortOrder: '0',
        isActive: true,
        isFeatured: false
    });

    useEffect(() => {
        fetchPackages();
    }, []);

    const fetchPackages = async () => {
        try {
            setLoading(true);
            const res = await api.get('/credit-packages/admin/all');
            setPackages(res.data.data || []);
        } catch (err) {
            setError('Failed to load packages');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const data = {
                ...formData,
                price: parseFloat(formData.price),
                credits: parseInt(formData.credits),
                bonusCredits: parseInt(formData.bonusCredits) || 0,
                discountPct: parseInt(formData.discountPct) || 0,
                minPurchase: parseInt(formData.minPurchase) || 1,
                maxPurchase: formData.maxPurchase ? parseInt(formData.maxPurchase) : null,
                sortOrder: parseInt(formData.sortOrder) || 0
            };

            if (editingItem) {
                await api.put(`/credit-packages/admin/${editingItem.id}`, data);
                setSuccess('Package updated');
            } else {
                await api.post('/credit-packages/admin', data);
                setSuccess('Package created');
            }
            setShowModal(false);
            setEditingItem(null);
            resetForm();
            fetchPackages();
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to save');
        }
    };

    const handleEdit = (item) => {
        setEditingItem(item);
        setFormData({
            name: item.name,
            description: item.description || '',
            price: item.price.toString(),
            credits: item.credits.toString(),
            bonusCredits: (item.bonusCredits || 0).toString(),
            discountPct: (item.discountPct || 0).toString(),
            minPurchase: (item.minPurchase || 1).toString(),
            maxPurchase: item.maxPurchase ? item.maxPurchase.toString() : '',
            sortOrder: (item.sortOrder || 0).toString(),
            isActive: item.isActive,
            isFeatured: item.isFeatured
        });
        setShowModal(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this package?')) return;
        try {
            await api.delete(`/credit-packages/admin/${id}`);
            setSuccess('Package deleted');
            fetchPackages();
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError('Failed to delete');
        }
    };

    const handleToggle = async (id) => {
        try {
            await api.post(`/credit-packages/admin/${id}/toggle`);
            fetchPackages();
        } catch (err) {
            setError('Failed to toggle');
        }
    };

    const handleFeature = async (id) => {
        try {
            await api.post(`/credit-packages/admin/${id}/feature`);
            fetchPackages();
        } catch (err) {
            setError('Failed to update featured status');
        }
    };

    const resetForm = () => {
        setFormData({
            name: '',
            description: '',
            price: '',
            credits: '',
            bonusCredits: '0',
            discountPct: '0',
            minPurchase: '1',
            maxPurchase: '',
            sortOrder: '0',
            isActive: true,
            isFeatured: false
        });
    };

    if (loading) {
        return (
            <div className="page-container">
                <div className="loading-state">
                    <div className="spinner"></div>
                    <p>Loading credit packages...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <div className="header-content">
                    <h1><Package size={28} /> Credit Packages</h1>
                    <p className="header-subtitle">Manage credit packages for user purchase</p>
                </div>
                <button className="btn btn-primary" onClick={() => { resetForm(); setEditingItem(null); setShowModal(true); }}>
                    <Plus size={16} /> Add Package
                </button>
            </div>

            {error && <div className="alert alert-error"><AlertTriangle size={20} />{error}</div>}
            {success && <div className="alert alert-success"><Zap size={20} />{success}</div>}

            {/* Search */}
            <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                <div className="search-box">
                    <Search size={18} />
                    <input
                        type="text"
                        placeholder="Search packages by name..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* Packages Grid */}
            <div className="packages-grid">
                {packages
                    .filter(pkg => !searchTerm || pkg.name.toLowerCase().includes(searchTerm.toLowerCase()) || (pkg.description && pkg.description.toLowerCase().includes(searchTerm.toLowerCase())))
                    .map(pkg => (
                        <div key={pkg.id} className={`package-card ${pkg.isFeatured ? 'featured' : ''} ${!pkg.isActive ? 'inactive' : ''}`}>
                            {pkg.isFeatured && (
                                <div className="featured-badge">
                                    <Star size={14} /> Featured
                                </div>
                            )}

                            <div className="package-header">
                                <h3>{pkg.name}</h3>
                                {!pkg.isActive && <span className="badge badge-warning">Inactive</span>}
                            </div>

                            <div className="package-price">
                                <span className="currency">$</span>
                                <span className="amount">{pkg.price}</span>
                            </div>

                            <div className="package-credits">
                                <div className="credits-main">
                                    <strong>{pkg.credits.toLocaleString()}</strong> credits
                                </div>
                                {pkg.bonusCredits > 0 && (
                                    <div className="credits-bonus">
                                        <Gift size={14} /> +{pkg.bonusCredits.toLocaleString()} bonus
                                    </div>
                                )}
                                {pkg.discountPct > 0 && (
                                    <div className="credits-discount">
                                        {pkg.discountPct}% off
                                    </div>
                                )}
                            </div>

                            <div className="package-value">
                                <small>
                                    {pkg.creditsPerDollar?.toFixed(0)} credits/$ • ${pkg.costPerCredit?.toFixed(4)}/credit
                                </small>
                            </div>

                            {pkg.description && (
                                <p className="package-description">{pkg.description}</p>
                            )}

                            <div className="package-actions">
                                <button
                                    className={`btn btn-ghost btn-icon ${pkg.isActive ? 'text-success' : 'text-muted'}`}
                                    onClick={() => handleToggle(pkg.id)}
                                    title={pkg.isActive ? 'Active' : 'Inactive'}
                                >
                                    {pkg.isActive ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                                </button>
                                <button
                                    className={`btn btn-ghost btn-icon ${pkg.isFeatured ? 'text-warning' : 'text-muted'}`}
                                    onClick={() => handleFeature(pkg.id)}
                                    title={pkg.isFeatured ? 'Featured' : 'Not Featured'}
                                >
                                    <Star size={18} />
                                </button>
                                <button className="btn btn-ghost btn-icon" onClick={() => handleEdit(pkg)}>
                                    <Edit2 size={16} />
                                </button>
                                <button className="btn btn-ghost btn-icon text-danger" onClick={() => handleDelete(pkg.id)}>
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay open">
                    <div className="modal" style={{ maxWidth: '550px' }}>
                        <div className="modal-header">
                            <h3>{editingItem ? 'Edit' : 'Add'} Credit Package</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>&times;</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Package Name *</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            placeholder="e.g., Pro Package"
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Sort Order</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            value={formData.sortOrder}
                                            onChange={(e) => setFormData({ ...formData, sortOrder: e.target.value })}
                                            min="0"
                                        />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label>Description</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        placeholder="Short description..."
                                    />
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Price ($) *</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            value={formData.price}
                                            onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                                            placeholder="50"
                                            step="0.01"
                                            min="0"
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Credits *</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            value={formData.credits}
                                            onChange={(e) => setFormData({ ...formData, credits: e.target.value })}
                                            placeholder="5000"
                                            min="1"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Bonus Credits</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            value={formData.bonusCredits}
                                            onChange={(e) => setFormData({ ...formData, bonusCredits: e.target.value })}
                                            placeholder="500"
                                            min="0"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Discount %</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            value={formData.discountPct}
                                            onChange={(e) => setFormData({ ...formData, discountPct: e.target.value })}
                                            placeholder="15"
                                            min="0"
                                            max="100"
                                        />
                                    </div>
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Min Purchase</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            value={formData.minPurchase}
                                            onChange={(e) => setFormData({ ...formData, minPurchase: e.target.value })}
                                            min="1"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Max Purchase</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            value={formData.maxPurchase}
                                            onChange={(e) => setFormData({ ...formData, maxPurchase: e.target.value })}
                                            placeholder="Unlimited"
                                            min="1"
                                        />
                                    </div>
                                </div>

                                <div className="form-row">
                                    <label className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={formData.isActive}
                                            onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                                        />
                                        Active
                                    </label>
                                    <label className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={formData.isFeatured}
                                            onChange={(e) => setFormData({ ...formData, isFeatured: e.target.checked })}
                                        />
                                        Featured
                                    </label>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">{editingItem ? 'Update' : 'Create'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <style jsx>{`
        .packages-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 1.5rem;
        }
        .package-card {
          background: var(--bg-card);
          border: 2px solid var(--border-color);
          border-radius: 16px;
          padding: 1.5rem;
          position: relative;
          transition: all 0.3s ease;
        }
        .package-card:hover {
          border-color: var(--primary-color);
          transform: translateY(-2px);
        }
        .package-card.featured {
          border-color: #f59e0b;
          background: linear-gradient(135deg, rgba(245, 158, 11, 0.05), transparent);
        }
        .package-card.inactive {
          opacity: 0.6;
        }
        .featured-badge {
          position: absolute;
          top: -10px;
          right: 15px;
          background: linear-gradient(135deg, #f59e0b, #d97706);
          color: white;
          padding: 0.25rem 0.75rem;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }
        .package-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1rem;
        }
        .package-header h3 {
          margin: 0;
          font-size: 1.25rem;
        }
        .package-price {
          display: flex;
          align-items: flex-start;
          margin-bottom: 0.75rem;
        }
        .package-price .currency {
          font-size: 1.25rem;
          color: var(--text-secondary);
        }
        .package-price .amount {
          font-size: 2.5rem;
          font-weight: 700;
          line-height: 1;
          color: var(--primary-color);
        }
        .package-credits {
          margin-bottom: 0.5rem;
        }
        .credits-main {
          font-size: 1.1rem;
        }
        .credits-bonus {
          color: var(--success-color);
          font-size: 0.9rem;
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }
        .credits-discount {
          display: inline-block;
          background: var(--danger-color);
          color: white;
          padding: 0.125rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          margin-top: 0.25rem;
        }
        .package-value {
          color: var(--text-secondary);
          margin-bottom: 0.75rem;
        }
        .package-description {
          color: var(--text-secondary);
          font-size: 0.9rem;
          margin-bottom: 1rem;
        }
        .package-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.25rem;
          border-top: 1px solid var(--border-color);
          padding-top: 1rem;
          margin-top: auto;
        }
        .form-row {
          display: flex;
          gap: 1rem;
        }
        .form-row .form-group {
          flex: 1;
        }
        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
        }
      `}</style>
        </div>
    );
};

export default CreditPackages;
