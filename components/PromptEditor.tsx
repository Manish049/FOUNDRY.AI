
import React, { useState, useEffect } from 'react';

interface PromptEditorProps {
  content: string;
  onUpdate: (val: string) => void;
  loading: boolean;
}

const PromptEditor: React.FC<PromptEditorProps> = ({ content, onUpdate, loading }) => {
  const [localText, setLocalText] = useState(content);

  useEffect(() => {
    setLocalText(content);
  }, [content]);

  const handleCopy = () => {
    navigator.clipboard.writeText(localText);
    // Visual hint for copy could be added here if needed
  };

  return (
    <div className="bg-[#080808] border border-white/[0.05] rounded-none p-12 transition-all hover:border-white/[0.08] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.8)]">
      <div className="flex justify-between items-baseline mb-12">
        <div>
          <h3 className="text-[11px] font-black tracking-[0.4em] uppercase text-white mb-2">
            Engineered Protocol
          </h3>
          <p className="text-[9px] text-zinc-600 uppercase tracking-[0.3em] font-bold">Refinement Cycle Complete</p>
        </div>
        <div className="flex gap-8">
          <button
            onClick={handleCopy}
            className="text-[10px] font-black tracking-[0.3em] text-zinc-500 hover:text-white uppercase transition-all"
          >
            Copy_Asset
          </button>
        </div>
      </div>
      
      {loading ? (
        <div className="h-96 flex flex-col items-center justify-center space-y-8">
          <div className="flex gap-3">
            <div className="w-1.5 h-1.5 bg-white animate-pulse [animation-delay:-0.4s]"></div>
            <div className="w-1.5 h-1.5 bg-white animate-pulse [animation-delay:-0.2s]"></div>
            <div className="w-1.5 h-1.5 bg-white animate-pulse"></div>
          </div>
          <p className="text-[10px] tracking-[0.5em] uppercase text-zinc-700 font-black">Re-Architecting...</p>
        </div>
      ) : (
        <textarea
          value={localText}
          onChange={(e) => setLocalText(e.target.value)}
          placeholder="Uplink data required to initiate engineering cycle..."
          className="w-full h-96 bg-transparent border-none p-0 text-zinc-300 font-mono text-[14px] leading-relaxed focus:ring-0 focus:outline-none transition-all resize-none placeholder:text-zinc-800 custom-scrollbar"
        />
      )}
      
      <div className="mt-12 pt-12 border-t border-white/[0.03] flex items-center justify-between">
         <div className="flex gap-6">
          <div className="flex flex-col">
            <span className="text-[8px] uppercase tracking-widest font-black text-zinc-700 mb-1">Architecture</span>
            <span className="text-[10px] uppercase tracking-widest font-bold text-zinc-400">Structural</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[8px] uppercase tracking-widest font-black text-zinc-700 mb-1">Status</span>
            <span className="text-[10px] uppercase tracking-widest font-bold text-zinc-400">Validated</span>
          </div>
        </div>
        <button
          onClick={() => onUpdate(localText)}
          className="text-[10px] bg-white text-black px-10 py-3 uppercase font-black tracking-[0.3em] transition-all hover:bg-zinc-200 active:scale-95"
        >
          Update_Source
        </button>
      </div>
    </div>
  );
};

export default PromptEditor;
