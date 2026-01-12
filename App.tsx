
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { AppStatus, TranscriptionTurn, VOICES, VoiceName } from './types';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import Waveform from './components/Waveform';
import PromptEditor from './components/PromptEditor';
import { gemini } from './services/geminiService';

// Encoding/Decoding helpers
function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

const App: React.FC = () => {
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [transcription, setTranscription] = useState<TranscriptionTurn[]>([]);
  const [finalPrompt, setFinalPrompt] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [useThinking, setUseThinking] = useState(false);
  const [useFast, setUseFast] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<VoiceName>('Zephyr');
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const outAudioContextRef = useRef<AudioContext | null>(null);
  const sessionRef = useRef<any>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  const currentInputTranscription = useRef('');
  const currentOutputTranscription = useRef('');

  const stopSession = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setStatus(AppStatus.IDLE);
  }, []);

  const startSession = useCallback(async () => {
    try {
      setStatus(AppStatus.LISTENING);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = inputCtx;
      outAudioContextRef.current = outputCtx;

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const l = inputData.length;
              const int16 = new Int16Array(l);
              for (let i = 0; i < l; i++) {
                int16[i] = inputData[i] * 32768;
              }
              const pcmBlob = {
                data: encode(new Uint8Array(int16.buffer)),
                mimeType: 'audio/pcm;rate=16000',
              };

              sessionPromise.then(session => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.outputTranscription) {
              currentOutputTranscription.current += message.serverContent.outputTranscription.text;
            } else if (message.serverContent?.inputTranscription) {
              currentInputTranscription.current += message.serverContent.inputTranscription.text;
            }

            if (message.serverContent?.turnComplete) {
              const u = currentInputTranscription.current;
              const m = currentOutputTranscription.current;
              if (u || m) {
                setTranscription(prev => [...prev, { role: 'user', text: u }, { role: 'model', text: m }]);
              }
              currentInputTranscription.current = '';
              currentOutputTranscription.current = '';
            }

            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio) {
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
              const audioBuffer = await decodeAudioData(decode(base64Audio), outputCtx, 24000, 1);
              const source = outputCtx.createBufferSource();
              source.buffer = audioBuffer;
              const outNode = outputCtx.createGain();
              source.connect(outNode);
              outNode.connect(outputCtx.destination);
              
              source.addEventListener('ended', () => {
                sourcesRef.current.delete(source);
              });
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
            }

            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => s.stop());
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onerror: (e) => console.error('Live Error:', e),
          onclose: () => setStatus(AppStatus.IDLE),
        },
        config: {
          responseModalities: [Modality.AUDIO],
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice } }
          },
          systemInstruction: 'You are an AI Prompt Design Assistant. Actively listen to the user and guide them to be more specific. You are concise and professional.',
        }
      });

      sessionRef.current = await sessionPromise;

    } catch (err) {
      console.error(err);
      setStatus(AppStatus.ERROR);
    }
  }, [selectedVoice]);

  const handleRefine = async () => {
    const fullText = transcription.map(t => t.text).join('\n');
    if (!fullText) return;
    
    setIsRefining(true);
    setStatus(AppStatus.THINKING);
    try {
      const result = await gemini.refinePrompt(fullText, useThinking, useFast);
      setFinalPrompt(result);
      setStatus(AppStatus.READY);
    } catch (err) {
      console.error(err);
      setStatus(AppStatus.ERROR);
    } finally {
      setIsRefining(false);
    }
  };

  const handleReset = () => {
    setTranscription([]);
    setFinalPrompt('');
    setStatus(AppStatus.IDLE);
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-white selection:text-black">
      {/* Subtle background gradients */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-white/[0.02] blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-zinc-400/[0.03] blur-[100px] rounded-full"></div>
      </div>

      <div className="relative z-10 max-w-[1600px] mx-auto px-8 lg:px-24 py-16">
        
        {/* Navigation / Header Area */}
        <header className="flex flex-col md:flex-row justify-between items-baseline mb-24 border-b border-white/[0.05] pb-12 gap-8">
          <div>
            <h1 className="text-xl font-black tracking-[0.6em] uppercase text-white mb-2">Foundry.AI</h1>
            <p className="text-[10px] text-zinc-500 uppercase tracking-[0.4em] font-medium">Prompt Engineering Protocol</p>
          </div>
          
          <div className="flex flex-wrap gap-12 items-end">
            <div className="flex flex-col items-end">
              <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest mb-1.5">Stream Pulse</span>
              <div className="flex gap-1 items-center">
                <div className={`w-1 h-1 rounded-full ${status === AppStatus.LISTENING ? 'bg-white animate-pulse' : 'bg-zinc-800'}`}></div>
                <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                  {status === AppStatus.LISTENING ? 'Active_Uplink' : 'Idle_Standby'}
                </span>
              </div>
            </div>
            
            <div className="flex flex-col items-end">
              <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest mb-1.5">Model Engine</span>
              <span className="text-[10px] font-mono text-white uppercase tracking-wider">
                {useThinking ? 'Gemini_3_Pro (Reasoning)' : useFast ? 'Gemini_Lite (Flash)' : 'Gemini_3_Pro (Standard)'}
              </span>
            </div>
          </div>
        </header>

        {/* Main Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-20">
          
          {/* Left Control Column (Inputs) */}
          <div className="lg:col-span-5 space-y-20">
            
            {/* Visualizer & Record Section */}
            <section className="space-y-12">
              <div className="space-y-4">
                <h2 className="text-5xl font-light tracking-tight leading-tight">
                  Design through <br />
                  <span className="font-bold italic">articulation</span>.
                </h2>
                <p className="text-zinc-500 text-sm max-w-sm leading-relaxed tracking-wide">
                  Bridge the gap between thought and logic. Our foundry distills natural speech into structural AI protocols.
                </p>
              </div>

              <div className="relative bg-white/[0.02] border border-white/[0.06] p-12 transition-all hover:bg-white/[0.03] overflow-hidden group">
                {/* Visualizer */}
                <div className="mb-16">
                  <Waveform active={status === AppStatus.LISTENING} intensity={85} />
                </div>
                
                <div className="flex flex-col gap-5">
                  {status === AppStatus.IDLE || status === AppStatus.READY || status === AppStatus.ERROR ? (
                    <button
                      onClick={startSession}
                      className="group relative w-full bg-white text-black text-[11px] font-black py-6 tracking-[0.4em] uppercase transition-all hover:scale-[1.01] active:scale-[0.98]"
                    >
                      Initialize Uplink
                      <span className="absolute right-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <i className="fas fa-chevron-right text-[10px]"></i>
                      </span>
                    </button>
                  ) : (
                    <button
                      onClick={stopSession}
                      className="w-full border border-white text-white text-[11px] font-black py-6 tracking-[0.4em] uppercase transition-all hover:bg-white hover:text-black"
                    >
                      Suspend Session
                    </button>
                  )}
                </div>

                <div className="mt-8 flex justify-center">
                   <span className="text-[9px] text-zinc-700 uppercase tracking-[0.3em] font-bold group-hover:text-zinc-500 transition-colors">
                    Hardware: Microphone Interface 01
                   </span>
                </div>
              </div>
            </section>

            {/* Parameter Matrix */}
            <section className="space-y-8">
              <div className="flex items-center gap-4">
                <h3 className="text-[10px] font-black uppercase tracking-[0.5em] text-white">System Configuration</h3>
                <div className="h-px flex-1 bg-white/[0.05]"></div>
              </div>
              
              <div className="grid grid-cols-2 gap-px bg-white/[0.08] border border-white/[0.08]">
                <button 
                  onClick={() => {setUseThinking(!useThinking); if(!useThinking) setUseFast(false);}}
                  className={`p-10 transition-all text-left ${useThinking ? 'bg-white text-black' : 'bg-[#050505] text-zinc-500 hover:text-white'}`}
                >
                  <span className="block text-[11px] font-black tracking-[0.2em] uppercase mb-2">Thinking</span>
                  <span className={`block text-[10px] leading-relaxed uppercase tracking-widest ${useThinking ? 'text-black/60' : 'text-zinc-700'}`}>32k budget logic engine</span>
                </button>
                <button 
                  onClick={() => {setUseFast(!useFast); if(!useFast) setUseThinking(false);}}
                  className={`p-10 transition-all text-left ${useFast ? 'bg-white text-black' : 'bg-[#050505] text-zinc-500 hover:text-white'}`}
                >
                  <span className="block text-[11px] font-black tracking-[0.2em] uppercase mb-2">Lightning</span>
                  <span className={`block text-[10px] leading-relaxed uppercase tracking-widest ${useFast ? 'text-black/60' : 'text-zinc-700'}`}>Ultra low latency Lite</span>
                </button>
              </div>
            </section>

            {/* Voice Matrix */}
            <section className="space-y-8">
              <div className="flex items-center gap-4">
                <h3 className="text-[10px] font-black uppercase tracking-[0.5em] text-white">Neural Voice Profiles</h3>
                <div className="h-px flex-1 bg-white/[0.05]"></div>
              </div>
              <div className="grid grid-cols-5 gap-px bg-white/[0.1] border border-white/[0.1]">
                {VOICES.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVoice(v.id)}
                    className={`flex flex-col items-center justify-center py-6 transition-all ${selectedVoice === v.id ? 'bg-white text-black' : 'bg-[#050505] text-zinc-600 hover:text-zinc-300'}`}
                  >
                    <i className={`fas ${v.gender === 'Female' ? 'fa-venus' : 'fa-mars'} text-[12px] mb-2`}></i>
                    <span className="text-[8px] font-black uppercase tracking-widest">{v.label}</span>
                  </button>
                ))}
              </div>
            </section>
          </div>

          {/* Right Column (Outputs & Logs) */}
          <div className="lg:col-span-7 space-y-16">
            
            <PromptEditor 
              content={finalPrompt} 
              onUpdate={setFinalPrompt} 
              loading={isRefining} 
            />

            {/* Stream Logs */}
            <section className="space-y-8">
              <div className="flex justify-between items-baseline">
                <div className="flex items-center gap-4 flex-1">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.5em] text-white">Uplink Telemetry</h3>
                  <div className="h-px flex-1 bg-white/[0.05]"></div>
                </div>
                <button 
                  onClick={handleRefine}
                  disabled={transcription.length === 0 || isRefining}
                  className="ml-8 text-[11px] font-black uppercase tracking-[0.3em] text-white hover:line-through decoration-zinc-500 transition-all disabled:opacity-10"
                >
                  Process_Refinement
                </button>
              </div>
              
              <div className="bg-[#080808] border border-white/[0.04] divide-y divide-white/[0.02] max-h-[500px] overflow-y-auto custom-scrollbar">
                {transcription.length === 0 ? (
                  <div className="p-20 text-center space-y-4">
                    <p className="text-[10px] font-bold text-zinc-800 uppercase tracking-[0.6em]">Awaiting Uplink Stream</p>
                    <div className="w-12 h-[1px] bg-zinc-900 mx-auto"></div>
                  </div>
                ) : (
                  transcription.map((turn, i) => (
                    <div key={i} className="p-8 grid grid-cols-12 gap-8 hover:bg-white/[0.01] transition-colors group">
                      <div className="col-span-2">
                         <span className={`text-[9px] font-black uppercase tracking-[0.2em] ${turn.role === 'user' ? 'text-zinc-500' : 'text-zinc-300'}`}>
                          [{turn.role === 'user' ? 'USR' : 'SYS'}]
                         </span>
                      </div>
                      <div className="col-span-10 text-[13px] text-zinc-400 font-mono leading-relaxed group-hover:text-zinc-200 transition-colors">
                        {turn.text}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <div className="flex gap-4">
               <button 
                onClick={handleReset}
                className="w-full border border-zinc-900 text-zinc-700 text-[10px] font-black py-5 tracking-[0.5em] uppercase transition-all hover:bg-zinc-950 hover:text-zinc-500 hover:border-zinc-800"
              >
                Flush Foundry Memory
              </button>
            </div>
          </div>
        </div>

        {/* Dynamic Status / Footer */}
        <footer className="mt-40 pt-16 border-t border-white/[0.05] flex flex-col md:flex-row justify-between items-start md:items-center gap-12">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-16 gap-y-4">
            <div className="space-y-1">
              <span className="block text-[9px] font-black uppercase tracking-widest text-zinc-600">Protocol</span>
              <span className="block text-[11px] text-zinc-400 font-mono">TLS 1.3 / Gemini Native</span>
            </div>
            <div className="space-y-1">
              <span className="block text-[9px] font-black uppercase tracking-widest text-zinc-600">Encryption</span>
              <span className="block text-[11px] text-zinc-400 font-mono">End-to-End Latent</span>
            </div>
            <div className="space-y-1 hidden md:block">
              <span className="block text-[9px] font-black uppercase tracking-widest text-zinc-600">Version</span>
              <span className="block text-[11px] text-zinc-400 font-mono">Foundry_v2.0.4-BETA</span>
            </div>
          </div>
          
          <div className="flex flex-col items-end">
            <span className="text-[9px] font-black uppercase tracking-[0.8em] text-zinc-800 mb-2">PromptSync Foundry</span>
            <div className="w-full h-[1px] bg-zinc-900"></div>
          </div>
        </footer>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;700&display=swap');
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        
        .font-mono {
          font-family: 'JetBrains Mono', monospace;
        }

        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #111; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #222; }
        
        button {
          cursor: pointer;
        }
      `}</style>
    </div>
  );
};

export default App;
