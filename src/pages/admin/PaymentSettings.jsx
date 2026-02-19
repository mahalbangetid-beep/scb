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
    X,
    Smartphone,
    Coins,
    Building2
} from 'lucide-react';
import api from '../../services/api';

// Tab configuration
const paymentTabs = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'esewa', label: 'eSewa', icon: Smartphone },
    { id: 'cryptomus', label: 'Cryptomus', icon: Coins },
    { id: 'binance', label: 'Binance', icon: CreditCard },
    { id: 'manual', label: 'Manual', icon: Building2 },
];

const PaymentSettings = () => {
    const [activeTab, setActiveTab] = useState('general');
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
        esewa_countries: 'NP',

        // Cryptomus
        cryptomus_enabled: false,
        cryptomus_merchant_id: '',
        cryptomus_api_key: '',
        cryptomus_countries: '*',

        // Binance Pay
        binance_enabled: false,
        binance_api_key: '',
        binance_secret: '',
        binance_id: '',
        binance_qr_url: '',
        binance_min_amount: 1,
        binance_bonus: 0,
        binance_name: '',
        binance_currency: 'USDT',
        binance_countries: '*',

        // Manual Payment
        manual_enabled: true,
        manual_bank_name: '',
        manual_account_name: '',
        manual_account_number: '',
        manual_paypal_email: '',
        manual_instructions: '',
        manual_countries: '*',

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
            }

            // Fetch saved settings
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
            const configItems = Object.entries(settings).map(([key, value]) => ({
                key,
                value: String(value),
                category: 'payment'
            }));

            // Use bulk update endpoint - much faster than individual calls
            await api.put('/admin/config/bulk', { items: configItems });

            setSuccess('Payment settings saved successfully');
            setTimeout(() => setSuccess(null), 3000);

            // Re-fetch gateway status after save
            await fetchData();
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

            {/* Tab Navigation */}
            <div className="payment-tabs">
                {paymentTabs.map((tab) => (
                    <button
                        key={tab.id}
                        className={`payment-tab ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        <tab.icon size={18} />
                        <span>{tab.label}</span>
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="tab-content">
                {/* General Tab */}
                {activeTab === 'general' && (
                    <div className="settings-section">
                        <div className="section-header-content">
                            <h2><Settings size={20} /> General Settings</h2>
                            <p>Configure global payment settings</p>
                        </div>

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

                        {/* Gateway Status Overview */}
                        <div className="gateway-overview">
                            <h3><Shield size={18} /> Gateway Status</h3>
                            <div className="gateway-status-grid">
                                {gateways.map(gateway => (
                                    <div key={gateway.id} className={`gateway-status-card ${gateway.isAvailable ? 'active' : 'inactive'}`}>
                                        <div className="gateway-icon">{gateway.icon}</div>
                                        <div className="gateway-info">
                                            <h4>{gateway.name}</h4>
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

                        {/* Webhook URLs */}
                        <div className="webhook-section">
                            <h3><Globe size={18} /> Webhook URLs</h3>
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
                    </div>
                )}

                {/* eSewa Tab */}
                {activeTab === 'esewa' && (
                    <div className="settings-section">
                        <div className="section-header-content">
                            <div className="header-with-toggle">
                                <div>
                                    <h2>📱 eSewa (Nepal)</h2>
                                    <p>Accept payments via eSewa mobile wallet</p>
                                </div>
                                <label className="toggle">
                                    <input
                                        type="checkbox"
                                        checked={settings.esewa_enabled === true || settings.esewa_enabled === 'true'}
                                        onChange={(e) => handleChange('esewa_enabled', e.target.checked)}
                                    />
                                    <span className="slider"></span>
                                </label>
                            </div>
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
                            <div className="form-group">
                                <label><Globe size={16} /> Allowed Countries</label>
                                <input
                                    type="text"
                                    value={settings.esewa_countries || 'NP'}
                                    onChange={(e) => handleChange('esewa_countries', e.target.value)}
                                    placeholder="NP"
                                />
                                <small className="form-hint">Comma-separated ISO country codes. Use * for all countries.</small>
                            </div>
                        </div>
                    </div>
                )}

                {/* Cryptomus Tab */}
                {activeTab === 'cryptomus' && (
                    <div className="settings-section">
                        <div className="section-header-content">
                            <div className="header-with-toggle">
                                <div>
                                    <h2>💎 Cryptomus</h2>
                                    <p>Accept cryptocurrency payments</p>
                                </div>
                                <label className="toggle">
                                    <input
                                        type="checkbox"
                                        checked={settings.cryptomus_enabled === true || settings.cryptomus_enabled === 'true'}
                                        onChange={(e) => handleChange('cryptomus_enabled', e.target.checked)}
                                    />
                                    <span className="slider"></span>
                                </label>
                            </div>
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
                            <div className="form-group">
                                <label><Globe size={16} /> Allowed Countries</label>
                                <input
                                    type="text"
                                    value={settings.cryptomus_countries || '*'}
                                    onChange={(e) => handleChange('cryptomus_countries', e.target.value)}
                                    placeholder="*"
                                />
                                <small className="form-hint">Comma-separated ISO country codes. Use * for all countries.</small>
                            </div>
                        </div>
                    </div>
                )}

                {/* Binance Tab */}
                {activeTab === 'binance' && (
                    <div className="settings-section">
                        <div className="section-header-content">
                            <div className="header-with-toggle">
                                <div>
                                    <h2>💎 Binance (Manual Verification)</h2>
                                    <p>Accept crypto payments via Binance P2P with manual verification</p>
                                </div>
                                <label className="toggle">
                                    <input
                                        type="checkbox"
                                        checked={settings.binance_enabled === true || settings.binance_enabled === 'true'}
                                        onChange={(e) => handleChange('binance_enabled', e.target.checked)}
                                    />
                                    <span className="slider"></span>
                                </label>
                            </div>
                        </div>

                        <div className="form-group" style={{ marginBottom: 'var(--spacing-lg)' }}>
                            <label>Custom Name</label>
                            <input
                                type="text"
                                value={settings.binance_name || ''}
                                onChange={(e) => handleChange('binance_name', e.target.value)}
                                placeholder="e.g., Binance [5% Bonus Min 1000$+] [AUTO]"
                            />
                            <small className="form-hint">Display name shown to customers</small>
                        </div>

                        {/* Instructions Box */}
                        <div className="instructions-box">
                            <div className="instructions-section">
                                <strong>Creating QR code</strong>
                                <ol>
                                    <li>Mobile Binance App</li>
                                    <li>Log into your Binance account</li>
                                    <li>Go to More → Pay</li>
                                    <li>Click on Receive to get the QR code</li>
                                    <li>Save it and upload it in image hosting website such as IMGBB.COM or Cloudinary</li>
                                    <li>Paste the URL in the form</li>
                                </ol>
                            </div>
                            <div className="instructions-section">
                                <strong>How to create an API on Binance</strong>
                                <ol>
                                    <li>Open the <a href="https://www.binance.com/en/my/settings/api-management" target="_blank" rel="noopener noreferrer">API Management</a> in your Binance account</li>
                                    <li>Click Create API</li>
                                    <li>Choose App type System Generated</li>
                                    <li>Set the permissions: <strong>Enable Reading</strong> or <strong>Read-Only</strong></li>
                                    <li>Set the IP access Restriction <strong>Unrestricted</strong></li>
                                </ol>
                            </div>
                            <div className="instructions-section">
                                <strong>How to copy Binance ID</strong>
                                <ol>
                                    <li>Open the <a href="https://www.binance.com/en/my/settings/profile" target="_blank" rel="noopener noreferrer">Account → Identification</a> in your Binance account</li>
                                    <li>Copy the ID under your binance account</li>
                                </ol>
                            </div>
                            <div className="instructions-section important-note">
                                <strong>Important Note</strong>
                                <ol>
                                    <li>In the description, write Binance ID, QR code, or Binance nickname to make the payment process easier for the customer</li>
                                    <li>Customers must use either <strong>USDT, USDC, or BUSD</strong> for transactions. The system will not verify or accept any other currencies.</li>
                                    <li>Customers must use the order ID / transaction ID to validate the payment.</li>
                                    <li><strong>Important:</strong> Store your API Key and Secret Key securely and do not share them with anyone.</li>
                                </ol>
                            </div>
                        </div>

                        <div className="settings-grid">
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
                                    value={settings.binance_secret}
                                    onChange={(e) => handleChange('binance_secret', e.target.value)}
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>

                        <div className="settings-grid">
                            <div className="form-group">
                                <label>Binance ID</label>
                                <input
                                    type="text"
                                    value={settings.binance_id || ''}
                                    onChange={(e) => handleChange('binance_id', e.target.value)}
                                    placeholder="Your Binance User ID"
                                />
                            </div>
                            <div className="form-group">
                                <label>Currency</label>
                                <select
                                    value={settings.binance_currency || 'USDT'}
                                    onChange={(e) => handleChange('binance_currency', e.target.value)}
                                >
                                    <option value="USDT">USDT</option>
                                    <option value="USDC">USDC</option>
                                    <option value="BUSD">BUSD</option>
                                </select>
                            </div>
                        </div>

                        <div className="form-group" style={{ marginBottom: 'var(--spacing-lg)' }}>
                            <label>QR Image URL</label>
                            <input
                                type="text"
                                value={settings.binance_qr_url || ''}
                                onChange={(e) => handleChange('binance_qr_url', e.target.value)}
                                placeholder="https://i.ibb.co/xxx/binance-qr.png"
                            />
                            <small className="form-hint">Upload your QR to ImgBB or Cloudinary and paste the URL here</small>
                        </div>

                        <div className="settings-grid">
                            <div className="form-group">
                                <label>Minimum Amount ($)</label>
                                <input
                                    type="number"
                                    min="1"
                                    value={settings.binance_min_amount || 1}
                                    onChange={(e) => handleChange('binance_min_amount', e.target.value)}
                                />
                            </div>
                            <div className="form-group">
                                <label>Bonus Percentage (%)</label>
                                <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.5"
                                    value={settings.binance_bonus || 0}
                                    onChange={(e) => handleChange('binance_bonus', e.target.value)}
                                    placeholder="e.g., 5 for 5% bonus"
                                />
                                <small className="form-hint">Extra credit given to customers (e.g., 5 = +5%)</small>
                            </div>
                        </div>

                        <div className="form-group">
                            <label><Globe size={16} /> Allowed Countries</label>
                            <input
                                type="text"
                                value={settings.binance_countries || '*'}
                                onChange={(e) => handleChange('binance_countries', e.target.value)}
                                placeholder="*"
                            />
                            <small className="form-hint">Comma-separated ISO country codes. Use * for all countries.</small>
                        </div>
                    </div>
                )}

                {/* Manual Payment Tab */}
                {activeTab === 'manual' && (
                    <div className="settings-section">
                        <div className="section-header-content">
                            <div className="header-with-toggle">
                                <div>
                                    <h2>🏦 Manual Payment</h2>
                                    <p>Accept bank transfers and manual payments</p>
                                </div>
                                <label className="toggle">
                                    <input
                                        type="checkbox"
                                        checked={settings.manual_enabled === true || settings.manual_enabled === 'true'}
                                        onChange={(e) => handleChange('manual_enabled', e.target.checked)}
                                    />
                                    <span className="slider"></span>
                                </label>
                            </div>
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
                        <div className="form-group">
                            <label><Globe size={16} /> Allowed Countries</label>
                            <input
                                type="text"
                                value={settings.manual_countries || '*'}
                                onChange={(e) => handleChange('manual_countries', e.target.value)}
                                placeholder="*"
                            />
                            <small className="form-hint">Comma-separated ISO country codes. Use * for all countries.</small>
                        </div>
                    </div>
                )}
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

                /* Tab Navigation */
                .payment-tabs {
                    display: flex;
                    gap: var(--spacing-xs);
                    background: var(--bg-secondary);
                    padding: var(--spacing-sm);
                    border-radius: var(--radius-lg);
                    margin-bottom: var(--spacing-lg);
                    overflow-x: auto;
                }

                .payment-tab {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-sm) var(--spacing-lg);
                    background: transparent;
                    border: none;
                    border-radius: var(--radius-md);
                    color: var(--text-secondary);
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                    white-space: nowrap;
                }

                .payment-tab:hover {
                    background: var(--bg-tertiary);
                    color: var(--text-primary);
                }

                .payment-tab.active {
                    background: var(--primary-500);
                    color: white;
                }

                /* Tab Content */
                .tab-content {
                    animation: fadeIn 0.2s ease;
                }

                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .settings-section {
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-lg);
                    padding: var(--spacing-xl);
                }

                .section-header-content {
                    margin-bottom: var(--spacing-lg);
                }

                .section-header-content h2 {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    margin: 0 0 var(--spacing-xs);
                    font-size: 1.25rem;
                }

                .section-header-content p {
                    color: var(--text-secondary);
                    margin: 0;
                    font-size: 0.875rem;
                }

                .header-with-toggle {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .settings-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                    gap: var(--spacing-lg);
                    margin-bottom: var(--spacing-lg);
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

                .form-hint {
                    font-size: 0.75rem;
                    color: var(--text-secondary);
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

                /* Toggle */
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

                /* Info Box */
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

                /* Instructions Box */
                .instructions-box {
                    background: var(--bg-tertiary);
                    border: 1px solid var(--border-color);
                    border-left: 4px solid #dc2626;
                    border-radius: var(--radius-md);
                    padding: var(--spacing-md);
                    margin-bottom: var(--spacing-lg);
                    font-size: 0.85rem;
                }

                .instructions-section {
                    margin-bottom: var(--spacing-md);
                }

                .instructions-section:last-child {
                    margin-bottom: 0;
                }

                .instructions-section strong {
                    color: var(--text-primary);
                    display: block;
                    margin-bottom: var(--spacing-xs);
                }

                .instructions-section ol {
                    margin: 0;
                    padding-left: var(--spacing-lg);
                    color: var(--text-secondary);
                }

                .instructions-section ol li {
                    margin-bottom: 2px;
                }

                .instructions-section a {
                    color: #3b82f6;
                    text-decoration: none;
                }

                .instructions-section a:hover {
                    text-decoration: underline;
                }

                .important-note {
                    background: rgba(220, 38, 38, 0.05);
                    padding: var(--spacing-sm);
                    border-radius: var(--radius-sm);
                }

                /* Gateway Overview */
                .gateway-overview {
                    margin-top: var(--spacing-xl);
                    padding-top: var(--spacing-xl);
                    border-top: 1px solid var(--border-color);
                }

                .gateway-overview h3 {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    margin-bottom: var(--spacing-lg);
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

                .gateway-info h4 {
                    margin: 0 0 var(--spacing-xs);
                    font-size: 1rem;
                }

                .gateway-info p {
                    margin: 0;
                    font-size: 0.75rem;
                    color: var(--text-secondary);
                }

                /* Webhook Section */
                .webhook-section {
                    margin-top: var(--spacing-xl);
                    padding-top: var(--spacing-xl);
                    border-top: 1px solid var(--border-color);
                }

                .webhook-section h3 {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    margin-bottom: var(--spacing-sm);
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

                /* Badge */
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

                /* Alert */
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

                /* Loading */
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

                /* Button */
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
