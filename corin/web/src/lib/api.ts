import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Create axios instance
const axiosInstance: AxiosInstance = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// Request interceptor to add auth token
axiosInstance.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('access_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for token refresh
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refresh_token');
        if (!refreshToken) {
          throw new Error('No refresh token');
        }

        const response = await axios.post(`${API_BASE_URL}/api/auth/refresh`, {
          refresh_token: refreshToken,
        });

        const { access_token, refresh_token: newRefreshToken } = response.data;
        localStorage.setItem('access_token', access_token);
        localStorage.setItem('refresh_token', newRefreshToken);

        originalRequest.headers.Authorization = `Bearer ${access_token}`;
        return axiosInstance(originalRequest);
      } catch (refreshError) {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// API client wrapper
export const api = {
  // Auth
  auth: {
    googleAuth: (idToken: string) =>
      axiosInstance.post('/auth/google', { id_token: idToken }),
    refreshToken: (refreshToken: string) =>
      axiosInstance.post('/auth/refresh', { refresh_token: refreshToken }),
  },

  // Folders
  folders: {
    list: () => axiosInstance.get('/folders'),
    get: (id: number) => axiosInstance.get(`/folders/${id}`),
    create: (data: { name: string; description?: string }) =>
      axiosInstance.post('/folders', data),
    update: (id: number, data: { name?: string; description?: string }) =>
      axiosInstance.put(`/folders/${id}`, data),
    delete: (id: number) => axiosInstance.delete(`/folders/${id}`),
  },

  // Meetings
  meetings: {
    list: (params?: { folder_id?: number; status?: string; search?: string }) =>
      axiosInstance.get('/meetings', { params }),
    get: (id: number) => axiosInstance.get(`/meetings/${id}`),
    create: (data: {
      title: string;
      folder_id: number;
      description?: string;
      date?: number;
    }) => axiosInstance.post('/meetings', data),
    update: (
      id: number,
      data: { title?: string; description?: string; date?: number }
    ) => axiosInstance.put(`/meetings/${id}`, data),
    delete: (id: number) => axiosInstance.delete(`/meetings/${id}`),
  },

  // Transcript
  transcript: {
    get: (meetingId: number) => axiosInstance.get(`/meetings/${meetingId}/transcript`),
    updateSegment: (meetingId: number, segmentId: number, data: { text?: string; speaker_id?: number }) =>
      axiosInstance.put(`/meetings/${meetingId}/transcript/segments/${segmentId}`, data),
    updateSpeaker: (meetingId: number, speakerId: number, data: { assigned_name?: string; color?: string }) =>
      axiosInstance.put(`/meetings/${meetingId}/speakers/${speakerId}`, data),
  },

  // Summaries
  summaries: {
    list: (meetingId: number) => axiosInstance.get(`/meetings/${meetingId}/summaries`),
    request: (meetingId: number, summaryType: string) =>
      axiosInstance.post(`/meetings/${meetingId}/summaries`, { summary_type: summaryType }),
    delete: (meetingId: number, summaryId: number) =>
      axiosInstance.delete(`/meetings/${meetingId}/summaries/${summaryId}`),
  },

  // Search
  search: {
    search: (data: {
      query: string;
      search_type?: 'fulltext' | 'vector' | 'hybrid';
      folder_id?: number;
      meeting_ids?: number[];
      limit?: number;
    }) => axiosInstance.post('/search', data),
  },

  // Q&A
  qa: {
    ask: (meetingId: number, data: { question: string; thread_id?: number }) =>
      axiosInstance.post(`/meetings/${meetingId}/qa`, data),
    listThreads: (meetingId: number) => axiosInstance.get(`/meetings/${meetingId}/qa`),
    getThread: (meetingId: number, threadId: number) =>
      axiosInstance.get(`/meetings/${meetingId}/qa/${threadId}`),
    deleteThread: (meetingId: number, threadId: number) =>
      axiosInstance.delete(`/meetings/${meetingId}/qa/${threadId}`),
  },
};

export default axiosInstance;
