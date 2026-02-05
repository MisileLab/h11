<!-- Parent: ../AGENTS.md -->
# COMPONENTS

## OVERVIEW
UI primitives and feature components (player, transcript, Q&A).

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| UI primitives | `ui` | Button/Input/Modal/Card/Textarea |
| Header | `layout/Header.tsx` | Navigation |
| Q&A UI | `qa/QAInterface.tsx` | Chat + citations |
| Transcript | `transcript/TranscriptViewer.tsx` | Editor + timestamps |
| Audio player | `player/AudioPlayer.tsx` | Playback + controls |

## CONVENTIONS
- Use `cn` from `@/lib/utils` for className composition.
- Client components must include `"use client"`.
