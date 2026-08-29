export interface TranscribeResult {
  transcript: string;
  isMock?: boolean;
  error?: string;
}

export async function transcribeAudioWithWhisper(audioBlob: Blob): Promise<TranscribeResult> {
  const customUrl = process.env.WHISPER_CUSTOM_URL;
  const apiKey = process.env.OPENAI_API_KEY;

  // 1. Check if user configured a Google Colab / Self-hosted Whisper Endpoint
  if (customUrl) {
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'speech.wav');

      const response = await fetch(customUrl, {
        method: 'POST',
        headers: {
          'ngrok-skip-browser-warning': 'true',
        },
        body: formData,
        signal: AbortSignal.timeout(7000), // 7 second timeout to avoid hanging on dead ngrok tunnels
      });

      if (response.ok) {
        const data = await response.json();
        const text = data.text || data.transcript;
        if (text && typeof text === 'string') {
          return { transcript: text };
        }
      }
      console.warn(`[Whisper] Custom endpoint (${customUrl}) returned status ${response.status}. Falling back...`);
    } catch (err: any) {
      console.error('[Whisper] Failed to call custom Whisper endpoint:', err?.message || err);
    }
  }

  // 2. OpenAI Official API Endpoint
  if (apiKey) {
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'speech.wav');
      formData.append('model', 'whisper-1');

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
        body: formData,
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.text) {
          return { transcript: data.text };
        }
      }
      const errText = await response.text();
      console.error(`[Whisper] OpenAI API error (${response.status}):`, errText);
    } catch (error: any) {
      console.error('[Whisper] Error calling Whisper API:', error?.message || error);
    }
  }

  // 3. Fallback mock simulation if no endpoint is configured or active
  console.warn('[LifeOS] No active Whisper API endpoint configured or endpoints timed out. Using local voice simulation.');
  return {
    transcript: simulateVoiceTranscript(),
    isMock: true,
    error: 'No active Whisper API endpoint configured or reachable'
  };
}

function simulateVoiceTranscript(): string {
  const sampleTranscripts = [
    "I need to finish the proposal, review Aditya's PR, and prep for the 4pm call.",
    "The proposal is blocked until I hear back from the client.",
    "I need to jump on an urgent call for 30 minutes with the product team.",
    "Sort out the design stuff for the new feature landing page.",
  ];
  const randomIndex = Math.floor(Math.random() * sampleTranscripts.length);
  return sampleTranscripts[randomIndex];
}

