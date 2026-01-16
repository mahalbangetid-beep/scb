import { useState, useEffect } from 'react'
import { AlertTriangle, LogOut, User } from 'lucide-react'

/**
 * ImpersonationBanner Component
 * 
 * Shows a warning banner when admin is viewing the dashboard as another user.
 * Provides a button to return to the admin account.
 */
export default function ImpersonationBanner() {
    const [isImpersonating, setIsImpersonating] = useState(false)
    const [impersonatedUser, setImpersonatedUser] = useState(null)
    const [adminInfo, setAdminInfo] = useState(null)

    useEffect(() => {
        checkImpersonationStatus()
    }, [])

    const checkImpersonationStatus = () => {
        const impersonationActive = localStorage.getItem('impersonation_active')
        const impersonatedBy = localStorage.getItem('impersonated_by')
        const currentUser = localStorage.getItem('user')

        if (impersonationActive === 'true' && impersonatedBy) {
            setIsImpersonating(true)
            try {
                setAdminInfo(JSON.parse(impersonatedBy))
                setImpersonatedUser(JSON.parse(currentUser))
            } catch (e) {
                console.error('Error parsing impersonation data:', e)
            }
        }
    }

    const handleReturnToAdmin = () => {
        // Restore original admin credentials
        const originalToken = localStorage.getItem('admin_original_token')
        const originalUser = localStorage.getItem('admin_original_user')

        if (originalToken && originalUser) {
            localStorage.setItem('token', originalToken)
            localStorage.setItem('user', originalUser)

            // Clear impersonation data
            localStorage.removeItem('impersonation_active')
            localStorage.removeItem('impersonated_by')
            localStorage.removeItem('admin_original_token')
            localStorage.removeItem('admin_original_user')

            // Redirect to admin users page
            window.location.href = '/admin/users'
        }
    }

    if (!isImpersonating) {
        return null
    }

    return (
        <div className="impersonation-banner">
            <div className="impersonation-content">
                <AlertTriangle size={18} />
                <span className="impersonation-text">
                    <strong>Admin View:</strong> You are viewing as{' '}
                    <span className="impersonated-username">
                        <User size={14} />
                        {impersonatedUser?.username || impersonatedUser?.name || 'User'}
                    </span>
                    {adminInfo && (
                        <span className="admin-info">
                            (logged in by {adminInfo.username})
                        </span>
                    )}
                </span>
            </div>
            <button
                className="btn-return-admin"
                onClick={handleReturnToAdmin}
            >
                <LogOut size={16} />
                Return to Admin
            </button>

            <style>{`
                .impersonation-banner {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    z-index: 10000;
                    background: linear-gradient(135deg, #f59e0b, #d97706);
                    color: #000;
                    padding: 10px 20px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
                    font-size: 14px;
                }

                .impersonation-content {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }

                .impersonation-text {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    flex-wrap: wrap;
                }

                .impersonated-username {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    background: rgba(0, 0, 0, 0.15);
                    padding: 2px 8px;
                    border-radius: 4px;
                    font-weight: 600;
                }

                .admin-info {
                    opacity: 0.8;
                    font-size: 12px;
                }

                .btn-return-admin {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    background: rgba(0, 0, 0, 0.2);
                    color: #000;
                    border: 1px solid rgba(0, 0, 0, 0.3);
                    padding: 6px 14px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: 500;
                    font-size: 13px;
                    transition: all 0.2s ease;
                }

                .btn-return-admin:hover {
                    background: rgba(0, 0, 0, 0.3);
                }

                /* Adjust main content when banner is visible */
                body:has(.impersonation-banner) .app-layout {
                    padding-top: 48px;
                }

                body:has(.impersonation-banner) .sidebar {
                    top: 48px;
                    height: calc(100vh - 48px);
                }
            `}</style>
        </div>
    )
}
