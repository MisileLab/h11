'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Clock, Send, User, Bot, ExternalLink } from 'lucide-react';

interface Citation {
  citation_number: number;
  segment_id: number | null;
  start_sec: number | null;
  end_sec: number | null;
  text: string;
  speaker_name: string | null;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
}

interface QAInterfaceProps {
  meetingId: number;
  onSeekTimestamp?: (seconds: number) => void;
}

export function QAInterface({ meetingId, onSeekTimestamp }: QAInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [threadId, setThreadId] = useState<number | undefined>();
  const [error, setError] = useState<string | null>(null);

  const askMutation = useMutation({
    mutationFn: async (questionText: string) => {
      const response = await api.qa.ask(meetingId, {
        question: questionText,
        thread_id: threadId,
      });
      return response.data;
    },
    onSuccess: (data) => {
      setThreadId(data.thread_id);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: data.answer,
          citations: data.citations,
        },
      ]);
      setError(null);
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || 'Failed to get answer. Please try again.');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || askMutation.isPending) return;

    setMessages(prev => [
      ...prev,
      {
        role: 'user',
        content: question.trim(),
      },
    ]);

    askMutation.mutate(question.trim());
    setQuestion('');
  };

  const formatTimestamp = (seconds: number | null): string => {
    if (seconds === null) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {messages.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <Bot className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Ask Questions About This Meeting</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Get AI-powered answers with timestamp citations
            </p>
            <div className="text-left max-w-md mx-auto">
              <p className="text-sm font-medium mb-2">Example questions:</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• What were the main topics discussed?</li>
                <li>• What action items were mentioned?</li>
                <li>• Who said X about Y?</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4 max-h-[600px] overflow-y-auto">
        {messages.map((message, index) => {
          const messageKey = `${message.role}-${index}-${message.content.slice(0, 20)}`;
          return (
            <div
              key={messageKey}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[80%] space-y-2`}>
                <div
                  className={`flex items-start gap-2 ${
                    message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                  }`}
                >
                  <div
                    className={`p-2 rounded-full ${
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    {message.role === 'user' ? (
                      <User className="h-4 w-4" />
                    ) : (
                      <Bot className="h-4 w-4" />
                    )}
                  </div>
                  <div
                    className={`px-4 py-3 rounded-lg ${
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  </div>
                </div>

                {message.citations && message.citations.length > 0 && (
                  <div className="ml-10 space-y-2">
                    {message.citations.map((citation) => (
                      <button
                        key={citation.citation_number}
                        type="button"
                        onClick={() => {
                          if (citation.start_sec !== null && onSeekTimestamp) {
                            onSeekTimestamp(citation.start_sec);
                          }
                        }}
                        className="w-full text-left p-3 bg-accent hover:bg-accent/80 border border-border rounded-lg transition-colors text-sm"
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className="font-medium">
                            [{citation.citation_number}] {citation.speaker_name || 'Unknown'}
                          </span>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {formatTimestamp(citation.start_sec)}
                            {onSeekTimestamp && citation.start_sec !== null && (
                              <ExternalLink className="h-3 w-3 ml-1" />
                            )}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {citation.text}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {askMutation.isPending && (
          <div className="flex justify-start">
            <div className="max-w-[80%]">
              <div className="flex items-start gap-2">
                <div className="p-2 rounded-full bg-muted">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="px-4 py-3 rounded-lg bg-muted">
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-foreground" />
                    <span className="text-sm text-muted-foreground">Thinking...</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
          placeholder="Ask a question about this meeting..."
          className="flex-1 min-h-[60px] max-h-[120px] px-4 py-2 border border-input rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          disabled={askMutation.isPending}
        />
        <Button
          type="submit"
          disabled={!question.trim() || askMutation.isPending}
          className="self-end"
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
