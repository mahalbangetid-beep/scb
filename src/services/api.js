import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json'
    }
});

// Request interceptor to add token
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
}, (error) => {
    return Promise.reject(error);
});

// Response interceptor
// IMPORTANT: This interceptor unwraps axios's response.data, so:
//   const res = await api.get('/endpoint')
//   res → { success: true, data: {...}, message: "..." }  (server response body)
//   res.data → the actual payload
//   res.pagination → pagination info (for paginated endpoints)
// Do NOT access res.data.data — that would be double-unwrapping.
api.interceptors.response.use((response) => {
    return response.data;
}, (error) => {
    if (error.response && error.response.status === 401) {
        // Option to logout or redirect to login
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        if (window.location.pathname !== '/login') {
            window.location.href = '/login';
        }
    }
    return Promise.reject(error.response?.data || error.message);
});

export default api;
