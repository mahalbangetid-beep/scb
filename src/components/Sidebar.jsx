import { useState, useEffect } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
    LayoutDashboard,
    Smartphone,
    Bot,
    Users,
    Settings,
    ChevronLeft,
    ChevronRight,
    MessageCircle,
    LogOut,
    Globe,
    Package,
    CreditCard,
    Wallet,
    BarChart3,
    Shield,
    Gift,
    SendHorizontal,
    Send,
    FileText,
    Zap,
    Radio,
    Plug,
    Ticket,
    Database,
    Sun,
    Moon,
    Mail,
    Activity,
    Fingerprint,
    Megaphone,
    Hash,
    UsersRound,
    Layers
} from 'lucide-react'
import api from '../services/api'
import { useTheme } from '../contexts/ThemeContext'

// Overview - Main dashboard
const overviewNavigation = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
]

// Channels - Communication platforms
const channelsNavigation = [
    { name: 'WhatsApp Devices', icon: Smartphone, path: '/devices' },
    { name: 'Telegram Bots', icon: SendHorizontal, path: '/telegram' },
    { name: 'System Bots', icon: Bot, path: '/system-bots' },
]

// SMM Integration - Panel & order management
const smmNavigation = [
    { name: 'SMM Panels', icon: Globe, path: '/smm-panels' },
    { name: 'Panel Connections', icon: Plug, path: '/panel-connections' },
    { name: 'Orders', icon: Package, path: '/orders' },
    { name: 'Provider Groups', icon: Radio, path: '/provider-groups' },
    { name: 'Support Groups', icon: UsersRound, path: '/support-groups' },
    { name: 'Tickets', icon: Ticket, path: '/tickets' },
]

// Automation - Bot behavior & templates
const automationNavigation = [
    // { name: 'Auto Reply', icon: Bot, path: '/auto-reply' }, // Hidden for now
    { name: 'Response Templates', icon: FileText, path: '/response-templates' },
    { name: 'Command Templates', icon: MessageCircle, path: '/command-templates' },
    { name: 'Provider Forwarding', icon: Send, path: '/provider-forwarding' },
    { name: 'Provider Aliases', icon: Layers, path: '/provider-aliases' },
    { name: 'Keyword Responses', icon: MessageCircle, path: '/keyword-responses' },
    { name: 'User Mappings', icon: Users, path: '/user-mappings' },
    { name: 'Bot Settings', icon: Zap, path: '/bot-settings' },
]

// Finance - Credits & reporting
const financeNavigation = [
    { name: 'Wallet', icon: Wallet, path: '/wallet' },
    { name: 'Invoices', icon: FileText, path: '/invoices' },
    { name: 'Subscriptions', icon: CreditCard, path: '/subscriptions' },
    { name: 'Reports', icon: BarChart3, path: '/reports' },
]

// Marketing - Broadcast & campaigns
const marketingNavigation = [
    { name: 'Broadcast', icon: Megaphone, path: '/broadcast' },
    { name: 'Marketing Intervals', icon: Hash, path: '/marketing-intervals' },
]

// Settings
const settingsNavigation = [
    { name: 'Settings', icon: Settings, path: '/settings' },
    { name: 'My Staff', icon: Shield, path: '/my-staff' },
    { name: 'Activity Log', icon: Activity, path: '/activity-logs' },
    { name: 'Watermarks', icon: Fingerprint, path: '/watermarks' },
]

// Admin section
const adminNavigation = [
    { name: 'Admin Dashboard', icon: LayoutDashboard, path: '/admin/dashboard' },
    { name: 'User Management', icon: Users, path: '/admin/users' },
    { name: 'Staff Management', icon: Shield, path: '/admin/staff' },
    { name: 'Payments', icon: CreditCard, path: '/admin/payments' },
    { name: 'Payment Settings', icon: Settings, path: '/admin/payment-settings' },
    { name: 'FonePay', icon: CreditCard, path: '/admin/fonepay' },
    { name: 'Credit Packages', icon: Package, path: '/admin/credit-packages' },
    { name: 'Vouchers', icon: Gift, path: '/admin/vouchers' },
    { name: 'Contact Backups', icon: Database, path: '/admin/contact-backups' },
    { name: 'System Bots', icon: Bot, path: '/admin/system-bots' },
    { name: 'Email Settings', icon: Mail, path: '/admin/email-settings' },
    { name: 'System Settings', icon: Settings, path: '/admin/settings' },
]

// Staff navigation - map permissions to pages
const STAFF_PERMISSION_ROUTES = {
    order_view: { name: 'Orders', icon: Package, path: '/orders' },
    order_manage: { name: 'Orders', icon: Package, path: '/orders' },
    payment_view: { name: 'Wallet', icon: Wallet, path: '/wallet' },
    payment_approve: { name: 'Wallet', icon: Wallet, path: '/wallet' },
    device_manage: { name: 'Devices', icon: Smartphone, path: '/devices' },
    panel_manage: { name: 'SMM Panels', icon: Globe, path: '/smm-panels' },
    reports_view: { name: 'Reports', icon: BarChart3, path: '/reports' },
    support: { name: 'Tickets', icon: Ticket, path: '/tickets' },
    user_view: { name: 'User Mappings', icon: Users, path: '/user-mappings' },
    voucher_manage: { name: 'Invoices', icon: FileText, path: '/invoices' },
    contacts_view: { name: 'Contacts', icon: Users, path: '/contacts' },
    broadcast_manage: { name: 'Broadcast', icon: Megaphone, path: '/broadcast' },
    bot_settings: { name: 'Bot Settings', icon: Zap, path: '/bot-settings' },
    keyword_view: { name: 'Keyword Responses', icon: MessageCircle, path: '/keyword-responses' },
    dashboard_view: { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
}

const getStaffNavigation = (permissions = []) => {
    const seen = new Set()
    const nav = []
    for (const perm of permissions) {
        // Handle both string permissions and object permissions { permission: 'key' }
        const permKey = typeof perm === 'string' ? perm : perm?.permission
        if (!permKey) continue
        const route = STAFF_PERMISSION_ROUTES[permKey]
        if (route && !seen.has(route.path)) {
            seen.add(route.path)
            nav.push(route)
        }
    }
    return nav
}


// Theme Toggle Component
function ThemeToggle({ collapsed }) {
    const { theme, toggleTheme, isDark } = useTheme();

    return (
        <button
            className="theme-toggle-btn"
            onClick={toggleTheme}
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
            <span className="theme-icon">
                {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </span>
            {!collapsed && (
                <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>
            )}
        </button>
    );
}

export default function Sidebar({ collapsed, onToggle }) {
    const location = useLocation()
    const navigate = useNavigate()
    const userStr = localStorage.getItem('user')
    const initialUser = (() => {
        try {
            return userStr ? JSON.parse(userStr) : { name: 'Admin User', role: 'admin', creditBalance: 0 }
        } catch (e) {
            return { name: 'Admin User', role: 'admin', creditBalance: 0 }
        }
    })()

    const [user, setUser] = useState(initialUser)

    // Fetch fresh user data from API
    const fetchUserData = async () => {
        try {
            const res = await api.get('/auth/me')
            // API returns { success, message, data } - axios interceptor returns response.data
            // So res = { success, message, data: userData }
            const userData = res.data || res
            if (userData && userData.id) {
                setUser(userData)
                // Also update localStorage for persistence
                localStorage.setItem('user', JSON.stringify(userData))
            }
        } catch (err) {
            console.error('Failed to fetch user data:', err)
        }
    }

    useEffect(() => {
        // Fetch on mount
        fetchUserData()

        // Refresh every 30 seconds
        const interval = setInterval(fetchUserData, 30000)

        // Listen for user data update events (e.g., when admin adjusts credit)
        const handleUserDataUpdated = () => fetchUserData()
        window.addEventListener('user-data-updated', handleUserDataUpdated)

        return () => {
            clearInterval(interval)
            window.removeEventListener('user-data-updated', handleUserDataUpdated)
        }
    }, [])

    const handleLogout = () => {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        navigate('/login')
    }

    return (
        <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
            <div className="sidebar-header">
                <div className="sidebar-logo">
                    <MessageCircle />
                </div>
                <div className="sidebar-brand">
                    <h1>SMMChatBot</h1>
                    <span>SMM Automation</span>
                </div>
                <button
                    className="btn btn-ghost btn-icon"
                    onClick={onToggle}
                    style={{ marginLeft: 'auto' }}
                >
                    {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                </button>
            </div>

            <nav className="sidebar-nav">
                {/* Overview Section */}
                <div className="nav-section">
                    <div className="nav-section-title">Overview</div>
                    {overviewNavigation.map((item) => (
                        <NavLink
                            key={item.name}
                            to={item.path}
                            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                        >
                            <item.icon size={20} />
                            <span>{item.name}</span>
                        </NavLink>
                    ))}
                </div>

                {/* Channels Section - Hidden for STAFF */}
                {user.role !== 'STAFF' && (
                    <div className="nav-section">
                        <div className="nav-section-title">Channels</div>
                        {channelsNavigation.map((item) => (
                            <NavLink
                                key={item.name}
                                to={item.path}
                                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                            >
                                <item.icon size={20} />
                                <span>{item.name}</span>
                            </NavLink>
                        ))}
                    </div>
                )}

                {/* SMM Integration Section - Hidden for STAFF */}
                {user.role !== 'STAFF' && (
                    <div className="nav-section">
                        <div className="nav-section-title">SMM Integration</div>
                        {smmNavigation.map((item) => (
                            <NavLink
                                key={item.name}
                                to={item.path}
                                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                            >
                                <item.icon size={20} />
                                <span>{item.name}</span>
                            </NavLink>
                        ))}
                    </div>
                )}

                {/* Automation Section - Hidden for STAFF */}
                {user.role !== 'STAFF' && (
                    <div className="nav-section">
                        <div className="nav-section-title">Automation</div>
                        {automationNavigation.map((item) => (
                            <NavLink
                                key={item.name}
                                to={item.path}
                                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                            >
                                <item.icon size={20} />
                                <span>{item.name}</span>
                            </NavLink>
                        ))}
                    </div>
                )}

                {/* Finance Section - Hidden for STAFF */}
                {user.role !== 'STAFF' && (
                    <div className="nav-section">
                        <div className="nav-section-title">Finance</div>
                        {financeNavigation.map((item) => (
                            <NavLink
                                key={item.name}
                                to={item.path}
                                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                            >
                                <item.icon size={20} />
                                <span>{item.name}</span>
                            </NavLink>
                        ))}
                    </div>
                )}

                {/* Marketing Section - Hidden for STAFF */}
                {user.role !== 'STAFF' && (
                    <div className="nav-section">
                        <div className="nav-section-title">Marketing</div>
                        {marketingNavigation.map((item) => (
                            <NavLink
                                key={item.name}
                                to={item.path}
                                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                            >
                                <item.icon size={20} />
                                <span>{item.name}</span>
                            </NavLink>
                        ))}
                    </div>
                )}

                {/* Settings Section - Hidden for STAFF */}
                {user.role !== 'STAFF' && (
                    <div className="nav-section">
                        <div className="nav-section-title">Settings</div>
                        {settingsNavigation.map((item) => (
                            <NavLink
                                key={item.name}
                                to={item.path}
                                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                            >
                                <item.icon size={20} />
                                <span>{item.name}</span>
                            </NavLink>
                        ))}
                    </div>
                )}

                {/* Admin Section - Only for ADMIN and MASTER_ADMIN */}
                {['ADMIN', 'MASTER_ADMIN'].includes(user.role) && (
                    <div className="nav-section">
                        <div className="nav-section-title">Administration</div>
                        {adminNavigation.map((item) => (
                            <NavLink
                                key={item.name}
                                to={item.path}
                                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                            >
                                <item.icon size={20} />
                                <span>{item.name}</span>
                            </NavLink>
                        ))}
                    </div>
                )}

                {/* Staff Panel Section - Only for STAFF users */}
                {user.role === 'STAFF' && (() => {
                    const staffPerms = user.staffPermissions || []
                    const staffNav = getStaffNavigation(staffPerms)
                    return staffNav.length > 0 ? (
                        <div className="nav-section">
                            <div className="nav-section-title">Staff Panel</div>
                            {staffNav.map((item) => (
                                <NavLink
                                    key={item.path}
                                    to={item.path}
                                    className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                                >
                                    <item.icon size={20} />
                                    <span>{item.name}</span>
                                </NavLink>
                            ))}
                        </div>
                    ) : (
                        <div className="nav-section">
                            <div className="nav-section-title">Staff Panel</div>
                            <div style={{ padding: '0.5rem 1rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                No permissions assigned yet
                            </div>
                        </div>
                    )
                })()}
            </nav>


            <div className="sidebar-footer">
                {/* Credit Balance */}
                {!collapsed && (
                    <div className="credit-balance">
                        <CreditCard size={16} />
                        <span>Credit: ${(user.creditBalance || 0).toFixed(2)}</span>
                    </div>
                )}

                {/* Theme Toggle */}
                <ThemeToggle collapsed={collapsed} />

                <div className="user-profile" style={{ marginBottom: 'var(--spacing-sm)' }}>
                    <div className="user-avatar">{user.name?.substring(0, 2).toUpperCase() || 'U'}</div>
                    <div className="user-info">
                        <div className="user-name">{user.name || 'User'}</div>
                        <div className="user-role">{user.role || 'USER'}</div>
                    </div>
                </div>
                <button
                    className="btn btn-ghost"
                    onClick={handleLogout}
                    style={{
                        width: '100%',
                        justifyContent: collapsed ? 'center' : 'flex-start',
                        padding: 'var(--spacing-md)',
                        color: 'var(--error)'
                    }}
                >
                    <LogOut size={20} />
                    {!collapsed && <span>Logout</span>}
                </button>
            </div>

            <style>{`
                .credit-balance {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-sm) var(--spacing-md);
                    background: linear-gradient(135deg, rgba(37, 211, 102, 0.1), rgba(37, 211, 102, 0.05));
                    border: 1px solid rgba(37, 211, 102, 0.2);
                    border-radius: var(--radius-md);
                    margin-bottom: var(--spacing-md);
                    font-size: 0.875rem;
                    color: var(--primary-500);
                    font-weight: 500;
                }
                .theme-toggle-btn {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    width: 100%;
                    padding: var(--spacing-sm) var(--spacing-md);
                    background: var(--bg-tertiary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-md);
                    margin-bottom: var(--spacing-md);
                    font-size: 0.813rem;
                    color: var(--text-secondary);
                    font-weight: 500;
                    cursor: pointer;
                    transition: all var(--transition-fast);
                    font-family: inherit;
                    justify-content: ${collapsed ? 'center' : 'flex-start'};
                }
                .theme-toggle-btn:hover {
                    background: var(--bg-card-hover);
                    color: var(--text-primary);
                    border-color: var(--border-color-hover);
                }
                .theme-toggle-btn svg {
                    flex-shrink: 0;
                }
                .theme-toggle-btn .theme-icon {
                    color: var(--warning);
                }
            `}</style>
        </aside>
    )
}
