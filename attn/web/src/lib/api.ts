import axios from 'axios';

const getBaseURL = () => {
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.host}/api`;
  }
  return '/api';
};

export const api = axios.create({
  baseURL: getBaseURL(),
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
    }
    return Promise.reject(error);
  }
);
