'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRequireAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { TranscriptViewer } from '@/components/transcript/TranscriptViewer';
import { AudioPlayer } from '@/components/player/AudioPlayer';
import { QAInterface } from '@/components/qa/QAInterface';
import { ArrowLeft, Upload, FileText, MessageSquare, Share2, Clock } from 'lucide-react';
import Link from 'next/link';
import { formatDate, formatDuration } from '@/lib/utils';
import type { Meeting, TranscriptSegment, Speaker, Summary } from '@/types/api';

type TabType = 'overview' | 'transcript' | 'qa';

export default function MeetingDetail() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const meetingId = parseInt(params.id as string);
  const { isAuthenticated, isLoading: authLoading } = useRequireAuth();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [currentTime, setCurrentTime] = useState(0);
  const [seekTo, setSeekTo] = useState<number | undefined>(undefined);

  const { data: meeting, isLoading } = useQuery<Meeting>({
    queryKey: ['meetings', meetingId],
    queryFn: async () => {
      const response = await api.meetings.get(meetingId);
      return response.data;
    },
    enabled: isAuthenticated && !isNaN(meetingId),
  });

  const { data: transcriptData } = useQuery<{
    segments: TranscriptSegment[];
    speakers: Speaker[];
  }>({
    queryKey: ['transcript', meetingId],
    queryFn: async () => {
      const response = await api.transcript.get(meetingId);
      return response.data;
    },
    enabled: isAuthenticated && meeting?.status === 'ready',
  });

  const { data: summaries } = useQuery<Summary[]>({
    queryKey: ['summaries', meetingId],
    queryFn: async () => {
      const response = await api.summaries.list(meetingId);
      return response.data;
    },
    enabled: isAuthenticated && meeting?.status === 'ready',
  });

  const updateSegmentMutation = useMutation({
    mutationFn: async ({
      segmentId,
      text,
    }: {
      segmentId: number;
      text: string;
    }) => {
      await api.transcript.updateSegment(meetingId, segmentId, { text });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transcript', meetingId] });
    },
  });

  const updateSpeakerMutation = useMutation({
    mutationFn: async ({
      speakerId,
      name,
    }: {
      speakerId: number;
      name: string;
    }) => {
      await api.transcript.updateSpeaker(meetingId, speakerId, {
        assigned_name: name,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transcript', meetingId] });
    },
  });

  const handleSeek = (time: number) => {
    setSeekTo(time);
    setTimeout(() => setSeekTo(undefined), 100);
  };

  if (authLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        </main>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold mb-2">Meeting not found</h2>
            <Button onClick={() => router.push('/dashboard')}>
              Go to Dashboard
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Link
            href={`/folders/${meeting.folder_id}`}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Folder
          </Link>
        </div>

        <div className="mb-8">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">{meeting.title}</h1>
              {meeting.description && (
                <p className="text-muted-foreground mb-4">{meeting.description}</p>
              )}
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>{formatDate(meeting.date)}</span>
                {meeting.duration_seconds && (
                  <span>{formatDuration(meeting.duration_seconds)}</span>
                )}
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
            <Button variant="outline" size="sm">
              <Share2 className="h-4 w-4 mr-2" />
              Share
            </Button>
          </div>

          {meeting.status === 'ready' && (
            <div className="flex gap-2 border-b">
              <button
                type="button"
                onClick={() => setActiveTab('overview')}
                className={`px-4 py-2 font-medium transition-colors ${
                  activeTab === 'overview'
                    ? 'border-b-2 border-primary text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Overview
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('transcript')}
                className={`px-4 py-2 font-medium transition-colors ${
                  activeTab === 'transcript'
                    ? 'border-b-2 border-primary text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Transcript
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('qa')}
                className={`px-4 py-2 font-medium transition-colors ${
                  activeTab === 'qa'
                    ? 'border-b-2 border-primary text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Q&A
              </button>
            </div>
          )}
        </div>

        {meeting.status === 'draft' && (
          <Card className="mb-8">
            <CardContent className="p-8 text-center">
              <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Upload Audio/Video</h3>
              <p className="text-muted-foreground mb-4">
                Upload your meeting recording to start transcription
              </p>
              <Button>
                <Upload className="h-4 w-4 mr-2" />
                Upload File
              </Button>
            </CardContent>
          </Card>
        )}

        {meeting.status === 'processing' && (
          <Card className="mb-8">
            <CardContent className="p-8 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Processing...</h3>
              <p className="text-muted-foreground">
                Your meeting is being transcribed. This may take a few minutes.
              </p>
            </CardContent>
          </Card>
        )}

        {meeting.status === 'ready' && activeTab === 'overview' && (
          <div className="space-y-6">
            {summaries && summaries.length > 0 && (
              <div className="space-y-4">
                {summaries.map((summary) => (
                  <Card key={summary.id}>
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Clock className="h-5 w-5 text-primary" />
                        </div>
                        <CardTitle>
                          {summary.summary_type === 'work'
                            ? 'Work Summary'
                            : 'Timeline Summary'}
                        </CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="prose prose-sm max-w-none">
                        <p className="whitespace-pre-wrap">{summary.content}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card
                className="hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => setActiveTab('transcript')}
              >
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle>Transcript</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    View and edit the meeting transcript
                  </p>
                </CardContent>
              </Card>

              <Card
                className="hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => setActiveTab('qa')}
              >
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <MessageSquare className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle>Q&A</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Ask questions about the meeting
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {meeting.status === 'ready' && activeTab === 'transcript' && (
          <div className="space-y-6">
            <AudioPlayer
              audioUrl={`${process.env.NEXT_PUBLIC_API_URL}/api/meetings/${meetingId}/media/playback`}
              onTimeUpdate={setCurrentTime}
              seekTo={seekTo}
            />
            {transcriptData && (
              <TranscriptViewer
                segments={transcriptData.segments}
                speakers={transcriptData.speakers}
                currentTime={currentTime}
                onSeek={handleSeek}
                onEditSegment={(segmentId, text) =>
                  updateSegmentMutation.mutate({ segmentId, text })
                }
                onUpdateSpeaker={(speakerId, name) =>
                  updateSpeakerMutation.mutate({ speakerId, name })
                }
              />
            )}
          </div>
        )}

        {meeting.status === 'ready' && activeTab === 'qa' && (
          <div className="max-w-4xl mx-auto">
            <QAInterface meetingId={meetingId} onSeekTimestamp={handleSeek} />
          </div>
        )}

        {meeting.status === 'failed' && (
          <Card className="mb-8 border-destructive">
            <CardContent className="p-8 text-center">
              <h3 className="text-lg font-semibold mb-2 text-destructive">
                Processing Failed
              </h3>
              <p className="text-muted-foreground mb-4">
                There was an error processing your meeting. Please try uploading again.
              </p>
              <Button>
                <Upload className="h-4 w-4 mr-2" />
                Retry Upload
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
