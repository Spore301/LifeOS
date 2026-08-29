import { ParseResult, Task, ClarificationQuestion } from './types';

const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions';

const SYSTEM_PROMPT = `
You are the AI core of LifeOS, a voice-first scheduling assistant.
Your job is to parse unstructured human transcripts or chat text into discrete structured tasks AND identify ambiguity requiring clarification.

Rules:
1. Extract discrete tasks with:
   - title: concise, action-oriented (e.g., "Finish client proposal")
   - durationMinutes: estimated duration in minutes (default to 30 if unspecified, but flag if completely ambiguous)
   - priority: 'low' | 'medium' | 'high' | 'urgent'
   - deadline: optional ISO time or explicit string (e.g. "by 4pm", "end of day")
2. Chain-of-Thought Clarification Loop:
   - If a task is severely ambiguous (e.g. "sort out design stuff" without context/time, or "meeting" with no duration/person), do NOT schedule it silently.
   - Return EXACTLY ONE clarifying question in the 'clarifications' array. NEVER return a long list of questions. One at a time, conversationally.
3. Intent Detection:
   - Identify if the user is:
     * 'NEW_TASKS': Adding one or more new tasks.
     * 'FLAG_BLOCKER': Expressing that a task is blocked (e.g., "proposal is blocked until client calls").
     * 'ADD_URGENT': Adding a high-priority ad-hoc task right now.
     * 'ANSWER_CLARIFICATION': Providing missing details to a previous question.

Return strictly valid JSON in the following format:
{
  "tasks": [
    {
      "id": "task-1",
      "title": "Finish client proposal",
      "durationMinutes": 60,
      "priority": "high",
      "deadline": "17:00",
      "isBlocked": false
    }
  ],
  "clarifications": [
    {
      "id": "clar-1",
      "taskId": "task-1",
      "question": "What is the deadline for reviewing Aditya's PR?",
      "fieldMissing": "deadline"
    }
  ],
  "intent": "NEW_TASKS",
  "assistantSummary": "I extracted 2 tasks for you. I just need one quick detail before scheduling."
}
`;

export async function parseTranscriptWithDeepSeek(
  transcript: string,
  historySummary: string = ''
): Promise<ParseResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    console.warn('[LifeOS] DEEPSEEK_API_KEY is not configured. Utilizing intelligent mock parser.');
    return generateMockParseResult(transcript);
  }

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
        response_format: { type: 'json_object' },
        temperature: 0.2,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `History context: ${historySummary}\n\nUser input: "${transcript}"`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`DeepSeek API error (${response.status}):`, errorText);
      return generateMockParseResult(transcript);
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content;
    if (!rawContent) {
      throw new Error('Empty response from DeepSeek API');
    }

    const parsed = JSON.parse(rawContent);

    // Sanitize and structure result
    return {
      tasks: (parsed.tasks || []).map((t: any, idx: number) => ({
        id: t.id || `task-${Date.now()}-${idx}`,
        title: t.title || 'Untitled task',
        durationMinutes: typeof t.durationMinutes === 'number' ? t.durationMinutes : 30,
        priority: ['low', 'medium', 'high', 'urgent'].includes(t.priority) ? t.priority : 'medium',
        deadline: t.deadline || undefined,
        isBlocked: Boolean(t.isBlocked),
        blockerReason: t.blockerReason || undefined,
      })),
      clarifications: (parsed.clarifications || []).slice(0, 1).map((c: any) => ({
        id: c.id || `clar-${Date.now()}`,
        taskId: c.taskId || undefined,
        question: c.question || 'Could you provide more details about this task?',
        fieldMissing: c.fieldMissing || 'general',
      })),
      intent: parsed.intent || 'NEW_TASKS',
      rawTranscript: transcript,
      assistantSummary: parsed.assistantSummary || 'I parsed your request and extracted the tasks.',
    };
  } catch (error) {
    console.error('Error executing DeepSeek parse:', error);
    return generateMockParseResult(transcript);
  }
}

// Fallback Mock Parser for instant local testing without API key
function generateMockParseResult(transcript: string): ParseResult {
  const lower = transcript.toLowerCase();

  // Handle blocker intent mock
  if (lower.includes('blocked') || lower.includes('stuck') || lower.includes('can\'t proceed')) {
    return {
      tasks: [
        {
          id: `task-${Date.now()}-1`,
          title: 'Finish proposal draft',
          durationMinutes: 60,
          priority: 'high',
          isBlocked: true,
          blockerReason: 'Waiting for client feedback',
        },
      ],
      clarifications: [],
      intent: 'FLAG_BLOCKER',
      rawTranscript: transcript,
      assistantSummary: 'Flagged proposal draft as blocked. I will push it out to the next open slot after your unblock window.',
    };
  }

  // Handle ambiguous task mock
  if (lower.includes('stuff') || lower.includes('something') || lower.includes('sort out')) {
    return {
      tasks: [
        {
          id: `task-${Date.now()}-1`,
          title: 'Sort out design assets',
          durationMinutes: 30,
          priority: 'medium',
        },
      ],
      clarifications: [
        {
          id: `clar-${Date.now()}-1`,
          taskId: `task-${Date.now()}-1`,
          question: 'What specific design assets do you need to sort out, and what is the deadline?',
          fieldMissing: 'title',
        },
      ],
      intent: 'NEW_TASKS',
      rawTranscript: transcript,
      assistantSummary: 'I noticed "sort out design assets" is missing specific details. Let\'s clarify that before scheduling.',
    };
  }

  // General multi-task extraction mock
  const mockTasks: Task[] = [];
  if (lower.includes('proposal') || lower.includes('finish')) {
    mockTasks.push({
      id: `task-${Date.now()}-1`,
      title: 'Finish client proposal',
      durationMinutes: 60,
      priority: 'high',
      deadline: '17:00',
    });
  }
  if (lower.includes('pr') || lower.includes('review')) {
    mockTasks.push({
      id: `task-${Date.now()}-2`,
      title: 'Review PR changes',
      durationMinutes: 30,
      priority: 'medium',
    });
  }
  if (lower.includes('prep') || lower.includes('call') || lower.includes('meeting')) {
    mockTasks.push({
      id: `task-${Date.now()}-3`,
      title: 'Prep for afternoon call',
      durationMinutes: 45,
      priority: 'urgent',
    });
  }

  if (mockTasks.length === 0) {
    mockTasks.push({
      id: `task-${Date.now()}-default`,
      title: transcript.slice(0, 40) || 'New scheduled task',
      durationMinutes: 30,
      priority: 'medium',
    });
  }

  return {
    tasks: mockTasks,
    clarifications: [],
    intent: 'NEW_TASKS',
    rawTranscript: transcript,
    assistantSummary: `I extracted ${mockTasks.length} task${mockTasks.length > 1 ? 's' : ''} from your brain dump.`,
  };
}
