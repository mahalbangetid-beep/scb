import { useState, useEffect } from 'react'
import {
    Settings as SettingsIcon,
    User,
    Bell,
    Shield,
    Globe,
    Moon,
    Sun,
    Palette,
    Key,
    Database,
    HardDrive,
    Save,
    RefreshCw,
    AlertCircle,
    CheckCircle,
    Eye,
    EyeOff,
    Loader2,
    Plus,
    Trash2,
    Copy,
    Lock,
    Users,
    Clock,
    MessageSquare,
    Bot,
    Zap
} from 'lucide-react'
import api from '../services/api'
import { useTheme } from '../contexts/ThemeContext'

const settingsSections = [
    { id: 'general', label: 'General', icon: SettingsIcon },
    { id: 'account', label: 'Account', icon: User },
    // { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'api', label: 'API Keys', icon: Key },
    // { id: 'storage', label: 'Storage', icon: Database },
]

export default function Settings() {
    const [activeSection, setActiveSection] = useState('general')
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [saved, setSaved] = useState(false)
    const [error, setError] = useState(null)
    const { theme, toggleTheme, isDark } = useTheme()

    // Account state
    const [profile, setProfile] = useState({ name: '', email: '', avatar: '' })

    // API Keys state
    const [apiKeys, setApiKeys] = useState([])
    const [newKey, setNewKey] = useState(null) // To show full key once upon creation

    // Security state
    const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })

    // General state (from backend Setting model)
    const [generalSettings, setGeneralSettings] = useState({
        appName: 'WA Gateway',
        timezone: 'Asia/Jakarta',
        language: 'id',
        dateFormat: 'DD/MM/YYYY',
        darkMode: 'true'
    })

    // Bot Security Settings (from /api/settings/bot-security)
    const [securitySettings, setSecuritySettings] = useState({
        orderClaimMode: 'disabled',
        groupSecurityMode: 'none',
        usernameValidationMode: 'disabled',
        maxCommandsPerMinute: 10,
        commandCooldownSecs: 300,
        showProviderInResponse: false,
        showDetailedStatus: false,
        privateReplyInGroups: false,
        // Action Modes
        refillActionMode: 'forward',
        cancelActionMode: 'forward',
        speedupActionMode: 'forward',
        statusResponseMode: 'standard'
    })

    const fetchProfile = async () => {
        try {
            const res = await api.get('/auth/me')
            setProfile(res.data)
        } catch (err) {
            console.error('Failed to fetch profile:', err)
        }
    }

    const fetchApiKeys = async () => {
        try {
            const res = await api.get('/auth/api-keys')
            setApiKeys(res.data)
        } catch (err) {
            console.error('Failed to fetch API keys:', err)
        }
    }

    const fetchGeneralSettings = async () => {
        try {
            const res = await api.get('/settings')
            if (res.data) {
                setGeneralSettings(prev => ({ ...prev, ...res.data }))
            }
        } catch (err) {
            console.error('Failed to fetch general settings:', err)
        }
    }

    // Fetch Bot Security Settings from API
    const fetchBotSecuritySettings = async () => {
        try {
            const res = await api.get('/settings/bot-security')
            if (res.data) {
                setSecuritySettings(prev => ({ ...prev, ...res.data }))
            }
        } catch (err) {
            console.error('Failed to fetch bot security settings:', err)
        }
    }

    // Save Bot Security Settings
    const handleSaveSecuritySettings = async () => {
        setSubmitting(true)
        setError(null)
        try {
            await api.put('/settings/bot-security', securitySettings)
            setSaved(true)
            setTimeout(() => setSaved(false), 3000)
        } catch (_err) {
            setError('Failed to save security settings')
        } finally {
            setSubmitting(false)
        }
    }

    useEffect(() => {
        const load = async () => {
            setLoading(true)
            await Promise.all([fetchProfile(), fetchApiKeys(), fetchGeneralSettings(), fetchBotSecuritySettings()])
            setLoading(false)
        }
        load()
    }, [])

    const handleSaveGeneral = async () => {
        setSubmitting(true)
        setError(null)
        try {
            await api.post('/settings', generalSettings)
            setSaved(true)
            setTimeout(() => setSaved(false), 3000)
        } catch (_err) {
            setError('Failed to save general settings')
        } finally {
            setSubmitting(false)
        }
    }

    const handleUpdateProfile = async () => {
        setSubmitting(true)
        setError(null)
        try {
            await api.put('/auth/me', { name: profile.name, avatar: profile.avatar })
            setSaved(true)
            setTimeout(() => setSaved(false), 3000)
        } catch (err) {
            setError('Failed to update profile')
        } finally {
            setSubmitting(false)
        }
    }

    const handleChangePassword = async () => {
        if (passwords.newPassword !== passwords.confirmPassword) {
            setError('New passwords do not match')
            return
        }
        setSubmitting(true)
        setError(null)
        try {
            await api.post('/auth/change-password', {
                currentPassword: passwords.currentPassword,
                newPassword: passwords.newPassword
            })
            setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' })
            setSaved(true)
            setTimeout(() => setSaved(false), 3000)
        } catch (err) {
            setError(err.error?.message || err.message || 'Failed to change password')
        } finally {
            setSubmitting(false)
        }
    }

    const handleCreateApiKey = async () => {
        const name = prompt('Enter a name for this API key:')
        if (!name) return
        setSubmitting(true)
        try {
            const res = await api.post('/auth/api-keys', { name })
            setNewKey(res.data.key)
            fetchApiKeys()
        } catch (err) {
            setError('Failed to create API key')
        } finally {
            setSubmitting(false)
        }
    }

    const handleDeleteApiKey = async (id) => {
        if (!confirm('Are you sure you want to revoke this API key?')) return
        try {
            await api.delete(`/auth/api-keys/${id}`)
            fetchApiKeys()
        } catch (err) {
            setError('Failed to revoke API key')
        }
    }

    if (loading) {
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
                    <h1 className="page-title">Settings</h1>
                    <p className="page-subtitle">Manage your application preferences and configurations</p>
                </div>
                {activeSection === 'general' && (
                    <button className="btn btn-primary" onClick={handleSaveGeneral} disabled={submitting}>
                        {submitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        Save Settings
                    </button>
                )}
                {activeSection === 'account' && (
                    <button className="btn btn-primary" onClick={handleUpdateProfile} disabled={submitting}>
                        {submitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        Save Profile
                    </button>
                )}
            </div>

            {saved && (
                <div style={{ padding: 'var(--spacing-md)', background: 'var(--success-light)', borderRadius: 'var(--radius-lg)', marginBottom: 'var(--spacing-lg)', display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
                    <CheckCircle size={20} style={{ color: 'var(--success)' }} />
                    <span style={{ color: 'var(--success)' }}>Changes saved successfully!</span>
                </div>
            )}

            {error && (
                <div style={{ padding: 'var(--spacing-md)', background: 'var(--error-light)', borderRadius: 'var(--radius-lg)', marginBottom: 'var(--spacing-lg)', display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
                    <AlertCircle size={20} style={{ color: 'var(--error)' }} />
                    <span style={{ color: 'var(--error)' }}>{error}</span>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: 'var(--spacing-xl)' }}>
                {/* Sidebar Navigation */}
                <div className="card" style={{ height: 'fit-content', padding: 'var(--spacing-sm)' }}>
                    {settingsSections.map((section) => (
                        <button key={section.id} className={`nav-item ${activeSection === section.id ? 'active' : ''}`} onClick={() => setActiveSection(section.id)} style={{ width: '100%', textAlign: 'left', border: 'none', background: 'none' }}>
                            <section.icon size={18} />
                            <span>{section.label}</span>
                        </button>
                    ))}
                </div>

                {/* Settings Content */}
                <div>
                    {activeSection === 'general' && (
                        <div className="card">
                            <div className="card-header">
                                <div>
                                    <h3 className="card-title">General Settings</h3>
                                    <p className="card-subtitle">Basic application configuration</p>
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Application Name</label>
                                <input type="text" className="form-input" value={generalSettings.appName} onChange={e => setGeneralSettings({ ...generalSettings, appName: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Timezone</label>
                                <select className="form-select" value={generalSettings.timezone} onChange={e => setGeneralSettings({ ...generalSettings, timezone: e.target.value })}>
                                    <optgroup label="UTC/GMT">
                                        <option value="Etc/UTC">(GMT+0:00) UTC - Coordinated Universal Time</option>
                                    </optgroup>
                                    <optgroup label="Americas">
                                        <option value="Pacific/Honolulu">(GMT-10:00) Honolulu, Hawaii</option>
                                        <option value="America/Anchorage">(GMT-9:00) Anchorage, Alaska</option>
                                        <option value="America/Los_Angeles">(GMT-8:00) Los Angeles, USA</option>
                                        <option value="America/Denver">(GMT-7:00) Denver, USA</option>
                                        <option value="America/Chicago">(GMT-6:00) Chicago, USA</option>
                                        <option value="America/New_York">(GMT-5:00) New York, USA</option>
                                        <option value="America/Toronto">(GMT-5:00) Toronto, Canada</option>
                                        <option value="America/Sao_Paulo">(GMT-3:00) São Paulo, Brazil</option>
                                        <option value="America/Buenos_Aires">(GMT-3:00) Buenos Aires, Argentina</option>
                                    </optgroup>
                                    <optgroup label="Europe">
                                        <option value="Europe/London">(GMT+0:00) London, UK</option>
                                        <option value="Europe/Paris">(GMT+1:00) Paris, France</option>
                                        <option value="Europe/Berlin">(GMT+1:00) Berlin, Germany</option>
                                        <option value="Europe/Amsterdam">(GMT+1:00) Amsterdam, Netherlands</option>
                                        <option value="Europe/Rome">(GMT+1:00) Rome, Italy</option>
                                        <option value="Europe/Madrid">(GMT+1:00) Madrid, Spain</option>
                                        <option value="Europe/Athens">(GMT+2:00) Athens, Greece</option>
                                        <option value="Europe/Istanbul">(GMT+3:00) Istanbul, Turkey</option>
                                        <option value="Europe/Moscow">(GMT+3:00) Moscow, Russia</option>
                                    </optgroup>
                                    <optgroup label="Africa & Middle East">
                                        <option value="Africa/Cairo">(GMT+2:00) Cairo, Egypt</option>
                                        <option value="Africa/Johannesburg">(GMT+2:00) Johannesburg, South Africa</option>
                                        <option value="Asia/Dubai">(GMT+4:00) Dubai, UAE</option>
                                        <option value="Asia/Riyadh">(GMT+3:00) Riyadh, Saudi Arabia</option>
                                    </optgroup>
                                    <optgroup label="Asia">
                                        <option value="Asia/Kolkata">(GMT+5:30) Mumbai, India</option>
                                        <option value="Asia/Dhaka">(GMT+6:00) Dhaka, Bangladesh</option>
                                        <option value="Asia/Bangkok">(GMT+7:00) Bangkok, Thailand</option>
                                        <option value="Asia/Jakarta">(GMT+7:00) Jakarta, Indonesia</option>
                                        <option value="Asia/Ho_Chi_Minh">(GMT+7:00) Ho Chi Minh, Vietnam</option>
                                        <option value="Asia/Singapore">(GMT+8:00) Singapore</option>
                                        <option value="Asia/Kuala_Lumpur">(GMT+8:00) Kuala Lumpur, Malaysia</option>
                                        <option value="Asia/Hong_Kong">(GMT+8:00) Hong Kong</option>
                                        <option value="Asia/Shanghai">(GMT+8:00) Shanghai, China</option>
                                        <option value="Asia/Taipei">(GMT+8:00) Taipei, Taiwan</option>
                                        <option value="Asia/Manila">(GMT+8:00) Manila, Philippines</option>
                                        <option value="Asia/Tokyo">(GMT+9:00) Tokyo, Japan</option>
                                        <option value="Asia/Seoul">(GMT+9:00) Seoul, South Korea</option>
                                    </optgroup>
                                    <optgroup label="Pacific & Australia">
                                        <option value="Australia/Perth">(GMT+8:00) Perth, Australia</option>
                                        <option value="Australia/Sydney">(GMT+10:00) Sydney, Australia</option>
                                        <option value="Australia/Melbourne">(GMT+10:00) Melbourne, Australia</option>
                                        <option value="Pacific/Auckland">(GMT+12:00) Auckland, New Zealand</option>
                                        <option value="Pacific/Fiji">(GMT+12:00) Fiji</option>
                                    </optgroup>
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Language</label>
                                <select className="form-select" value="en" disabled>
                                    <option value="en">English</option>
                                </select>
                                <p className="form-hint">Currently only English is supported</p>
                            </div>
                            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 'var(--spacing-lg)', marginTop: 'var(--spacing-lg)' }}>
                                <h4 style={{ marginBottom: 'var(--spacing-md)', display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                                    {isDark ? <Moon size={18} /> : <Sun size={18} />} Appearance
                                </h4>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: 'var(--spacing-md)',
                                    background: 'var(--bg-tertiary)',
                                    borderRadius: 'var(--radius-lg)',
                                    marginBottom: 'var(--spacing-md)'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
                                        <div style={{
                                            width: '40px', height: '40px', borderRadius: 'var(--radius-md)',
                                            background: isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            color: isDark ? 'var(--warning)' : '#6366f1'
                                        }}>
                                            {isDark ? <Moon size={20} /> : <Sun size={20} />}
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 500 }}>{isDark ? 'Dark Mode' : 'Light Mode'}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                {isDark
                                                    ? 'Using dark theme - easier on the eyes'
                                                    : 'Using light theme - clean and bright'
                                                }
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        className="btn btn-secondary btn-sm"
                                        onClick={toggleTheme}
                                        style={{ gap: 'var(--spacing-xs)' }}
                                    >
                                        {isDark ? <Sun size={14} /> : <Moon size={14} />}
                                        {isDark ? 'Switch to Light' : 'Switch to Dark'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeSection === 'account' && (
                        <div className="card">
                            <div className="card-header">
                                <div>
                                    <h3 className="card-title">Account Settings</h3>
                                    <p className="card-subtitle">Manage your account information</p>
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-lg)', marginBottom: 'var(--spacing-xl)', padding: 'var(--spacing-lg)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-lg)' }}>
                                <div style={{ width: '80px', height: '80px', borderRadius: 'var(--radius-full)', background: 'var(--gradient-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 600, color: 'white' }}>
                                    {profile.name?.substring(0, 2).toUpperCase() || 'AD'}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '1.125rem', fontWeight: 600 }}>{profile.name}</div>
                                    <div style={{ color: 'var(--text-muted)', marginBottom: 'var(--spacing-sm)' }}>{profile.email}</div>
                                    <span className="badge badge-info">{profile.role?.toUpperCase()}</span>
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Full Name</label>
                                <input type="text" className="form-input" value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} />
                            </div>
                        </div>
                    )}

                    {activeSection === 'security' && (
                        <div className="card">
                            <div className="card-header">
                                <div>
                                    <h3 className="card-title">Security Settings</h3>
                                    <p className="card-subtitle">Manage your account and bot security</p>
                                </div>
                            </div>

                            {/* Change Password Section */}
                            <div style={{ marginBottom: 'var(--spacing-xl)' }}>
                                <h4 style={{ marginBottom: 'var(--spacing-md)', display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                                    <Lock size={18} /> Change Password
                                </h4>
                                <div className="form-group">
                                    <label className="form-label">Current Password</label>
                                    <input type="password" className="form-input" value={passwords.currentPassword} onChange={e => setPasswords({ ...passwords, currentPassword: e.target.value })} />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--spacing-md)' }}>
                                    <div className="form-group">
                                        <label className="form-label">New Password</label>
                                        <input type="password" className="form-input" value={passwords.newPassword} onChange={e => setPasswords({ ...passwords, newPassword: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Confirm New Password</label>
                                        <input type="password" className="form-input" value={passwords.confirmPassword} onChange={e => setPasswords({ ...passwords, confirmPassword: e.target.value })} />
                                    </div>
                                </div>
                                <button className="btn btn-secondary" onClick={handleChangePassword} disabled={submitting}>
                                    {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
                                    Update Password
                                </button>
                            </div>

                            {/* Bot Security Section */}
                            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 'var(--spacing-xl)', marginTop: 'var(--spacing-xl)' }}>
                                <h4 style={{ marginBottom: 'var(--spacing-lg)', display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                                    <Bot size={18} /> Bot Security & Action Settings
                                </h4>

                                {/* Action Modes Section */}
                                <div className="security-setting-card">
                                    <div className="setting-header">
                                        <div className="setting-icon"><Zap size={20} /></div>
                                        <div>
                                            <div className="setting-title">Command Action Modes</div>
                                            <div className="setting-desc">How the bot handles refill, cancel, and speedup commands</div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--spacing-md)', marginTop: 'var(--spacing-md)' }}>
                                        <div className="form-group">
                                            <label className="form-label">Refill Action</label>
                                            <select
                                                className="form-select"
                                                value={securitySettings.refillActionMode}
                                                onChange={(e) => setSecuritySettings({ ...securitySettings, refillActionMode: e.target.value })}
                                            >
                                                <option value="forward">Forward to Provider Group</option>
                                                <option value="auto">Auto Execute via API</option>
                                                <option value="both">Both (API + Forward)</option>
                                                <option value="disabled">Disabled</option>
                                            </select>
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Cancel Action</label>
                                            <select
                                                className="form-select"
                                                value={securitySettings.cancelActionMode}
                                                onChange={(e) => setSecuritySettings({ ...securitySettings, cancelActionMode: e.target.value })}
                                            >
                                                <option value="forward">Forward to Provider Group</option>
                                                <option value="auto">Auto Execute via API</option>
                                                <option value="both">Both (API + Forward)</option>
                                                <option value="disabled">Disabled</option>
                                            </select>
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Speed-up Action</label>
                                            <select
                                                className="form-select"
                                                value={securitySettings.speedupActionMode}
                                                onChange={(e) => setSecuritySettings({ ...securitySettings, speedupActionMode: e.target.value })}
                                            >
                                                <option value="forward">Forward to Provider Group</option>
                                                <option value="auto">Auto Execute via API</option>
                                                <option value="both">Both (API + Forward)</option>
                                                <option value="disabled">Disabled</option>
                                            </select>
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Status Response</label>
                                            <select
                                                className="form-select"
                                                value={securitySettings.statusResponseMode}
                                                onChange={(e) => setSecuritySettings({ ...securitySettings, statusResponseMode: e.target.value })}
                                            >
                                                <option value="standard">Standard</option>
                                                <option value="detailed">Detailed (with provider info)</option>
                                                <option value="minimal">Minimal</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                {/* Username Validation */}
                                <div className="security-setting-card">
                                    <div className="setting-header">
                                        <div className="setting-icon"><Shield size={20} /></div>
                                        <div>
                                            <div className="setting-title">Username Validation</div>
                                            <div className="setting-desc">Verify customer username before processing commands</div>
                                        </div>
                                    </div>
                                    <div className="setting-options">
                                        <label className={`option-card ${securitySettings.usernameValidationMode === 'disabled' ? 'selected' : ''}`}>
                                            <input
                                                type="radio"
                                                name="usernameValidationMode"
                                                value="disabled"
                                                checked={securitySettings.usernameValidationMode === 'disabled'}
                                                onChange={(e) => setSecuritySettings({ ...securitySettings, usernameValidationMode: e.target.value })}
                                            />
                                            <div className="option-content">
                                                <div className="option-title">Disabled</div>
                                                <div className="option-desc">No validation required. Anyone can send commands.</div>
                                            </div>
                                        </label>
                                        <label className={`option-card ${securitySettings.usernameValidationMode === 'ask' ? 'selected' : ''}`}>
                                            <input
                                                type="radio"
                                                name="usernameValidationMode"
                                                value="ask"
                                                checked={securitySettings.usernameValidationMode === 'ask'}
                                                onChange={(e) => setSecuritySettings({ ...securitySettings, usernameValidationMode: e.target.value })}
                                            />
                                            <div className="option-content">
                                                <div className="option-title">Ask Username</div>
                                                <div className="option-desc">Ask for username on first command, store for future.</div>
                                            </div>
                                        </label>
                                        <label className={`option-card ${securitySettings.usernameValidationMode === 'strict' ? 'selected' : ''}`}>
                                            <input
                                                type="radio"
                                                name="usernameValidationMode"
                                                value="strict"
                                                checked={securitySettings.usernameValidationMode === 'strict'}
                                                onChange={(e) => setSecuritySettings({ ...securitySettings, usernameValidationMode: e.target.value })}
                                            />
                                            <div className="option-content">
                                                <div className="option-title">Strict Match</div>
                                                <div className="option-desc">Always verify username matches order's customerUsername.</div>
                                            </div>
                                        </label>
                                    </div>
                                </div>

                                {/* Rate Limiting */}
                                <div className="security-setting-card">
                                    <div className="setting-header">
                                        <div className="setting-icon"><Clock size={20} /></div>
                                        <div>
                                            <div className="setting-title">Rate Limiting</div>
                                            <div className="setting-desc">Prevent spam and abuse by limiting request frequency</div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--spacing-md)', marginTop: 'var(--spacing-md)' }}>
                                        <div className="form-group">
                                            <label className="form-label">Max Commands per Minute</label>
                                            <input
                                                type="number"
                                                className="form-input"
                                                value={securitySettings.maxCommandsPerMinute}
                                                onChange={(e) => setSecuritySettings({ ...securitySettings, maxCommandsPerMinute: parseInt(e.target.value) || 10 })}
                                                min="1"
                                                max="60"
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Command Cooldown (seconds)</label>
                                            <input
                                                type="number"
                                                className="form-input"
                                                value={securitySettings.commandCooldownSecs}
                                                onChange={(e) => setSecuritySettings({ ...securitySettings, commandCooldownSecs: parseInt(e.target.value) || 300 })}
                                                min="0"
                                                max="3600"
                                            />
                                            <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Time between same command on same order</small>
                                        </div>
                                    </div>
                                </div>

                                {/* Response Settings */}
                                <div className="security-toggles">
                                    <div className="toggle-row">
                                        <div>
                                            <div className="toggle-title">Show Provider in Response</div>
                                            <div className="toggle-desc">Include provider name in status replies to customers</div>
                                        </div>
                                        <label className="toggle">
                                            <input
                                                type="checkbox"
                                                checked={securitySettings.showProviderInResponse}
                                                onChange={(e) => setSecuritySettings({ ...securitySettings, showProviderInResponse: e.target.checked })}
                                            />
                                            <span className="slider"></span>
                                        </label>
                                    </div>
                                    <div className="toggle-row">
                                        <div>
                                            <div className="toggle-title">Show Detailed Status</div>
                                            <div className="toggle-desc">Show comprehensive order details including charges and actions</div>
                                        </div>
                                        <label className="toggle">
                                            <input
                                                type="checkbox"
                                                checked={securitySettings.showDetailedStatus}
                                                onChange={(e) => setSecuritySettings({ ...securitySettings, showDetailedStatus: e.target.checked })}
                                            />
                                            <span className="slider"></span>
                                        </label>
                                    </div>
                                    <div className="toggle-row">
                                        <div>
                                            <div className="toggle-title">Private Reply in Groups</div>
                                            <div className="toggle-desc">Reply via DM instead of in group (for sensitive data)</div>
                                        </div>
                                        <label className="toggle">
                                            <input
                                                type="checkbox"
                                                checked={securitySettings.privateReplyInGroups}
                                                onChange={(e) => setSecuritySettings({ ...securitySettings, privateReplyInGroups: e.target.checked })}
                                            />
                                            <span className="slider"></span>
                                        </label>
                                    </div>
                                </div>

                                <button className="btn btn-primary" style={{ marginTop: 'var(--spacing-lg)' }} onClick={handleSaveSecuritySettings} disabled={submitting}>
                                    {submitting ? <Loader2 size={14} className="animate-spin" /> : <Save size={16} />}
                                    Save Security Settings
                                </button>
                            </div>


                            {/* Security Settings CSS */}
                            <style>{`
                                .security-setting-card {
                                    background: var(--bg-tertiary);
                                    border-radius: var(--radius-lg);
                                    padding: var(--spacing-lg);
                                    margin-bottom: var(--spacing-lg);
                                }

                                .setting-header {
                                    display: flex;
                                    align-items: flex-start;
                                    gap: var(--spacing-md);
                                    margin-bottom: var(--spacing-md);
                                }

                                .setting-icon {
                                    width: 40px;
                                    height: 40px;
                                    border-radius: var(--radius-md);
                                    background: var(--gradient-primary);
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    color: white;
                                }

                                .setting-title {
                                    font-weight: 600;
                                    margin-bottom: 4px;
                                }

                                .setting-desc {
                                    font-size: 0.8rem;
                                    color: var(--text-secondary);
                                }

                                .setting-options {
                                    display: flex;
                                    flex-direction: column;
                                    gap: var(--spacing-sm);
                                }

                                .option-card {
                                    display: flex;
                                    align-items: flex-start;
                                    gap: var(--spacing-md);
                                    padding: var(--spacing-md);
                                    background: var(--bg-secondary);
                                    border: 2px solid transparent;
                                    border-radius: var(--radius-md);
                                    cursor: pointer;
                                    transition: all 0.2s;
                                }

                                .option-card:hover {
                                    border-color: var(--border-color);
                                }

                                .option-card.selected {
                                    border-color: var(--primary-500);
                                    background: rgba(var(--primary-rgb), 0.05);
                                }

                                .option-card input[type="radio"] {
                                    margin-top: 4px;
                                }

                                .option-title {
                                    font-weight: 500;
                                    margin-bottom: 2px;
                                }

                                .option-desc {
                                    font-size: 0.75rem;
                                    color: var(--text-secondary);
                                }

                                .security-toggles {
                                    background: var(--bg-tertiary);
                                    border-radius: var(--radius-lg);
                                    padding: var(--spacing-md);
                                }

                                .toggle-row {
                                    display: flex;
                                    align-items: center;
                                    justify-content: space-between;
                                    padding: var(--spacing-md) 0;
                                    border-bottom: 1px solid var(--border-color);
                                }

                                .toggle-row:last-child {
                                    border-bottom: none;
                                }

                                .toggle-title {
                                    font-weight: 500;
                                    margin-bottom: 2px;
                                }

                                .toggle-desc {
                                    font-size: 0.75rem;
                                    color: var(--text-secondary);
                                }

                                .toggle {
                                    position: relative;
                                    display: inline-block;
                                    width: 50px;
                                    height: 26px;
                                    flex-shrink: 0;
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
                                    border: 2px solid var(--border-color);
                                    transition: 0.3s;
                                    border-radius: 26px;
                                }

                                .toggle .slider:before {
                                    position: absolute;
                                    content: "";
                                    height: 18px;
                                    width: 18px;
                                    left: 2px;
                                    bottom: 2px;
                                    background-color: white;
                                    transition: 0.3s;
                                    border-radius: 50%;
                                    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                                }

                                .toggle input:checked + .slider {
                                    background-color: var(--primary-500);
                                    border-color: var(--primary-500);
                                }

                                .toggle input:checked + .slider:before {
                                    transform: translateX(24px);
                                }

                                .toggle-wrapper {
                                    display: flex;
                                    align-items: center;
                                    gap: var(--spacing-md);
                                }
                            `}</style>
                        </div>
                    )}

                    {activeSection === 'api' && (
                        <div className="card">
                            <div className="card-header">
                                <div>
                                    <h3 className="card-title">API Keys</h3>
                                    <p className="card-subtitle">Manage your API keys for programmatic access</p>
                                </div>
                                <button className="btn btn-primary btn-sm" onClick={handleCreateApiKey}>
                                    <Plus size={16} /> Create New Key
                                </button>
                            </div>

                            {newKey && (
                                <div style={{ padding: 'var(--spacing-md)', background: 'var(--warning-light)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--spacing-lg)' }}>
                                    <div style={{ fontWeight: 600, color: 'var(--warning)', marginBottom: 'var(--spacing-sm)' }}>New API Key Created!</div>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--warning)', marginBottom: 'var(--spacing-sm)' }}>
                                        Copy this key now. It will not be shown again for security reasons.
                                    </p>
                                    <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                                        <code style={{ flex: 1, padding: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: '4px', fontSize: '0.875rem' }}>{newKey}</code>
                                        <button className="btn btn-secondary btn-sm" onClick={() => { navigator.clipboard.writeText(newKey); alert('Copied!'); }}><Copy size={14} /></button>
                                        <button className="btn btn-ghost btn-sm" onClick={() => setNewKey(null)}><X size={14} /></button>
                                    </div>
                                </div>
                            )}

                            <div className="table-container" style={{ border: 'none' }}>
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Name</th>
                                            <th>Key</th>
                                            <th>Last Used</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {apiKeys.length > 0 ? apiKeys.map(key => (
                                            <tr key={key.id}>
                                                <td>{key.name}</td>
                                                <td><code style={{ fontSize: '0.75rem' }}>{key.key}</code></td>
                                                <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{key.lastUsed ? new Date(key.lastUsed).toLocaleDateString() : 'Never'}</td>
                                                <td>
                                                    <button className="btn btn-ghost btn-icon" style={{ color: 'var(--error)' }} onClick={() => handleDeleteApiKey(key.id)}><Trash2 size={16} /></button>
                                                </td>
                                            </tr>
                                        )) : (
                                            <tr><td colSpan="4" style={{ textAlign: 'center', padding: 'var(--spacing-lg)' }}>No API keys found</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

function X({ size }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
    )
}
