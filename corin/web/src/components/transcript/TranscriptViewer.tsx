'use client';

import { useState } from 'react';
import { formatTimestamp } from '@/lib/utils';
import { Input } from '@/components/ui/Input';
import type { TranscriptSegment, Speaker } from '@/types/api';

interface TranscriptViewerProps {
  segments: TranscriptSegment[];
  speakers: Speaker[];
  currentTime?: number;
  onSeek?: (time: number) => void;
  onEditSegment?: (segmentId: number, text: string) => void;
  onUpdateSpeaker?: (speakerId: number, name: string) => void;
}

export function TranscriptViewer({
  segments,
  speakers,
  currentTime = 0,
  onSeek,
  onEditSegment,
  onUpdateSpeaker,
}: TranscriptViewerProps) {
  const [editingSegment, setEditingSegment] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');
  const [editingSpeaker, setEditingSpeaker] = useState<number | null>(null);
  const [speakerName, setSpeakerName] = useState('');

  const getSpeaker = (speakerId: number | null) => {
    return speakers.find((s) => s.id === speakerId);
  };

  const handleEditSegment = (segment: TranscriptSegment) => {
    setEditingSegment(segment.id);
    setEditingText(segment.text);
  };

  const handleSaveSegment = (segmentId: number) => {
    if (onEditSegment) {
      onEditSegment(segmentId, editingText);
    }
    setEditingSegment(null);
  };

  const handleEditSpeaker = (speaker: Speaker) => {
    setEditingSpeaker(speaker.id);
    setSpeakerName(speaker.assigned_name || speaker.speaker_label);
  };

  const handleSaveSpeaker = (speakerId: number) => {
    if (onUpdateSpeaker) {
      onUpdateSpeaker(speakerId, speakerName);
    }
    setEditingSpeaker(null);
  };

  return (
    <div className="space-y-4">
      {/* Speakers */}
      <div className="border-b pb-4">
        <h3 className="text-sm font-medium mb-3">Speakers</h3>
        <div className="flex flex-wrap gap-2">
          {speakers.map((speaker) => (
            <div
              key={speaker.id}
              className="flex items-center gap-2 px-3 py-1.5 bg-secondary rounded-full"
            >
              <div
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: speaker.color || '#3B82F6' }}
              />
              {editingSpeaker === speaker.id ? (
                <Input
                  value={speakerName}
                  onChange={(e) => setSpeakerName(e.target.value)}
                  onBlur={() => handleSaveSpeaker(speaker.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveSpeaker(speaker.id);
                    if (e.key === 'Escape') setEditingSpeaker(null);
                  }}
                  className="h-6 w-32 text-sm"
                  autoFocus
                />
              ) : (
                <button
                  type="button"
                  onClick={() => handleEditSpeaker(speaker)}
                  className="text-sm hover:underline"
                >
                  {speaker.assigned_name || speaker.speaker_label}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Transcript Segments */}
      <div className="space-y-3">
        {segments.map((segment) => {
          const speaker = getSpeaker(segment.speaker_id);
          const isActive =
            currentTime >= segment.start_time && currentTime <= segment.end_time;

          return (
            <div
              key={segment.id}
              className={`flex gap-4 p-3 rounded-lg transition-colors ${
                isActive ? 'bg-primary/10' : 'hover:bg-secondary/50'
              }`}
            >
              {/* Timestamp */}
              <button
                type="button"
                onClick={() => onSeek && onSeek(segment.start_time)}
                className="shrink-0 text-sm text-muted-foreground hover:text-primary font-mono"
              >
                {formatTimestamp(segment.start_time)}
              </button>

              {/* Speaker Badge */}
              {speaker && (
                <div className="shrink-0 flex items-center gap-2">
                  <div
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: speaker.color || '#3B82F6' }}
                  />
                  <span className="text-sm font-medium">
                    {speaker.assigned_name || speaker.speaker_label}
                  </span>
                </div>
              )}

              {/* Text */}
              <div className="flex-1 min-w-0">
                {editingSegment === segment.id ? (
                  <textarea
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    onBlur={() => handleSaveSegment(segment.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.ctrlKey) {
                        handleSaveSegment(segment.id);
                      }
                      if (e.key === 'Escape') {
                        setEditingSegment(null);
                      }
                    }}
                    className="w-full p-2 text-sm border rounded-md resize-none"
                    rows={3}
                    autoFocus
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => handleEditSegment(segment)}
                    className="text-left w-full text-sm leading-relaxed hover:text-primary transition-colors"
                  >
                    {segment.text}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
