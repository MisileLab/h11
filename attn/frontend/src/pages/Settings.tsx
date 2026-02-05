import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';

function ConfigUpload({ 
  label, 
  type, 
  isUploaded, 
  onUpload 
}: { 
  label: string; 
  type: 'opencode' | 'auth' | 'ohmy'; 
  isUploaded: boolean; 
  onUpload: (type: 'opencode' | 'auth' | 'ohmy', file: File) => Promise<void>; 
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [msg, setMsg] = useState('');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json') && !file.name.endsWith('.jsonc')) {
      setMsg('Error: File must be .json or .jsonc');
      return;
    }

    setIsUploading(true);
    setMsg('');
    try {
      await onUpload(type, file);
      setMsg('Upload successful!');
    } catch (err: any) {
      setMsg(`Error: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex items-center justify-between p-4 border rounded-lg border-slate-700 bg-slate-800/30">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-slate-200">{label}</h3>
          {isUploaded ? (
            <Badge variant="success">Uploaded</Badge>
          ) : (
            <Badge variant="warning">Missing</Badge>
          )}
        </div>
        <p className="text-sm text-slate-400 mt-1">
          {type === 'opencode' && 'Main OpenCode configuration file'}
          {type === 'auth' && 'Authentication credentials'}
          {type === 'ohmy' && 'Oh-My-OpenCode settings'}
        </p>
        {msg && (
          <p className={`text-xs mt-2 ${msg.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
            {msg}
          </p>
        )}
      </div>
      <div className="ml-4">
        <label className="cursor-pointer">
          <span className={`inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 transition-colors ${
            isUploaded 
              ? 'bg-slate-800 text-slate-100 hover:bg-slate-700 border border-slate-600' 
              : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
          }`}>
            {isUploading ? 'Uploading...' : isUploaded ? 'Replace' : 'Upload'}
          </span>
          <input 
            type="file" 
            className="hidden" 
            accept=".json,.jsonc"
            onChange={handleFileChange}
            disabled={isUploading}
          />
        </label>
      </div>
    </div>
  );
}

function PasswordChange() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const changePasswordMutation = useMutation({
    mutationFn: (data: { current_password: string; new_password: string }) =>
      api.changePassword(data),
    onSuccess: () => {
      setMessage({ type: 'success', text: 'Password changed successfully!' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setMessage(null), 5000);
    },
    onError: (error: any) => {
      setMessage({ 
        type: 'error', 
        text: error.message || 'Failed to change password' 
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setMessage({ type: 'error', text: 'All fields are required' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match' });
      return;
    }

    if (newPassword.length < 8) {
      setMessage({ type: 'error', text: 'New password must be at least 8 characters' });
      return;
    }

    changePasswordMutation.mutate({
      current_password: currentPassword,
      new_password: newPassword,
    });
  };

  return (
    <div className="p-6">
      <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
        <div>
          <label htmlFor="current-password" className="block text-sm font-medium text-slate-200 mb-1">
            Current Password
          </label>
          <Input
            id="current-password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Enter current password"
            disabled={changePasswordMutation.isPending}
          />
        </div>

        <div>
          <label htmlFor="new-password" className="block text-sm font-medium text-slate-200 mb-1">
            New Password
          </label>
          <Input
            id="new-password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Enter new password (min 8 characters)"
            disabled={changePasswordMutation.isPending}
          />
        </div>

        <div>
          <label htmlFor="confirm-password" className="block text-sm font-medium text-slate-200 mb-1">
            Confirm New Password
          </label>
          <Input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
            disabled={changePasswordMutation.isPending}
          />
        </div>

        {message && (
          <div
            className={`p-3 rounded-md text-sm ${
              message.type === 'success'
                ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}
          >
            {message.text}
          </div>
        )}

        <Button
          type="submit"
          disabled={changePasswordMutation.isPending}
          className="w-full"
        >
          {changePasswordMutation.isPending ? 'Changing Password...' : 'Change Password'}
        </Button>
      </form>
    </div>
  );
}

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: status, isLoading } = useQuery({
    queryKey: ['configStatus'],
    queryFn: api.getConfigStatus,
  });

  const uploadMutation = useMutation({
    mutationFn: ({ type, file }: { type: 'opencode' | 'auth' | 'ohmy'; file: File }) => 
      api.uploadConfig(type, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configStatus'] });
    },
  });

  if (isLoading) return <div className="flex justify-center p-12"><Spinner /></div>;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Settings</h1>
        <p className="text-slate-400 mt-1">Manage your account and system configuration</p>
      </div>

      <Card>
        <div className="p-6 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-slate-100">Change Password</h2>
          <p className="text-sm text-slate-400 mt-1">Update your account password</p>
        </div>
        <PasswordChange />
      </Card>

      <Card>
        <div className="p-6 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-slate-100">Configuration Files</h2>
          <p className="text-sm text-slate-400 mt-1">Upload OpenCode configuration files</p>
        </div>
        <div className="space-y-4 p-6">
          <ConfigUpload 
            label="opencode.jsonc" 
            type="opencode" 
            isUploaded={status?.opencode ?? false}
            onUpload={async (type, file) => { await uploadMutation.mutateAsync({ type, file }); }}
          />
          <ConfigUpload 
            label="auth.json" 
            type="auth" 
            isUploaded={status?.auth ?? false}
            onUpload={async (type, file) => { await uploadMutation.mutateAsync({ type, file }); }}
          />
          <ConfigUpload 
            label="oh-my-opencode.json" 
            type="ohmy" 
            isUploaded={status?.ohmy ?? false}
            onUpload={async (type, file) => { await uploadMutation.mutateAsync({ type, file }); }}
          />
        </div>
      </Card>
    </div>
  );
}
