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
    Database
} from 'lucide-react'
import api from '../services/api'

// Overview - Main dashboard
const overviewNavigation = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
]

// Channels - Communication platforms
const channelsNavigation = [
    { name: 'WhatsApp Devices', icon: Smartphone, path: '/devices' },
    { name: 'Telegram Bots', icon: SendHorizontal, path: '/telegram' },
]

// SMM Integration - Panel & order management
const smmNavigation = [
    { name: 'SMM Panels', icon: Globe, path: '/smm-panels' },
    { name: 'Panel Connections', icon: Plug, path: '/panel-connections' },
    { name: 'Orders', icon: Package, path: '/orders' },
    { name: 'Provider Groups', icon: Radio, path: '/provider-groups' },
    { name: 'Tickets', icon: Ticket, path: '/tickets' },
]

// Automation - Bot behavior & templates
const automationNavigation = [
    // { name: 'Auto Reply', icon: Bot, path: '/auto-reply' }, // Hidden for now
    // { name: 'Response Templates', icon: FileText, path: '/response-templates' }, // Hidden
    { name: 'Command Templates', icon: MessageCircle, path: '/command-templates' },
    { name: 'Provider Forwarding', icon: Send, path: '/provider-forwarding' },
    { name: 'Keyword Responses', icon: MessageCircle, path: '/keyword-responses' },
    { name: 'User Mappings', icon: Users, path: '/user-mappings' },
    { name: 'Bot Settings', icon: Zap, path: '/bot-settings' },
]

// Finance - Credits & reporting
const financeNavigation = [
    { name: 'Wallet', icon: Wallet, path: '/wallet' },
    { name: 'Subscriptions', icon: CreditCard, path: '/subscriptions' },
    { name: 'Reports', icon: BarChart3, path: '/reports' },
]

// Settings
const settingsNavigation = [
    { name: 'Settings', icon: Settings, path: '/settings' },
]

// Admin section
const adminNavigation = [
    { name: 'User Management', icon: Users, path: '/admin/users' },
    { name: 'Staff Management', icon: Shield, path: '/admin/staff' },
    { name: 'Payments', icon: CreditCard, path: '/admin/payments' },
    { name: 'Payment Settings', icon: Settings, path: '/admin/payment-settings' },
    { name: 'Credit Packages', icon: Package, path: '/admin/credit-packages' },
    { name: 'Vouchers', icon: Gift, path: '/admin/vouchers' },
    { name: 'Contact Backups', icon: Database, path: '/admin/contact-backups' },
    { name: 'System Settings', icon: Settings, path: '/admin/settings' },
]


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

                {/* Channels Section */}
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

                {/* SMM Integration Section */}
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

                {/* Automation Section */}
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

                {/* Finance Section */}
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

                {/* Settings Section */}
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
            </nav>


            <div className="sidebar-footer">
                {/* Credit Balance */}
                {!collapsed && (
                    <div className="credit-balance">
                        <CreditCard size={16} />
                        <span>Credit: ${(user.creditBalance || 0).toFixed(2)}</span>
                    </div>
                )}

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
            `}</style>
        </aside>
    )
}
