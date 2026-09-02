'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Send, Loader2, Bot, User, Check, X } from 'lucide-react';
import Markdown from './Markdown';

export interface UiChatMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

/** A tool call the agent is making, surfaced live so the wait is legible. */
export interface AgentStep {
  id: string;
  tool: string;
  title?: string;
  status: string;
}

interface ChatInterfaceProps {
  chatId: string | null;
  messages: UiChatMessage[];
  onSend: (text: string) => void;
  isProcessing: boolean;
  isChatLoading: boolean;
  /** Assistant text received so far for the in-flight reply. */
  streamingText?: string;
  /** Tool calls for the in-flight reply, in the order they started. */
  steps?: AgentStep[];
}

/** Turn a tool name into something worth reading while you wait. */
function stepLabel(step: AgentStep): string {
  const byTool: Record<string, string> = {
    bash: 'Running a command',
    read: 'Reading',
    write: 'Writing',
    edit: 'Editing',
    webfetch: 'Calling LifeOS',
    glob: 'Searching',
    grep: 'Searching',
    list: 'Listing files',
    task: 'Working',
  };
  const base = byTool[step.tool?.toLowerCase()] || step.tool || 'Working';
  return step.title ? `${base}: ${step.title}` : base;
}

export default function ChatInterface({
  chatId,
  messages,
  onSend,
  isProcessing,
  isChatLoading,
  streamingText = '',
  steps = [],
}: ChatInterfaceProps) {
  const [textInput, setTextInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const liveTranscriptRef = useRef<string>('');
  const recognitionRef = useRef<any>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isProcessing]);

  const deliver = (text: string) => {
    setTextInput('');
    onSend(text);
  };

  const startRecording = async () => {
    setErrorMessage(null);
    liveTranscriptRef.current = '';

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
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        if (recognitionRef.current) {
          try { recognitionRef.current.stop(); } catch (e) {}
        }
        stream.getTracks().forEach((track) => track.stop());

        let finalTranscript = '';
        if (liveTranscriptRef.current.trim()) {
          finalTranscript = liveTranscriptRef.current.trim();
        }
        if (!finalTranscript) {
          finalTranscript = "I need to finish the proposal, review the PR, and prep for the 4pm call.";
        }
        setIsRecording(false);
        deliver(finalTranscript);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Microphone error:', err);
      setErrorMessage('Microphone access unavailable. Type your message below.');
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
    const input = textInput.trim();
    if (!input || isProcessing) return;
    deliver(input);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const emptyState = !chatId || messages.length === 0;

  return (
    <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full px-4 py-3">
      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 pb-4">
        {isChatLoading ? (
          <div className="h-full flex items-center justify-center text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : emptyState ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mb-4 shadow-sm">
              <Bot className="w-7 h-7" />
            </div>
            <h2 className="text-base font-semibold text-slate-800">
              {chatId ? 'Start a conversation' : 'Your LifeOS assistant'}
            </h2>
            <p className="text-xs text-slate-500 max-w-md mt-1 leading-relaxed">
              {chatId
                ? 'Each chat is backed by its own always-on assistant session with your persona and tool access.'
                : 'Speak or type your raw brain dump below — LifeOS will start a new chat automatically and handle tasks, scheduling, and reminders.'}
            </p>
            {!chatId && (
              <div className="mt-6 flex flex-wrap gap-2 justify-center">
                <button
                  onClick={() => deliver("I need to finish the proposal, review the PR, and prep for the 4pm call")}
                  className="px-3 py-1.5 text-xs bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-full shadow-sm transition-all"
                >
                  "Finish proposal, review PR, prep for call..."
                </button>
                <button
                  onClick={() => deliver("The proposal is blocked until I hear back from the client")}
                  className="px-3 py-1.5 text-xs bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-full shadow-sm transition-all"
                >
                  "The proposal is blocked..."
                </button>
              </div>
            )}
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.sender !== 'user' && (
                <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white flex-shrink-0 mt-0.5 shadow-sm">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-none shadow-sm'
                    : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none shadow-sm'
                }`}
              >
                {msg.sender === 'assistant' && (
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold tracking-wider text-indigo-500 uppercase">
                      LifeOS
                    </span>
                    {msg.timestamp && (
                      <span className="text-[10px] text-slate-400">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                )}
                <Markdown variant={msg.sender === 'user' ? 'dark' : 'light'}>{msg.content}</Markdown>
              </div>

              {msg.sender === 'user' && (
                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-700 flex-shrink-0 mt-0.5">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))
        )}

        {isProcessing && (
          <div className="flex gap-3 justify-start">
            <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white flex-shrink-0 mt-0.5 shadow-sm">
              <Bot className="w-4 h-4" />
            </div>
            <div className="max-w-[85%] bg-white border border-slate-200 rounded-2xl rounded-bl-none px-4 py-3 shadow-sm">
              {steps.length > 0 && (
                <ul className="mb-2 space-y-1">
                  {steps.map((step) => {
                    const done = step.status === 'completed';
                    const failed = step.status === 'error';
                    return (
                      <li
                        key={step.id}
                        className={`flex items-center gap-2 text-[11px] ${
                          failed ? 'text-rose-500' : done ? 'text-slate-400' : 'text-slate-600'
                        }`}
                      >
                        {done ? (
                          <Check className="w-3 h-3 flex-shrink-0" />
                        ) : failed ? (
                          <X className="w-3 h-3 flex-shrink-0" />
                        ) : (
                          <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
                        )}
                        <span className="truncate">{stepLabel(step)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}

              {streamingText ? (
                <div className="text-sm leading-relaxed text-slate-800">
                  <Markdown variant="light">{streamingText}</Markdown>
                </div>
              ) : (
                steps.length === 0 && (
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Thinking...
                  </div>
                )
              )}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <div className="pt-2">
        {errorMessage && (
          <div className="mb-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
            {errorMessage}
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-2xl p-2 shadow-lg flex items-center gap-2">
          <button
            type="button"
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isProcessing}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
              isRecording
                ? 'bg-rose-600 text-white animate-mic-light'
                : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-200'
            } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={isRecording ? 'Click to stop' : 'Click to speak'}
          >
            {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          <form onSubmit={handleTextSubmit} className="flex-1 flex items-center gap-2">
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder={
                isRecording
                  ? `Recording... (${formatTime(recordingTime)})`
                  : 'Type or speak your message...'
              }
              disabled={isProcessing || isRecording}
              className="flex-1 bg-transparent px-2 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none"
            />
            <button
              type="submit"
              disabled={!textInput.trim() || isProcessing || isRecording}
              className="w-10 h-10 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl flex items-center justify-center shadow-sm transition-all"
            >
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
