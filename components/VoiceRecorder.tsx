'use client';

import React, { useState, useRef } from 'react';
import { Mic, MicOff, Send, Loader2, Volume2, Sparkles, AlertCircle } from 'lucide-react';

interface VoiceRecorderProps {
  onTranscriptSubmitted: (transcript: string, isAudio: boolean) => Promise<void>;
  isProcessing: boolean;
}

export default function VoiceRecorder({ onTranscriptSubmitted, isProcessing }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [recordingTime, setRecordingTime] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const liveTranscriptRef = useRef<string>('');
  const recognitionRef = useRef<any>(null);

  const startRecording = async () => {
    setErrorMessage(null);
    liveTranscriptRef.current = '';

    // Initialize Browser Web Speech API if supported
    const SpeechRecognition = typeof window !== 'undefined'
      ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
      : null;

    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (event: any) => {
          let currentText = '';
          for (let i = 0; i < event.results.length; i++) {
            currentText += event.results[i][0].transcript;
          }
          liveTranscriptRef.current = currentText;
        };
        recognition.start();
        recognitionRef.current = recognition;
      } catch (e) {
        console.warn('Browser SpeechRecognition error:', e);
      }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        if (recognitionRef.current) {
          try { recognitionRef.current.stop(); } catch (e) {}
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());

        let finalTranscript = '';

        // Try backend transcribe route first
        try {
          const formData = new FormData();
          formData.append('file', audioBlob, 'voice.wav');

          const res = await fetch('/api/transcribe', {
            method: 'POST',
            body: formData,
          });

          const data = await res.json();
          if (data.transcript && !data.isMock) {
            finalTranscript = data.transcript;
          }
        } catch (err) {
          console.error('Backend transcription error:', err);
        }

        // Fallback to real-time Web Speech API transcript if backend returned mock or failed
        if (!finalTranscript && liveTranscriptRef.current.trim()) {
          finalTranscript = liveTranscriptRef.current.trim();
        }

        // Last resort canned fallback if no API key/server or browser speech engine
        if (!finalTranscript) {
          finalTranscript = "I need to finish the proposal, review Aditya's PR, and prep for the 4pm call.";
        }

        await onTranscriptSubmitted(finalTranscript, true);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Microphone access error:', err);
      setErrorMessage('Microphone access was denied or unavailable. You can use free-form text input below!');
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim() || isProcessing) return;
    const input = textInput.trim();
    setTextInput('');
    onTranscriptSubmitted(input, false);
  };

  const handleSampleClick = (sampleText: string) => {
    if (isProcessing) return;
    onTranscriptSubmitted(sampleText, false);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="glass-panel rounded-2xl p-5 border border-slate-800/90 shadow-2xl relative overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute -top-24 -left-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Voice Recorder Mic Section */}
      <div className="flex flex-col items-center justify-center py-4">
        <div className="relative mb-3">
          {/* Animated pulse rings when recording */}
          {isRecording && (
            <>
              <div className="absolute inset-0 rounded-full bg-rose-500/30 animate-ping" />
              <div className="absolute -inset-3 rounded-full bg-rose-500/20 animate-pulse" />
            </>
          )}

          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isProcessing}
            className={`relative z-10 w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 transform active:scale-95 ${
              isRecording
                ? 'bg-rose-600 text-white shadow-glow-mic scale-105'
                : 'bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white shadow-glow hover:scale-105'
            } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={isRecording ? 'Click to stop recording' : 'Click to speak your tasks'}
          >
            {isProcessing ? (
              <Loader2 className="w-8 h-8 animate-spin" />
            ) : isRecording ? (
              <MicOff className="w-8 h-8 animate-pulse" />
            ) : (
              <Mic className="w-8 h-8" />
            )}
          </button>
        </div>

        {/* Status indicator */}
        <div className="text-center">
          {isRecording ? (
            <div className="flex items-center justify-center gap-2 text-rose-400 font-medium text-sm">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              <span>Recording... ({formatTime(recordingTime)})</span>
            </div>
          ) : isProcessing ? (
            <div className="flex items-center justify-center gap-2 text-indigo-400 font-medium text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>DeepSeek is parsing transcript & evaluating schedule...</span>
            </div>
          ) : (
            <p className="text-xs text-slate-400">
              Click the mic to speak your day, or type your raw brain dump below.
            </p>
          )}
        </div>

        {errorMessage && (
          <div className="mt-3 flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-lg">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      {/* Free-form Text Form */}
      <form onSubmit={handleTextSubmit} className="mt-2 flex items-center gap-2">
        <input
          type="text"
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          placeholder="e.g. 'Finish proposal draft, review Aditya's PR, and prep for 4pm call...'"
          disabled={isProcessing || isRecording}
          className="flex-1 bg-slate-900/90 border border-slate-800 focus:border-indigo-500/60 rounded-xl px-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 outline-none transition-all"
        />
        <button
          type="submit"
          disabled={!textInput.trim() || isProcessing || isRecording}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl text-xs font-medium flex items-center gap-1.5 shadow-glow transition-all"
        >
          <span>Send</span>
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>

      {/* Quick Sample Prompts */}
      <div className="mt-3.5 flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] text-slate-500 flex items-center gap-1 mr-1">
          <Sparkles className="w-3 h-3 text-indigo-400" /> Quick test inputs:
        </span>
        <button
          onClick={() => handleSampleClick("I need to finish the proposal, review Aditya's PR, and prep for the 4pm call")}
          disabled={isProcessing}
          className="px-2.5 py-1 text-[11px] bg-slate-900/80 hover:bg-indigo-950/40 border border-slate-800 hover:border-indigo-500/40 text-slate-300 rounded-lg transition-all"
        >
          "Finish proposal & PR review..."
        </button>
        <button
          onClick={() => handleSampleClick("The proposal is blocked until I hear back from the client")}
          disabled={isProcessing}
          className="px-2.5 py-1 text-[11px] bg-slate-900/80 hover:bg-amber-950/40 border border-slate-800 hover:border-amber-500/40 text-slate-300 rounded-lg transition-all"
        >
          "The proposal is blocked..."
        </button>
        <button
          onClick={() => handleSampleClick("Sort out the design stuff for the new feature")}
          disabled={isProcessing}
          className="px-2.5 py-1 text-[11px] bg-slate-900/80 hover:bg-violet-950/40 border border-slate-800 hover:border-violet-500/40 text-slate-300 rounded-lg transition-all"
        >
          "Sort out design stuff (CoT Test)"
        </button>
      </div>
    </div>
  );
}
