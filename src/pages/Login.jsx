import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { User, Lock, Loader2, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react'
import api from '../services/api'

export default function Login() {
    const [formData, setFormData] = useState({
        username: '',
        password: ''
    })
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const navigate = useNavigate()
    const location = useLocation()

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        try {
            const res = await api.post('/auth/login', formData)
            localStorage.setItem('token', res.data.token)
            localStorage.setItem('user', JSON.stringify(res.data.user))

            // Success animation/delay
            const from = location.state?.from?.pathname || '/dashboard';
            setTimeout(() => {
                navigate(from, { replace: true })
            }, 500)
        } catch (err) {
            setError(err.error?.message || err.message || 'Login failed. Please check your credentials.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="auth-container">
            <div className="auth-card animate-scale-in">
                <div className="auth-header">
                    <div className="auth-logo">
                        <ShieldCheck size={32} className="primary" />
                        <span className="logo-text">SMMChatBot</span>
                    </div>
                    <h1 className="auth-title">Welcome Back</h1>
                    <p className="auth-subtitle">Log in to manage your SMM Panel Automation</p>
                </div>

                {error && (
                    <div className="auth-error animate-shake">
                        <AlertCircle size={16} />
                        <span>{error}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="auth-form">
                    <div className="form-group">
                        <label className="form-label">Username or Email</label>
                        <div className="input-with-icon">
                            <User size={18} />
                            <input
                                type="text"
                                className="form-input"
                                placeholder="username or email"
                                value={formData.username}
                                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                required
                                disabled={loading}
                                autoComplete="username"
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-xs)' }}>
                            <label className="form-label" style={{ marginBottom: 0 }}>Password</label>
                        </div>
                        <div className="input-with-icon">
                            <Lock size={18} />
                            <input
                                type="password"
                                className="form-input"
                                placeholder="••••••••"
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                required
                                disabled={loading}
                                autoComplete="current-password"
                            />
                        </div>
                    </div>

                    <button type="submit" className="btn btn-primary auth-btn" disabled={loading}>
                        {loading ? (
                            <Loader2 className="animate-spin" size={20} />
                        ) : (
                            <>
                                Sign In
                                <ArrowRight size={20} />
                            </>
                        )}
                    </button>
                </form>

                <div className="auth-footer">
                    <p>Don't have an account? <Link to="/register" className="auth-link">Create one now</Link></p>
                </div>
            </div>

            <div className="auth-decoration">
                <div className="blob"></div>
                <div className="blob2"></div>
            </div>
        </div>
    )
}
