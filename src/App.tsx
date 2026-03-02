import React, { useState, useEffect, useRef, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { Play, RotateCcw, Settings, Code, Terminal, Zap, Cpu, Pause, Sun, Moon, Download, Video, Camera } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Prism from 'prismjs';
import { toPng } from 'html-to-image';
import gifshot from 'gifshot';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-markup';
import 'prismjs/themes/prism-tomorrow.css';
import { cn } from './lib/utils';

// CodeMirror imports
import CodeMirror from '@uiw/react-codemirror';
import { python } from '@codemirror/lang-python';
import { javascript } from '@codemirror/lang-javascript';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';
import { githubLight } from '@uiw/codemirror-theme-github';

// Types
type TypingMode = 'char' | 'line';

interface AppState {
  inputCode: string;
  displayedCode: string;
  isTyping: boolean;
  speed: number;
  mode: TypingMode;
  language: string;
  output: string;
  isExecuting: boolean;
  isSoundEnabled: boolean;
  theme: 'dark' | 'light';
  showLineNumbers: boolean;
  isWaitingForInput: boolean;
  inputPrompt: string;
  currentInputValue: string;
  isRecording: boolean;
  recordingProgress: number;
  showLivePreview: boolean;
  pyodideStatus: 'idle' | 'loading' | 'ready' | 'error';
  pyodideError: string | null;
  isConsoleCollapsed: boolean;
  packages: string;
  fps: number;
  exportFormat: 'gif' | 'mp4';
  previewBg: string;
}

const DEFAULT_PYTHON_CODE = `def fibonacci(n):
    if n <= 1:
        return n
    else:
        return fibonacci(n-1) + fibonacci(n-2)

# Calculate first 10 numbers
for i in range(10):
    print(f"Fib({i}) = {fibonacci(i)}")
`;

export default function App() {
  const [state, setState] = useState<AppState>({
    inputCode: DEFAULT_PYTHON_CODE,
    displayedCode: '',
    isTyping: false,
    speed: 50, // ms per character or line
    mode: 'char',
    language: 'python',
    output: '',
    isExecuting: false,
    isSoundEnabled: true,
    theme: 'dark',
    showLineNumbers: true,
    isWaitingForInput: false,
    inputPrompt: '',
    currentInputValue: '',
    isRecording: false,
    recordingProgress: 0,
    showLivePreview: true,
    pyodideStatus: 'idle',
    pyodideError: null,
    isConsoleCollapsed: false,
    packages: '',
    fps: 30,
    exportFormat: 'mp4',
    previewBg: 'transparent',
  });

  const typingRef = useRef<NodeJS.Timeout | null>(null);
  const displayRef = useRef<HTMLPreElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const consoleRef = useRef<HTMLPreElement>(null);
  const pyodideRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const inputResolveRef = useRef<((value: string) => void) | null>(null);
  const consoleInputRef = useRef<HTMLInputElement>(null);
  const recordingFramesRef = useRef<string[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Focus console input when waiting
  useEffect(() => {
    if (state.isWaitingForInput && consoleInputRef.current) {
      consoleInputRef.current.focus();
    }
  }, [state.isWaitingForInput]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollContainerRef.current && state.isTyping) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [state.displayedCode, state.isTyping]);

  // Auto-scroll console
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [state.output]);

  // Sound Generator
  const playTypingSound = useCallback(() => {
    if (!state.isSoundEnabled) return;
    
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const ctx = audioCtxRef.current;
      
      // Resume context if suspended (browser policy)
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150 + Math.random() * 50, ctx.currentTime);
      
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } catch (err) {
      console.warn('Audio playback failed:', err);
    }
  }, [state.isSoundEnabled]);

  const generateAICode = async () => {
    // AI features removed
  };

  // Initialize Pyodide
  useEffect(() => {
    const initPyodide = async () => {
      if (window.loadPyodide) {
        setState(prev => ({ ...prev, pyodideStatus: 'loading', pyodideError: null }));
        try {
          pyodideRef.current = await window.loadPyodide();
          setState(prev => ({ ...prev, pyodideStatus: 'ready' }));
          console.log('Pyodide loaded successfully');
        } catch (err: any) {
          console.error('Failed to load Pyodide:', err);
          setState(prev => ({ 
            ...prev, 
            pyodideStatus: 'error', 
            pyodideError: err?.message || 'Failed to initialize Python environment. Please check your internet connection or try refreshing.' 
          }));
        }
      } else {
        setState(prev => ({ 
          ...prev, 
          pyodideStatus: 'error', 
          pyodideError: 'Pyodide loader not found. Make sure the script is correctly included in index.html.' 
        }));
      }
    };
    initPyodide();
  }, []);

  // Syntax Highlighting
  useEffect(() => {
    if (displayRef.current && state.displayedCode) {
      try {
        Prism.highlightElement(displayRef.current);
      } catch (err) {
        console.error('Prism highlighting error:', err);
      }
    }
  }, [state.displayedCode, state.language]);

  const stopTyping = useCallback(() => {
    setState(prev => ({ ...prev, isTyping: false }));
    if (typingRef.current) clearInterval(typingRef.current);
  }, []);

  const runPython = useCallback(async () => {
    if (state.pyodideStatus !== 'ready' || !pyodideRef.current) {
      const errorMsg = state.pyodideStatus === 'loading' 
        ? 'Python environment is still loading. Please wait a moment...' 
        : (state.pyodideError || 'Python environment is not available.');
      
      setState(prev => ({ 
        ...prev, 
        output: prev.output + `\n[System] ${errorMsg}\n`,
        isExecuting: false 
      }));
      return;
    }

    // Immediately show the console and set executing state
    setState(prev => ({ 
      ...prev, 
      isExecuting: true, 
      isConsoleCollapsed: false,
      output: '>>> Executing Python code...\n',
      isWaitingForInput: false,
      currentInputValue: ''
    }));
    
    // Give the browser time to animate the console and paint the UI
    await new Promise(resolve => setTimeout(resolve, 500));
    
    try {
      const pyodide = pyodideRef.current;

      // Automatically load packages from imports in the code
      setState(prev => ({ ...prev, output: prev.output + `>>> Analyzing imports and loading packages...\n` }));
      await pyodide.loadPackagesFromImports(state.inputCode);

      // Manually load requested packages if any
      const pkgList = state.packages.split(',').map(p => p.trim()).filter(p => p);
      if (pkgList.length > 0) {
        // Filter out standard library modules that might be in the list
        // Pyodide's loadPackage will fail for modules like 'random'
        const filteredPkgs = pkgList.filter(pkg => !['random', 'math', 'os', 'sys', 'json', 're', 'datetime', 'time'].includes(pkg.toLowerCase()));
        
        if (filteredPkgs.length > 0) {
          setState(prev => ({ ...prev, output: prev.output + `>>> Loading manual packages: ${filteredPkgs.join(', ')}...\n` }));
          try {
            await pyodide.loadPackage(filteredPkgs);
          } catch (pkgErr: any) {
            setState(prev => ({ ...prev, output: prev.output + `[Warning] Failed to load some packages: ${pkgErr.message}\n` }));
          }
        }
      }

      // Ensure Pyodide is fully ready
      if (typeof pyodide.runPython !== 'function') {
        throw new Error('Pyodide is not fully initialized.');
      }

      // Clear the "Initializing" message and start fresh
      setState(prev => ({ ...prev, output: '' }));

      // Setup real-time stdout and stderr
      pyodide.setStdout({
        batched: (text: string) => {
          flushSync(() => {
            setState(prev => ({ ...prev, output: prev.output + text + '\n' }));
          });
        }
      });

      pyodide.setStderr({
        batched: (text: string) => {
          flushSync(() => {
            setState(prev => ({ ...prev, output: prev.output + 'Error: ' + text + '\n' }));
          });
        }
      });

      // Override input() to support integrated interactive prompts
      pyodide.globals.set('input', (promptText: string) => {
        return new Promise((resolve) => {
          inputResolveRef.current = resolve;
          const prompt = promptText || '';
          setState(prev => ({ 
            ...prev, 
            isWaitingForInput: true, 
            inputPrompt: prompt,
            currentInputValue: '',
            output: prev.output + prompt // Inline prompt
          }));
        });
      });
      
      // Handle the case where the user might try to use input() in a way that returns a promise
      // We'll automatically wrap the code to await input() calls if we use runPythonAsync
      
      let codeToRun = state.inputCode || 'pass';
      
      // Simple regex to wrap input() calls with await if they aren't already
      // This is a heuristic but works for most common cases like a = input() or print(input())
      // We only do this if we find 'input(' in the code.
      if (codeToRun.includes('input(')) {
        // Replace input( with await input( but avoid double awaits
        codeToRun = codeToRun.replace(/(?<!await\s+)input\s*\(/g, 'await input(');
      }
      
      await pyodide.runPythonAsync(codeToRun);
      
      // Append execution completion message
      setState(prev => ({ 
        ...prev, 
        output: prev.output + '\n\n' + '━'.repeat(20) + ' EXECUTED ' + '━'.repeat(20) + '\n'
      }));
    } catch (err: any) {
      if (err?.message?.includes('KeyboardInterrupt')) {
        setState(prev => ({ ...prev, output: prev.output + '\n\n[Execution Interrupted]\n' }));
      } else {
        console.error('Python execution error:', err);
        // Format Python error message for the console
        const errorLines = err?.message?.split('\n') || [];
        const cleanError = errorLines.length > 0 ? errorLines[errorLines.length - 1] : String(err);
        
        setState(prev => ({ 
          ...prev, 
          output: prev.output + `\n\n❌ Python Error:\n${err?.message || String(err)}\n` 
        }));
      }
    } finally {
      setState(prev => ({ ...prev, isExecuting: false, isWaitingForInput: false }));
    }
  }, [state.inputCode]);

  const stopExecution = useCallback(() => {
    // On the main thread, we can't easily kill a tight loop, 
    // but we can reset the state and try to interrupt if Pyodide supports it.
    setState(prev => ({ ...prev, isExecuting: false, isWaitingForInput: false }));
    // If we had a worker, we would terminate it here.
    // For main thread, we just hope the next async check in Pyodide catches the state change.
  }, []);

  // Typing Logic
  const startTyping = useCallback(() => {
    if (state.isTyping) {
      setState(prev => ({ ...prev, isTyping: false }));
      if (typingRef.current) clearInterval(typingRef.current);
      return;
    }

    setState(prev => ({ ...prev, isTyping: true, displayedCode: '' }));
    
    let currentIndex = 0;
    const codeToType = state.inputCode;
    const lines = codeToType.split('\n');
    let currentLineIndex = 0;

    const typeNext = () => {
      try {
        if (state.mode === 'char') {
          if (currentIndex < codeToType.length) {
            setState(prev => ({
              ...prev,
              displayedCode: codeToType.slice(0, currentIndex + 1)
            }));
            currentIndex++;
            playTypingSound();
          } else {
            stopTyping();
            if (state.language === 'python') runPython();
          }
        } else {
          if (currentLineIndex < lines.length) {
            setState(prev => ({
              ...prev,
              displayedCode: lines.slice(0, currentLineIndex + 1).join('\n')
            }));
            currentLineIndex++;
            playTypingSound();
          } else {
            stopTyping();
            if (state.language === 'python') runPython();
          }
        }
      } catch (err) {
        console.error('Typing animation error:', err);
        stopTyping();
      }
    };

    typingRef.current = setInterval(typeNext, state.speed);
  }, [state.inputCode, state.mode, state.speed, state.isTyping, state.language, runPython, stopTyping, playTypingSound]);

  const startRecording = useCallback(async () => {
    if (!displayRef.current || !scrollContainerRef.current) return;
    
    setState(prev => ({ ...prev, isRecording: true, recordingProgress: 0 }));
    recordingFramesRef.current = [];
    
    // Start the animation if not already typing
    if (!state.isTyping) {
      startTyping();
    }

    // Small delay to let the UI settle before first capture
    await new Promise(resolve => setTimeout(resolve, 100));

    const captureFrame = async () => {
      if (scrollContainerRef.current) {
        try {
          const dataUrl = await toPng(scrollContainerRef.current, {
            backgroundColor: state.theme === 'dark' ? '#050505' : '#ffffff',
            width: scrollContainerRef.current.offsetWidth,
            height: scrollContainerRef.current.offsetHeight,
            pixelRatio: 2, // High resolution
            filter: (node) => {
              // Skip any elements that might cause issues with inlining
              if (node.tagName === 'IFRAME' || node.tagName === 'SCRIPT') return false;
              return true;
            }
          });
          recordingFramesRef.current.push(dataUrl);
        } catch (err) {
          console.error('Frame capture error:', err);
        }
      }
    };

    recordingIntervalRef.current = setInterval(captureFrame, 1000 / state.fps);
  }, [state.isTyping, state.theme, state.fps, startTyping]);

  const stopRecording = useCallback(async () => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }

    if (recordingFramesRef.current.length === 0) {
      setState(prev => ({ ...prev, isRecording: false }));
      return;
    }

    const frames = recordingFramesRef.current;
    setState(prev => ({ ...prev, isRecording: false }));

    if (state.exportFormat === 'gif') {
      gifshot.createGIF({
        images: frames,
        gifWidth: 800,
        gifHeight: 600,
        interval: 1 / state.fps,
        numFrames: frames.length,
      }, (obj: any) => {
        if (!obj.error) {
          const link = document.createElement('a');
          link.download = `code-animation-${Date.now()}.gif`;
          link.href = obj.image;
          link.click();
        }
        setState(prev => ({ ...prev, recordingProgress: 0 }));
      });
    } else {
      // MP4 Export using MediaRecorder + Canvas
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Set canvas size based on first frame
      const img = new Image();
      img.src = frames[0];
      await new Promise(resolve => img.onload = resolve);
      canvas.width = img.width;
      canvas.height = img.height;

      const stream = canvas.captureStream(0); // Manual frame capture
      const track = stream.getVideoTracks()[0] as any;
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') 
        ? 'video/webm;codecs=vp9' 
        : MediaRecorder.isTypeSupported('video/webm') 
          ? 'video/webm' 
          : 'video/ogg';
      
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `code-animation-${Date.now()}.webm`;
        link.href = url;
        link.click();
      };

      recorder.start();

      for (const frame of frames) {
        const frameImg = new Image();
        frameImg.src = frame;
        await new Promise(resolve => frameImg.onload = resolve);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(frameImg, 0, 0);
        
        // Manually request a frame capture
        if (track.requestFrame) {
          track.requestFrame();
        } else {
          // Fallback for browsers without requestFrame
          await new Promise(resolve => setTimeout(resolve, 1000 / state.fps));
        }
        
        // Give some time for the recorder to process the frame
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Final delay to ensure last frame is captured
      await new Promise(resolve => setTimeout(resolve, 500));
      recorder.stop();
    }
  }, [state.exportFormat, state.fps]);

  useEffect(() => {
    if (state.isRecording && !state.isTyping) {
      stopRecording();
    }
  }, [state.isTyping, state.isRecording, stopRecording]);

  const reset = useCallback(() => {
    stopTyping();
    setState(prev => ({ ...prev, displayedCode: '', output: '' }));
  }, [stopTyping]);

  const getEditorLanguage = useCallback(() => {
    switch (state.language) {
      case 'python': return [python()];
      case 'javascript': return [javascript()];
      case 'css': return [css()];
      case 'markup': return [html()];
      default: return [python()];
    }
  }, [state.language]);

  const toggleTheme = () => {
    setState(prev => ({ ...prev, theme: prev.theme === 'dark' ? 'light' : 'dark' }));
  };

  const Preview = ({ code, language, theme }: { code: string, language: string, theme: string }) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const isInitializedRef = useRef(false);

    useEffect(() => {
      if (!iframeRef.current) return;
      const doc = iframeRef.current.contentDocument;
      if (!doc) return;

      // Initialize the iframe structure only once
      if (!isInitializedRef.current) {
        doc.open();
        doc.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="UTF-8">
              <style id="base-style">
                body { 
                  margin: 0; 
                  padding: 20px; 
                  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
                  transition: background 0.3s, color 0.3s;
                  overflow-x: hidden;
                }
                .preview-container { max-width: 100%; }
                .box { padding: 20px; border: 1px solid #ccc; margin: 10px 0; border-radius: 8px; }
                .btn { padding: 8px 16px; border-radius: 4px; cursor: pointer; }
              </style>
              <style id="preview-style"></style>
            </head>
            <body><div id="root"></div></body>
          </html>
        `);
        doc.close();
        isInitializedRef.current = true;
      }

      const root = doc.getElementById('root');
      const previewStyle = doc.getElementById('preview-style');
      const body = doc.body;

      if (!root || !previewStyle || !body) return;

      // Update theme
      body.style.background = theme === 'dark' ? '#121212' : '#ffffff';
      body.style.color = theme === 'dark' ? '#e4e4e7' : '#18181b';

      if (language === 'markup' || language === 'html') {
        // For HTML, we update the root innerHTML
        // We use a try-catch because partial HTML might cause temporary DOM issues
        try {
          root.innerHTML = code;
          previewStyle.textContent = ''; // Clear CSS preview styles
        } catch (e) {
          // Ignore partial tag errors
        }
      } else if (language === 'css') {
        // For CSS, we update the style tag and ensure sample content exists
        previewStyle.textContent = code;
        if (!doc.querySelector('.preview-container')) {
          root.innerHTML = `
            <div class="preview-container">
              <h1>CSS Preview</h1>
              <p>This is a sample paragraph to demonstrate your CSS styles.</p>
              <div class="box">Sample Box</div>
              <button class="btn">Sample Button</button>
              <ul>
                <li>Item One</li>
                <li>Item Two</li>
                <li>Item Three</li>
              </ul>
            </div>
          `;
        }
      }
    }, [code, language, theme]);

    return (
      <iframe
        ref={iframeRef}
        className="w-full h-full border-none rounded-xl bg-white shadow-inner"
        title="Live Preview"
      />
    );
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (typingRef.current) clearInterval(typingRef.current);
    };
  }, []);

  const startTypingRef = useRef(startTyping);
  const resetRef = useRef(reset);
  const runPythonRef = useRef(runPython);
  const stopExecutionRef = useRef(stopExecution);
  const startRecordingRef = useRef(startRecording);
  const stopRecordingRef = useRef(stopRecording);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    startTypingRef.current = startTyping;
    resetRef.current = reset;
    runPythonRef.current = runPython;
    stopExecutionRef.current = stopExecution;
    startRecordingRef.current = startRecording;
    stopRecordingRef.current = stopRecording;
  }, [startTyping, reset, runPython, stopExecution, startRecording, stopRecording]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      
      // Check if we are in an input field
      const isInput = target.tagName === 'TEXTAREA' || 
                     target.tagName === 'INPUT' || 
                     target.isContentEditable ||
                     target.closest('.cm-editor') !== null; // Specifically check for CodeMirror

      const isMod = e.ctrlKey || e.metaKey;

      // Global shortcuts (work even when focused on inputs, if they use Ctrl/Cmd)
      // Ctrl+R / Cmd+R: Reset
      if (isMod && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        resetRef.current();
        return;
      }

      // Ctrl+Shift+Enter: Run Python
      if (isMod && e.shiftKey && e.key === 'Enter') {
        e.preventDefault();
        runPythonRef.current();
        return;
      }

      // Ctrl+Enter / Cmd+Enter: Animate
      if (isMod && e.key === 'Enter') {
        e.preventDefault();
        startTypingRef.current();
        return;
      }

      // If we are in an input, don't trigger single-key shortcuts
      if (isInput) return;

      // R: Toggle Recording
      if (e.key.toLowerCase() === 'r' && !isMod) {
        e.preventDefault();
        if (stateRef.current.isRecording) {
          stopRecordingRef.current();
        } else {
          startRecordingRef.current();
        }
      }

      // Space: Play/Pause
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        startTypingRef.current();
      }

      // M: Toggle Mute
      if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        setState(prev => ({ ...prev, isSoundEnabled: !prev.isSoundEnabled }));
      }

      // X: Clear Console
      if (e.key.toLowerCase() === 'x' && !isMod) {
        e.preventDefault();
        setState(prev => ({ ...prev, output: '' }));
      }

      // C: Toggle Console
      if (e.key.toLowerCase() === 'c' && !isMod) {
        e.preventDefault();
        setState(prev => ({ ...prev, isConsoleCollapsed: !prev.isConsoleCollapsed }));
      }
    };

    // Use capture: true to get events before components like CodeMirror can consume them
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []); // No dependencies, uses refs for functions

  return (
    <div className={cn(
      "flex h-screen w-full font-sans selection:bg-emerald-500/30 transition-colors duration-300",
      state.theme === 'dark' ? "bg-[#0a0a0a] text-zinc-300" : "bg-[#f8f9fa] text-zinc-700"
    )}>
      {/* Left Panel: Controls & Input */}
      <div className={cn(
        "w-[450px] border-r flex flex-col shadow-2xl z-10 transition-colors duration-300",
        state.theme === 'dark' ? "bg-[#0f0f0f] border-white/5" : "bg-white border-zinc-200"
      )}>
        <div className={cn(
          "p-6 border-b flex items-center justify-between transition-colors duration-300",
          state.theme === 'dark' ? "border-white/5" : "border-zinc-200"
        )}>
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center border transition-colors duration-300",
              state.theme === 'dark' ? "bg-emerald-500/10 border-emerald-500/20" : "bg-emerald-500/5 border-emerald-500/10"
            )}>
              <Zap className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h1 className={cn(
                "text-lg font-semibold tracking-tight transition-colors duration-300",
                state.theme === 'dark' ? "text-white" : "text-zinc-900"
              )}>CodeFlow</h1>
              <div className="flex items-center gap-2">
                <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Animator</p>
                {state.language === 'python' && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-1 h-1 rounded-full bg-zinc-500" />
                    <span className={cn(
                      "text-[10px] font-bold uppercase tracking-tighter",
                      state.pyodideStatus === 'ready' ? "text-emerald-500" : 
                      state.pyodideStatus === 'loading' ? "text-amber-500 animate-pulse" : 
                      state.pyodideStatus === 'error' ? "text-red-500" : "text-zinc-500"
                    )}>
                      {state.pyodideStatus === 'ready' ? 'Python Ready' : 
                       state.pyodideStatus === 'loading' ? 'Loading Python...' : 
                       state.pyodideStatus === 'error' ? 'Python Error' : 'Python Idle'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setState(prev => ({ ...prev, output: '' }))}
                className={cn(
                  "p-2 rounded-lg transition-all duration-300",
                  state.theme === 'dark' ? "text-zinc-400 hover:text-white hover:bg-white/5" : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100"
                )}
                title="Clear Console (X)"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                onClick={toggleTheme}
                className={cn(
                  "p-2 rounded-lg transition-all duration-300",
                  state.theme === 'dark' ? "text-zinc-400 hover:text-white hover:bg-white/5" : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100"
                )}
                title="Toggle Theme"
              >
                {state.theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
            <Settings className={cn(
              "w-5 h-5 cursor-pointer transition-colors duration-300",
              state.theme === 'dark' ? "text-zinc-600 hover:text-zinc-400" : "text-zinc-400 hover:text-zinc-600"
            )} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Language Selection */}
          <div className="space-y-4">
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
              <Code className="w-3 h-3" /> Language
            </label>
            <select
              value={state.language}
              onChange={(e) => setState(prev => ({ ...prev, language: e.target.value }))}
              className={cn(
                "w-full border rounded-xl p-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all appearance-none cursor-pointer",
                state.theme === 'dark' ? "bg-black/40 border-white/5" : "bg-zinc-50 border-zinc-200"
              )}
            >
              <option value="python">Python</option>
              <option value="javascript">JavaScript</option>
              <option value="css">CSS</option>
              <option value="markup">HTML</option>
            </select>
          </div>

          {/* Mode Selection */}
          <div className="space-y-4">
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
              <Settings className="w-3 h-3" /> Typing Mode
            </label>
            <div className={cn(
              "grid grid-cols-2 gap-2 p-1 rounded-xl border transition-colors duration-300",
              state.theme === 'dark' ? "bg-black/40 border-white/5" : "bg-zinc-50 border-zinc-200"
            )}>
              {(['char', 'line'] as TypingMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setState(prev => ({ ...prev, mode: m }))}
                  className={cn(
                    "py-2 px-4 rounded-lg text-sm font-medium transition-all duration-200",
                    state.mode === m 
                      ? (state.theme === 'dark' ? "bg-white/10 text-white shadow-lg" : "bg-white text-zinc-900 shadow-sm border border-zinc-200")
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                  )}
                >
                  {m === 'char' ? 'Character' : 'Line'}
                </button>
              ))}
            </div>
          </div>

          {/* Speed Control */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                <Cpu className="w-3 h-3" /> Speed Delay
              </label>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setState(prev => ({ ...prev, isSoundEnabled: !prev.isSoundEnabled }))}
                  className={cn(
                    "text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded border transition-all",
                    state.isSoundEnabled 
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                      : "bg-zinc-500/10 text-zinc-500 border-zinc-500/20"
                  )}
                >
                  Sound: {state.isSoundEnabled ? 'ON' : 'OFF'}
                </button>
                <span className="text-xs font-mono text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded border border-emerald-400/20">
                  {state.speed}ms
                </span>
              </div>
            </div>
            <input
              type="range"
              min="1"
              max="200"
              value={state.speed}
              onChange={(e) => setState(prev => ({ ...prev, speed: parseInt(e.target.value) }))}
              className={cn(
                "w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-emerald-500 border transition-colors duration-300",
                state.theme === 'dark' ? "bg-black/40 border-white/5" : "bg-zinc-200 border-zinc-300"
              )}
            />
          </div>

          {/* Python Packages */}
          {state.language === 'python' && (
            <div className="space-y-4">
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                <Download className="w-3 h-3" /> Python Packages
              </label>
              <input
                type="text"
                value={state.packages}
                onChange={(e) => setState(prev => ({ ...prev, packages: e.target.value }))}
                placeholder="numpy, pandas, matplotlib..."
                className={cn(
                  "w-full border rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all",
                  state.theme === 'dark' ? "bg-black/40 border-white/5 text-white" : "bg-zinc-50 border-zinc-200 text-zinc-900"
                )}
              />
              <p className="text-[10px] text-zinc-500 italic">Comma-separated list of packages to load.</p>
            </div>
          )}

          {/* Recording Settings */}
          <div className="space-y-4">
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
              <Video className="w-3 h-3" /> Recording Settings
            </label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <span className="text-[10px] text-zinc-500 uppercase font-bold">Format</span>
                <select
                  value={state.exportFormat}
                  onChange={(e) => setState(prev => ({ ...prev, exportFormat: e.target.value as any }))}
                  className={cn(
                    "w-full border rounded-lg p-2 text-xs focus:outline-none transition-all",
                    state.theme === 'dark' ? "bg-black/40 border-white/5" : "bg-zinc-50 border-zinc-200"
                  )}
                >
                  <option value="mp4">MP4 (WebM)</option>
                  <option value="gif">GIF</option>
                </select>
              </div>
              <div className="space-y-2">
                <span className="text-[10px] text-zinc-500 uppercase font-bold">FPS: {state.fps}</span>
                <input
                  type="range"
                  min="5"
                  max="60"
                  value={state.fps}
                  onChange={(e) => setState(prev => ({ ...prev, fps: parseInt(e.target.value) }))}
                  className="w-full h-1 rounded-lg accent-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Background Customization */}
          <div className="space-y-4">
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
              <Sun className="w-3 h-3" /> Preview Background
            </label>
            <div className="flex flex-wrap gap-2">
              {['transparent', '#000000', '#ffffff', '#10b981', '#3b82f6', '#f43f5e', 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 99%, #fecfef 100%)'].map((bg) => (
                <button
                  key={bg}
                  onClick={() => setState(prev => ({ ...prev, previewBg: bg }))}
                  className={cn(
                    "w-8 h-8 rounded-lg border transition-all hover:scale-110",
                    state.previewBg === bg ? "ring-2 ring-emerald-500 border-white" : "border-white/10"
                  )}
                  style={{ background: bg }}
                  title={bg}
                />
              ))}
              <input
                type="color"
                value={state.previewBg.startsWith('#') ? state.previewBg : '#000000'}
                onChange={(e) => setState(prev => ({ ...prev, previewBg: e.target.value }))}
                className="w-8 h-8 rounded-lg border border-white/10 bg-transparent cursor-pointer"
              />
            </div>
          </div>

          {/* Code Input */}
          <div className="space-y-4 flex flex-col">
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
              <Code className="w-3 h-3" /> Source Editor
            </label>
            <div className={cn(
              "relative h-[500px] min-h-[500px] max-h-[500px] group overflow-hidden rounded-2xl border transition-colors duration-300",
              state.theme === 'dark' ? "bg-black/40 border-white/5" : "bg-white border-zinc-200"
            )}>
              <CodeMirror
                value={state.inputCode}
                height="100%"
                theme={state.theme === 'dark' ? vscodeDark : githubLight}
                extensions={getEditorLanguage()}
                onChange={(value) => setState(prev => ({ ...prev, inputCode: value }))}
                className="text-sm h-full"
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: true,
                  dropCursor: true,
                  allowMultipleSelections: true,
                  indentOnInput: true,
                  bracketMatching: true,
                  autocompletion: true,
                  rectangularSelection: true,
                  crosshairCursor: true,
                  highlightActiveLine: true,
                  highlightSelectionMatches: true,
                  closeBrackets: true,
                  lineWrapping: true,
                }}
              />
              <div className="absolute bottom-4 right-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-[10px] text-emerald-400 font-mono">
                  {state.inputCode.length} chars
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className={cn(
          "p-6 border-t grid grid-cols-2 gap-3 transition-colors duration-300",
          state.theme === 'dark' ? "border-white/5 bg-black/20" : "border-zinc-200 bg-zinc-50"
        )}>
          {state.isExecuting ? (
            <button
              onClick={stopExecution}
              className="col-span-2 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold bg-red-500 text-white hover:bg-red-400 active:scale-95 shadow-[0_0_20px_rgba(239,68,68,0.2)] transition-all duration-300"
            >
              <Pause className="w-4 h-4" />
              Stop Execution
            </button>
          ) : (
            <>
              <button
                id="animate-btn"
                onClick={startTyping}
                className={cn(
                  "flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold transition-all duration-300",
                  state.isTyping 
                    ? "bg-amber-500/10 text-amber-500 border border-amber-500/20 hover:bg-amber-500/20"
                    : "bg-emerald-500 text-black hover:bg-emerald-400 active:scale-95 shadow-[0_0_20px_rgba(16,185,129,0.2)]"
                )}
              >
                {state.isTyping ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                {state.isTyping ? 'Pause' : 'Animate'}
              </button>
              <button
                id="reset-btn"
                onClick={reset}
                className={cn(
                  "flex items-center justify-center gap-2 py-3 px-4 rounded-xl border transition-all active:scale-95",
                  state.theme === 'dark' ? "bg-white/5 text-white border-white/10 hover:bg-white/10" : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50"
                )}
              >
                <RotateCcw className="w-4 h-4" />
                Reset
              </button>
            </>
          )}
        </div>

        {/* Shortcuts Hint */}
        <div className={cn(
          "px-6 py-4 border-t transition-colors duration-300",
          state.theme === 'dark' ? "border-white/5 bg-black/40" : "border-zinc-200 bg-zinc-50"
        )}>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {[
              { key: 'Space', label: 'Play/Pause' },
              { key: 'Ctrl+Enter', label: 'Animate' },
              { key: 'Ctrl+Shift+Enter', label: 'Run Python' },
              { key: 'Ctrl+R', label: 'Reset' },
              { key: 'R', label: 'Record' },
              { key: 'C', label: 'Console' },
              { key: 'X', label: 'Clear' },
              { key: 'M', label: 'Sound' },
            ].map((s) => (
              <div key={s.key} className="flex items-center gap-2">
                <kbd className={cn(
                  "px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors",
                  state.theme === 'dark' ? "bg-white/5 border-white/10 text-zinc-400" : "bg-white border-zinc-200 text-zinc-500"
                )}>{s.key}</kbd>
                <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel: Display & Output */}
      <div className={cn(
        "flex-1 flex flex-col relative overflow-hidden transition-colors duration-300",
        state.theme === 'dark' ? "bg-[#050505]" : "bg-white"
      )}>
        {/* Background Decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-emerald-500/5 blur-[120px] rounded-full" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-500/5 blur-[120px] rounded-full" />
        </div>

        {/* Display Area */}
        <div className="flex-1 p-12 flex flex-col overflow-hidden relative">
          <div className="max-w-4xl mx-auto w-full h-full flex flex-col">
            <div className="flex items-center gap-2 mb-6 text-zinc-500 shrink-0">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/30" />
                <div className="w-3 h-3 rounded-full bg-amber-500/20 border border-amber-500/30" />
                <div className="w-3 h-3 rounded-full bg-emerald-500/20 border border-emerald-500/30" />
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={state.isRecording ? stopRecording : startRecording}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-mono uppercase tracking-widest transition-all",
                    state.isRecording 
                      ? "bg-red-500 text-white animate-pulse" 
                      : (state.theme === 'dark' ? "bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10" : "bg-zinc-100 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200")
                  )}
                >
                  {state.isRecording ? <Video className="w-3 h-3" /> : <Camera className="w-3 h-3" />}
                  {state.isRecording ? 'Recording...' : 'Record GIF'}
                </button>
                <div className={cn(
                  "h-px flex-1 mx-4 transition-colors duration-300",
                  state.theme === 'dark' ? "bg-white/5" : "bg-zinc-200"
                )} />
                {(state.language === 'markup' || state.language === 'html' || state.language === 'css') && (
                  <button
                    onClick={() => setState(prev => ({ ...prev, showLivePreview: !prev.showLivePreview }))}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-mono uppercase tracking-widest transition-all mr-4",
                      state.showLivePreview
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        : (state.theme === 'dark' ? "bg-white/5 text-zinc-400 hover:text-white" : "bg-zinc-100 text-zinc-600 hover:text-zinc-900")
                    )}
                  >
                    {state.showLivePreview ? 'View Code' : 'View Preview'}
                  </button>
                )}
                <span className="text-[10px] font-mono uppercase tracking-widest">
                  {state.showLivePreview && (state.language === 'markup' || state.language === 'html' || state.language === 'css') 
                    ? 'Live Preview' 
                    : 'Code Window'}
                </span>
              </div>
            </div>

            <div className="relative group flex-1 overflow-hidden">
              <AnimatePresence mode="wait">
                {state.showLivePreview && (state.language === 'markup' || state.language === 'html' || state.language === 'css') ? (
                  <motion.div
                    key="preview"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    className="w-full h-full"
                  >
                    <Preview 
                      code={state.displayedCode} 
                      language={state.language} 
                      theme={state.theme} 
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="code"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="w-full h-full"
                  >
                    <pre 
                      ref={scrollContainerRef}
                      className={cn(
                        "prism-code rounded-2xl border p-8 shadow-2xl backdrop-blur-sm overflow-auto relative scroll-smooth whitespace-pre-wrap break-all transition-all duration-300 h-full flex",
                        state.theme === 'dark' 
                          ? "bg-black/40 border-white/5" 
                          : "bg-zinc-50 border-zinc-200"
                      )}
                      style={{ background: state.previewBg !== 'transparent' ? state.previewBg : undefined }}
                    >
                      <code ref={displayRef} className={cn(
                        `language-${state.language} flex-1`,
                        state.theme === 'light' && "text-zinc-800",
                        state.isTyping && "typing-cursor"
                      )} style={{ lineHeight: '1.5rem' }}>
                        {state.displayedCode}
                      </code>
                    </pre>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Output Panel - Absolute Overlay */}
        <AnimatePresence>
          {(state.output || state.isExecuting) && !state.isConsoleCollapsed && (
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className={cn(
                "absolute bottom-0 left-0 right-0 h-72 border-t backdrop-blur-2xl p-8 flex flex-col shadow-[0_-20px_50px_rgba(0,0,0,0.8)] z-20 transition-colors duration-300",
                state.theme === 'dark' ? "border-white/10 bg-[#0f0f0f]/95" : "border-zinc-200 bg-white/95"
              )}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  <h3 className={cn(
                    "text-xs font-semibold uppercase tracking-widest transition-colors duration-300",
                    state.theme === 'dark' ? "text-zinc-400" : "text-zinc-600"
                  )}>Console Output</h3>
                </div>
                <button 
                  onClick={() => setState(prev => ({ ...prev, output: '' }))}
                  className="text-xs text-zinc-600 hover:text-zinc-400 px-2 py-1 rounded hover:bg-white/5 transition-colors"
                >
                  Clear Console
                </button>
              </div>
              <div 
                ref={consoleRef}
                className={cn(
                  "flex-1 overflow-y-auto font-mono text-sm border scroll-smooth rounded-xl p-4 transition-colors duration-300",
                  state.theme === 'dark' ? "text-zinc-300 bg-black/40 border-white/5" : "text-zinc-700 bg-zinc-50 border-zinc-200"
                )}
              >
                <div className="whitespace-pre-wrap">
                  {state.output}
                  {state.isWaitingForInput && (
                    <span className="inline-flex items-center gap-1">
                      <input
                        ref={consoleInputRef}
                        type="text"
                        value={state.currentInputValue}
                        onChange={(e) => setState(prev => ({ ...prev, currentInputValue: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const val = state.currentInputValue;
                            setState(prev => ({ 
                              ...prev, 
                              output: prev.output + val + '\n',
                              isWaitingForInput: false,
                              currentInputValue: ''
                            }));
                            if (inputResolveRef.current) {
                              inputResolveRef.current(val);
                              inputResolveRef.current = null;
                            }
                          }
                        }}
                        className="bg-transparent border-none outline-none text-zinc-300 caret-emerald-500 min-w-[1ch]"
                        style={{ width: `${Math.max(1, state.currentInputValue.length)}ch` }}
                        autoFocus
                      />
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}

declare global {
  interface Window {
    loadPyodide: any;
  }
}
