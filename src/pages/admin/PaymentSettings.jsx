import { useState, useEffect } from 'react';
import {
    CreditCard,
    Settings,
    CheckCircle,
    XCircle,
    Save,
    RefreshCw,
    DollarSign,
    Key,
    Globe,
    Shield,
    AlertTriangle,
    Info,
    X
} from 'lucide-react';
import api from '../../services/api';

const PaymentSettings = () => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [gateways, setGateways] = useState([]);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [settings, setSettings] = useState({
        // Esewa
        esewa_enabled: false,
        esewa_merchant_code: '',
        esewa_secret_key: '',
        esewa_sandbox: true,

        // Cryptomus
        cryptomus_enabled: false,
        cryptomus_merchant_id: '',
        cryptomus_api_key: '',

        // Binance Pay
        binance_enabled: false,
        binance_api_key: '',
        binance_api_secret: '',
        binance_merchant_id: '',

        // Manual Payment
        manual_enabled: true,
        manual_bank_name: '',
        manual_account_name: '',
        manual_account_number: '',
        manual_paypal_email: '',
        manual_instructions: '',

        // General
        min_deposit: 5,
        max_deposit: 10000,
        currency: 'USD'
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            // Fetch available gateways
            try {
                const gatewaysRes = await api.get('/payments/gateways');
                if (gatewaysRes.success && gatewaysRes.gateways) {
                    setGateways(gatewaysRes.gateways);
                }
            } catch (err) {
                console.warn('Could not fetch gateways:', err.message);
                // Still continue - gateways info is not critical
            }

            // Fetch saved settings (optional - may not exist yet)
            try {
                const settingsRes = await api.get('/admin/config?category=payment');
                if (settingsRes.data) {
                    const paymentConfig = settingsRes.data.payment || [];
                    const savedSettings = {};
                    paymentConfig.forEach(s => {
                        savedSettings[s.key] = s.value;
                    });
                    setSettings(prev => ({ ...prev, ...savedSettings }));
                }
            } catch (err) {
                // Settings may not exist yet - that's OK
                console.warn('No saved payment settings found, using defaults');
            }
        } catch (err) {
            console.error('Failed to fetch payment settings:', err);
            setError('Failed to load payment settings');
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (key, value) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        setSuccess(null);
        try {
            // Save each setting to config API
            const configItems = Object.entries(settings).map(([key, value]) => ({
                key,
                value: String(value),
                category: 'payment'
            }));

            // Save each config item
            for (const item of configItems) {
                await api.put('/admin/config', item);
            }
            setSuccess('Payment settings saved successfully');
        } catch (err) {
            console.error('Failed to save settings:', err);
            setError('Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    const getGatewayStatus = (gatewayId) => {
        const gateway = gateways.find(g => g.id === gatewayId);
        return gateway?.isAvailable || false;
    };

    if (loading) {
        return (
            <div className="page-container">
                <div className="loading-container">
                    <RefreshCw className="spin" size={32} />
                    <p>Loading payment settings...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <h1 className="page-title"><CreditCard size={28} /> Payment Gateway Settings</h1>
                    <p className="page-subtitle">Configure payment gateways for user deposits</p>
                </div>
                <button className="btn-primary" onClick={handleSave} disabled={saving}>
                    {saving ? <RefreshCw className="spin" size={18} /> : <Save size={18} />}
                    Save Settings
                </button>
            </div>

            {error && (
                <div className="alert alert-error">
                    <XCircle size={18} />
                    <span>{error}</span>
                    <button onClick={() => setError(null)}><X size={16} /></button>
                </div>
            )}

            {success && (
                <div className="alert alert-success">
                    <CheckCircle size={18} />
                    <span>{success}</span>
                    <button onClick={() => setSuccess(null)}><X size={16} /></button>
                </div>
            )}

            {/* Gateway Status Overview */}
            <div className="settings-section">
                <h2><Shield size={20} /> Gateway Status</h2>
                <div className="gateway-status-grid">
                    {gateways.map(gateway => (
                        <div key={gateway.id} className={`gateway-status-card ${gateway.isAvailable ? 'active' : 'inactive'}`}>
                            <div className="gateway-icon">{gateway.icon}</div>
                            <div className="gateway-info">
                                <h3>{gateway.name}</h3>
                                <p>{gateway.description}</p>
                            </div>
                            <div className="gateway-badge">
                                {gateway.isAvailable ? (
                                    <span className="badge success"><CheckCircle size={14} /> Active</span>
                                ) : gateway.isPlaceholder ? (
                                    <span className="badge warning"><AlertTriangle size={14} /> Placeholder</span>
                                ) : (
                                    <span className="badge danger"><XCircle size={14} /> Not Configured</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* General Settings */}
            <div className="settings-section">
                <h2><Settings size={20} /> General Settings</h2>
                <div className="settings-grid">
                    <div className="form-group">
                        <label><DollarSign size={16} /> Currency</label>
                        <select
                            value={settings.currency}
                            onChange={(e) => handleChange('currency', e.target.value)}
                        >
                            <option value="USD">USD - US Dollar</option>
                            <option value="EUR">EUR - Euro</option>
                            <option value="NPR">NPR - Nepalese Rupee</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Minimum Deposit</label>
                        <input
                            type="number"
                            value={settings.min_deposit}
                            onChange={(e) => handleChange('min_deposit', e.target.value)}
                        />
                    </div>
                    <div className="form-group">
                        <label>Maximum Deposit</label>
                        <input
                            type="number"
                            value={settings.max_deposit}
                            onChange={(e) => handleChange('max_deposit', e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* Esewa Settings */}
            <div className="settings-section">
                <div className="section-header">
                    <h2>📱 eSewa (Nepal)</h2>
                    <label className="toggle">
                        <input
                            type="checkbox"
                            checked={settings.esewa_enabled === true || settings.esewa_enabled === 'true'}
                            onChange={(e) => handleChange('esewa_enabled', e.target.checked)}
                        />
                        <span className="slider"></span>
                    </label>
                </div>
                <div className="info-box">
                    <Info size={16} />
                    <span>eSewa has full sandbox support. Use test credentials for development.</span>
                </div>
                <div className="settings-grid">
                    <div className="form-group">
                        <label><Key size={16} /> Merchant Code</label>
                        <input
                            type="text"
                            value={settings.esewa_merchant_code}
                            onChange={(e) => handleChange('esewa_merchant_code', e.target.value)}
                            placeholder="EPAYTEST (sandbox)"
                        />
                    </div>
                    <div className="form-group">
                        <label><Key size={16} /> Secret Key</label>
                        <input
                            type="password"
                            value={settings.esewa_secret_key}
                            onChange={(e) => handleChange('esewa_secret_key', e.target.value)}
                            placeholder="••••••••"
                        />
                    </div>
                    <div className="form-group">
                        <label className="checkbox-label">
                            <input
                                type="checkbox"
                                checked={settings.esewa_sandbox === true || settings.esewa_sandbox === 'true'}
                                onChange={(e) => handleChange('esewa_sandbox', e.target.checked)}
                            />
                            Sandbox Mode (Testing)
                        </label>
                    </div>
                </div>
            </div>

            {/* Cryptomus Settings */}
            <div className="settings-section">
                <div className="section-header">
                    <h2>💎 Cryptomus (Crypto)</h2>
                    <label className="toggle">
                        <input
                            type="checkbox"
                            checked={settings.cryptomus_enabled === true || settings.cryptomus_enabled === 'true'}
                            onChange={(e) => handleChange('cryptomus_enabled', e.target.checked)}
                        />
                        <span className="slider"></span>
                    </label>
                </div>
                <div className="info-box warning">
                    <AlertTriangle size={16} />
                    <span>Cryptomus requires merchant account with KYC verification.</span>
                </div>
                <div className="settings-grid">
                    <div className="form-group">
                        <label><Key size={16} /> Merchant ID</label>
                        <input
                            type="text"
                            value={settings.cryptomus_merchant_id}
                            onChange={(e) => handleChange('cryptomus_merchant_id', e.target.value)}
                            placeholder="Your Merchant ID"
                        />
                    </div>
                    <div className="form-group">
                        <label><Key size={16} /> API Key</label>
                        <input
                            type="password"
                            value={settings.cryptomus_api_key}
                            onChange={(e) => handleChange('cryptomus_api_key', e.target.value)}
                            placeholder="••••••••"
                        />
                    </div>
                </div>
            </div>

            {/* Binance Pay Settings */}
            <div className="settings-section">
                <div className="section-header">
                    <h2>₿ Binance Pay</h2>
                    <label className="toggle">
                        <input
                            type="checkbox"
                            checked={settings.binance_enabled === true || settings.binance_enabled === 'true'}
                            onChange={(e) => handleChange('binance_enabled', e.target.checked)}
                        />
                        <span className="slider"></span>
                    </label>
                </div>
                <div className="info-box warning">
                    <AlertTriangle size={16} />
                    <span>Binance Pay has no sandbox. Testing requires live API with small amounts.</span>
                </div>
                <div className="settings-grid">
                    <div className="form-group">
                        <label><Key size={16} /> Merchant ID</label>
                        <input
                            type="text"
                            value={settings.binance_merchant_id}
                            onChange={(e) => handleChange('binance_merchant_id', e.target.value)}
                            placeholder="Your Merchant ID"
                        />
                    </div>
                    <div className="form-group">
                        <label><Key size={16} /> API Key</label>
                        <input
                            type="password"
                            value={settings.binance_api_key}
                            onChange={(e) => handleChange('binance_api_key', e.target.value)}
                            placeholder="••••••••"
                        />
                    </div>
                    <div className="form-group">
                        <label><Key size={16} /> API Secret</label>
                        <input
                            type="password"
                            value={settings.binance_api_secret}
                            onChange={(e) => handleChange('binance_api_secret', e.target.value)}
                            placeholder="••••••••"
                        />
                    </div>
                </div>
            </div>

            {/* Manual Payment Settings */}
            <div className="settings-section">
                <div className="section-header">
                    <h2>🏦 Manual Payment</h2>
                    <label className="toggle">
                        <input
                            type="checkbox"
                            checked={settings.manual_enabled === true || settings.manual_enabled === 'true'}
                            onChange={(e) => handleChange('manual_enabled', e.target.checked)}
                        />
                        <span className="slider"></span>
                    </label>
                </div>
                <div className="info-box">
                    <Info size={16} />
                    <span>Manual payments require admin approval before crediting user wallet.</span>
                </div>
                <div className="settings-grid">
                    <div className="form-group">
                        <label>Bank Name</label>
                        <input
                            type="text"
                            value={settings.manual_bank_name}
                            onChange={(e) => handleChange('manual_bank_name', e.target.value)}
                            placeholder="e.g., Bank of America"
                        />
                    </div>
                    <div className="form-group">
                        <label>Account Name</label>
                        <input
                            type="text"
                            value={settings.manual_account_name}
                            onChange={(e) => handleChange('manual_account_name', e.target.value)}
                            placeholder="Account holder name"
                        />
                    </div>
                    <div className="form-group">
                        <label>Account Number</label>
                        <input
                            type="text"
                            value={settings.manual_account_number}
                            onChange={(e) => handleChange('manual_account_number', e.target.value)}
                            placeholder="Bank account number"
                        />
                    </div>
                    <div className="form-group">
                        <label>PayPal Email</label>
                        <input
                            type="email"
                            value={settings.manual_paypal_email}
                            onChange={(e) => handleChange('manual_paypal_email', e.target.value)}
                            placeholder="paypal@example.com"
                        />
                    </div>
                </div>
                <div className="form-group full-width">
                    <label>Payment Instructions</label>
                    <textarea
                        rows={4}
                        value={settings.manual_instructions}
                        onChange={(e) => handleChange('manual_instructions', e.target.value)}
                        placeholder="Enter instructions that will be shown to users when they select manual payment..."
                    />
                </div>
            </div>

            {/* Webhook URLs Info */}
            <div className="settings-section">
                <h2><Globe size={20} /> Webhook URLs</h2>
                <p className="section-description">Configure these URLs in your payment gateway dashboards:</p>
                <div className="webhook-urls">
                    <div className="webhook-item">
                        <span className="label">Cryptomus IPN:</span>
                        <code>{window.location.origin.replace(':5173', ':3000')}/api/payment-webhooks/cryptomus</code>
                    </div>
                    <div className="webhook-item">
                        <span className="label">Binance Pay:</span>
                        <code>{window.location.origin.replace(':5173', ':3000')}/api/payment-webhooks/binance</code>
                    </div>
                    <div className="webhook-item">
                        <span className="label">eSewa Return:</span>
                        <code>{window.location.origin.replace(':5173', ':3000')}/api/payments/esewa/return</code>
                    </div>
                </div>
            </div>

            <style>{`
                .page-container {
                    padding: var(--spacing-lg);
                }

                .page-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: var(--spacing-xl);
                    flex-wrap: wrap;
                    gap: var(--spacing-md);
                }

                .page-title {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    margin: 0 0 var(--spacing-xs);
                    font-size: 1.5rem;
                }

                .page-subtitle {
                    color: var(--text-secondary);
                    margin: 0;
                }

                .settings-section {
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-lg);
                    padding: var(--spacing-xl);
                    margin-bottom: var(--spacing-lg);
                }

                .settings-section h2 {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    margin: 0 0 var(--spacing-lg);
                    font-size: 1.25rem;
                }

                .section-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: var(--spacing-md);
                }

                .section-header h2 {
                    margin: 0;
                }

                .settings-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                    gap: var(--spacing-lg);
                }

                .form-group {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-xs);
                }

                .form-group.full-width {
                    grid-column: 1 / -1;
                }

                .form-group label {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-xs);
                    font-weight: 500;
                    color: var(--text-primary);
                }

                .form-group input,
                .form-group select,
                .form-group textarea {
                    padding: var(--spacing-sm) var(--spacing-md);
                    background: var(--bg-tertiary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-md);
                    color: var(--text-primary);
                    font-size: 0.875rem;
                }

                .form-group input:focus,
                .form-group select:focus,
                .form-group textarea:focus {
                    outline: none;
                    border-color: var(--primary-500);
                }

                .form-group textarea {
                    resize: vertical;
                    min-height: 100px;
                }

                .checkbox-label {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    cursor: pointer;
                }

                .checkbox-label input[type="checkbox"] {
                    width: 18px;
                    height: 18px;
                    cursor: pointer;
                }

                .toggle {
                    position: relative;
                    display: inline-block;
                    width: 50px;
                    height: 26px;
                }

                .toggle input {
                    opacity: 0;
                    width: 0;
                    height: 0;
                }

                .toggle .slider {
                    position: absolute;
                    cursor: pointer;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background-color: var(--bg-tertiary);
                    transition: 0.3s;
                    border-radius: 26px;
                }

                .toggle .slider:before {
                    position: absolute;
                    content: "";
                    height: 20px;
                    width: 20px;
                    left: 3px;
                    bottom: 3px;
                    background-color: white;
                    transition: 0.3s;
                    border-radius: 50%;
                }

                .toggle input:checked + .slider {
                    background-color: var(--primary-500);
                }

                .toggle input:checked + .slider:before {
                    transform: translateX(24px);
                }

                .info-box {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-md);
                    background: rgba(59, 130, 246, 0.1);
                    border: 1px solid rgba(59, 130, 246, 0.3);
                    border-radius: var(--radius-md);
                    margin-bottom: var(--spacing-lg);
                    color: #3b82f6;
                    font-size: 0.875rem;
                }

                .info-box.warning {
                    background: rgba(251, 191, 36, 0.1);
                    border-color: rgba(251, 191, 36, 0.3);
                    color: #fbbf24;
                }

                .gateway-status-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                    gap: var(--spacing-md);
                }

                .gateway-status-card {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-md);
                    padding: var(--spacing-lg);
                    background: var(--bg-tertiary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-md);
                }

                .gateway-status-card.active {
                    border-color: rgba(34, 197, 94, 0.3);
                }

                .gateway-status-card.inactive {
                    opacity: 0.7;
                }

                .gateway-icon {
                    font-size: 2rem;
                }

                .gateway-info {
                    flex: 1;
                }

                .gateway-info h3 {
                    margin: 0 0 var(--spacing-xs);
                    font-size: 1rem;
                }

                .gateway-info p {
                    margin: 0;
                    font-size: 0.75rem;
                    color: var(--text-secondary);
                }

                .badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    padding: 4px 8px;
                    border-radius: var(--radius-sm);
                    font-size: 0.75rem;
                    font-weight: 500;
                }

                .badge.success {
                    background: rgba(34, 197, 94, 0.1);
                    color: #22c55e;
                }

                .badge.warning {
                    background: rgba(251, 191, 36, 0.1);
                    color: #fbbf24;
                }

                .badge.danger {
                    background: rgba(239, 68, 68, 0.1);
                    color: #ef4444;
                }

                .webhook-urls {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-sm);
                }

                .webhook-item {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-xs);
                    padding: var(--spacing-md);
                    background: var(--bg-tertiary);
                    border-radius: var(--radius-md);
                }

                .webhook-item .label {
                    font-weight: 500;
                    font-size: 0.875rem;
                }

                .webhook-item code {
                    font-family: monospace;
                    font-size: 0.75rem;
                    color: var(--primary-500);
                    word-break: break-all;
                }

                .section-description {
                    color: var(--text-secondary);
                    margin: 0 0 var(--spacing-md);
                    font-size: 0.875rem;
                }

                .alert {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-md);
                    border-radius: var(--radius-md);
                    margin-bottom: var(--spacing-lg);
                }

                .alert-error {
                    background: rgba(239, 68, 68, 0.1);
                    border: 1px solid rgba(239, 68, 68, 0.3);
                    color: #ef4444;
                }

                .alert-success {
                    background: rgba(34, 197, 94, 0.1);
                    border: 1px solid rgba(34, 197, 94, 0.3);
                    color: #22c55e;
                }

                .alert button {
                    margin-left: auto;
                    background: none;
                    border: none;
                    cursor: pointer;
                    color: inherit;
                }

                .loading-container {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: var(--spacing-3xl);
                    color: var(--text-secondary);
                }

                .spin {
                    animation: spin 1s linear infinite;
                }

                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }

                .btn-primary {
                    display: inline-flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-sm) var(--spacing-lg);
                    background: var(--primary-500);
                    color: white;
                    border: none;
                    border-radius: var(--radius-md);
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .btn-primary:hover {
                    background: var(--primary-600);
                }

                .btn-primary:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
            `}</style>
        </div>
    );
};

export default PaymentSettings;
