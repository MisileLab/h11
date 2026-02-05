'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRequireAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Plus, ArrowLeft, FileAudio, Clock, Calendar } from 'lucide-react';
import Link from 'next/link';
import { formatDate, formatDuration } from '@/lib/utils';
import type { Meeting, Folder } from '@/types/api';

export default function FolderDetail() {
  const params = useParams();
  const router = useRouter();
  const folderId = parseInt(params.id as string);
  const { isAuthenticated, isLoading: authLoading } = useRequireAuth();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const queryClient = useQueryClient();

  const { data: folder } = useQuery<Folder>({
    queryKey: ['folders', folderId],
    queryFn: async () => {
      const response = await api.folders.get(folderId);
      return response.data;
    },
    enabled: isAuthenticated && !isNaN(folderId),
  });

  const { data: meetings, isLoading } = useQuery<Meeting[]>({
    queryKey: ['meetings', folderId],
    queryFn: async () => {
      const response = await api.meetings.list({ folder_id: folderId });
      return response.data;
    },
    enabled: isAuthenticated && !isNaN(folderId),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const dateTimestamp = date ? Math.floor(new Date(date).getTime() / 1000) : Date.now() / 1000;
      await api.meetings.create({
        title,
        folder_id: folderId,
        description: description || undefined,
        date: dateTimestamp,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings', folderId] });
      setCreateModalOpen(false);
      setTitle('');
      setDescription('');
      setDate('');
    },
  });

  if (authLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
        </div>

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">{folder?.name}</h1>
            {folder?.description && (
              <p className="text-muted-foreground">{folder.description}</p>
            )}
          </div>
          <Button onClick={() => setCreateModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Meeting
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : meetings && meetings.length > 0 ? (
          <div className="grid grid-cols-1 gap-4">
            {meetings.map((meeting) => (
              <Link key={meeting.id} href={`/meetings/${meeting.id}`}>
                <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4 flex-1">
                        <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <FileAudio className="h-6 w-6 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-semibold mb-1">
                            {meeting.title}
                          </h3>
                          {meeting.description && (
                            <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                              {meeting.description}
                            </p>
                          )}
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              {formatDate(meeting.date)}
                            </div>
                            {meeting.duration_seconds && (
                              <div className="flex items-center gap-1">
                                <Clock className="h-4 w-4" />
                                {formatDuration(meeting.duration_seconds)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="ml-4">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${
                            meeting.status === 'ready'
                              ? 'bg-green-100 text-green-800'
                              : meeting.status === 'processing'
                              ? 'bg-blue-100 text-blue-800'
                              : meeting.status === 'failed'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {meeting.status}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <FileAudio className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No meetings yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first meeting to start recording
            </p>
            <Button onClick={() => setCreateModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Meeting
            </Button>
          </div>
        )}

        <Modal
          isOpen={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          title="Create New Meeting"
          description="Add a new meeting to this folder"
        >
          <div className="space-y-4">
            <div>
              <label htmlFor="meeting-title" className="text-sm font-medium mb-2 block">
                Title
              </label>
              <Input
                id="meeting-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Weekly Team Sync"
              />
            </div>
            <div>
              <label htmlFor="meeting-date" className="text-sm font-medium mb-2 block">
                Date
              </label>
              <Input
                id="meeting-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="meeting-description" className="text-sm font-medium mb-2 block">
                Description (optional)
              </label>
              <Textarea
                id="meeting-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add a description..."
                rows={3}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setCreateModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={!title || createMutation.isPending}
              >
                {createMutation.isPending ? 'Creating...' : 'Create'}
              </Button>
            </div>
          </div>
        </Modal>
      </main>
    </div>
  );
}
