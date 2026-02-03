import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Redirect to login handled by React components/router usually, 
      // but we can also emit an event or just let the query fail and handle it in the UI.
      // For now, let's just propagate the error.
    }
    return Promise.reject(error);
  }
);
