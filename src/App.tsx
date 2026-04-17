import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Bird, 
  Mic, 
  Settings, 
  History as HistoryIcon, 
  Music, 
  RefreshCw, 
  CheckCircle2, 
  Share2, 
  ChevronRight, 
  Info,
  Play,
  Pause,
  ArrowLeft
} from 'lucide-react';
import { analyzeBirdSound } from './services/api';
import { BIRD_DATASET, DEFAULT_BIRD } from './constants/birds';
import { AnalyzeResponse, BirdDetection } from './types';

type AppState = 'idle' | 'recording' | 'analyzing' | 'result' | 'error';

export default function App() {
  const [state, setState] = useState<AppState>('idle');
  const [recordingTime, setRecordingTime] = useState(0);
  const [detections, setDetections] = useState<BirdDetection[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lon: number }>({ lat: 39.9042, lon: 116.4074 });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Get current location on mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lon: position.coords.longitude
          });
        },
        (error) => console.warn('Geolocation error:', error)
      );
    }
  }, []);

  const startRecording = async () => {
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
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/mpeg' });
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        
        // Auto start analysis
        handleAnalyze(audioBlob);
      };

      mediaRecorder.start();
      setState('recording');
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Microphone access denied:', err);
      setErrorMessage('无法访问麦克风，请检查权限。');
      setState('error');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && state === 'recording') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const handleAnalyze = async (blob: Blob) => {
    setState('analyzing');
    try {
      // Small artificial delay for "analyzing" feel
      await new Promise(resolve => setTimeout(resolve, 2500));
      
      const response = await analyzeBirdSound(blob, location.lat, location.lon);
      setDetections(response.detections);
      setState('result');
    } catch (err) {
      console.error('Analysis failed:', err);
      // Fallback for demo purposes if API not available
      if (process.env.NODE_ENV === 'development') {
        console.warn('API not found, showing mock data for demo');
        const mockDetections: BirdDetection[] = [
          {
            scientific_name: 'Pycnonotus sinensis',
            common_name: 'Light-vented Bulbul',
            species: 'pycsin1',
            confidence: 0.876,
            start_seconds: 0,
            end_seconds: 5
          },
          {
            scientific_name: 'Eophona migratoria',
            common_name: 'Chinese Grosbeak',
            species: 'chigro1',
            confidence: 0.124,
            start_seconds: 0,
            end_seconds: 5
          }
        ];
        setDetections(mockDetections);
        setState('result');
      } else {
        setErrorMessage('识别失败，请检查网络或后端服务。');
        setState('error');
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const resetApp = () => {
    setState('idle');
    setDetections([]);
    setErrorMessage(null);
    setAudioUrl(null);
    setRecordingTime(0);
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 md:p-8">
      {/* Container to match the layout pattern of the design */}
      <div className="w-full max-w-5xl flex flex-col lg:flex-row gap-8 items-start justify-center">
        
        {/* Intro text and results panel (visible when large or in results mode) */}
        <div className={`hidden lg:flex flex-col gap-6 flex-1 max-w-lg ${state === 'result' ? '!flex' : ''}`}>
          <div className="mb-4">
            <h2 className="text-4xl font-bold text-accent-green mb-4 leading-tight">闻其声，见其影</h2>
            <p className="text-secondary-text leading-relaxed">
              AI 驱动的鸟类鸣叫识别专家。只需录制几秒钟，我们就能从复杂的森林交响曲中分辨出歌唱者的身份。
            </p>
            <div className="flex gap-3 mt-6">
              <span className="px-4 py-2 bg-white rounded-xl text-xs font-semibold border border-glass-border shadow-sm">1,200+ 种类识别</span>
              <span className="px-4 py-2 bg-white rounded-xl text-xs font-semibold border border-glass-border shadow-sm">秒级实时分析</span>
            </div>
          </div>

          {/* Results list in the side panel for desktop/results view */}
          {state === 'result' && detections.length > 0 && (
            <div className="space-y-4 w-full">
              {detections.map((det, idx) => {
                const info = BIRD_DATASET[det.species] || DEFAULT_BIRD;
                return (
                  <motion.div 
                    key={idx}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className={`glass-card p-6 rounded-3xl flex gap-4 ${idx > 0 ? 'opacity-80' : ''}`}
                  >
                    <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center text-3xl shadow-sm overflow-hidden shrink-0">
                      {idx === 0 ? <img src={info.image} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : '🦅'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xl font-bold text-primary-text truncate">{info.nameCn}</div>
                      <div className="text-xs italic text-secondary-text mb-3 truncate">{info.scientificName}</div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-1.5 bg-black/5 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-accent-green transition-all duration-1000" 
                            style={{ width: `${det.confidence * 100}%` }}
                          />
                        </div>
                        <div className="text-xs font-bold text-accent-green w-10 text-right">
                          {Math.round(det.confidence * 100)}%
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Mobile View / Main App Interface */}
        <div className={`app-view glass-panel rounded-[40px] w-full max-w-[360px] h-[640px] flex flex-col p-8 shadow-2xl relative overflow-hidden shrink-0 ${state === 'result' ? 'hidden lg:flex' : ''}`}>
          {/* Header */}
          <div className="flex justify-between items-center mb-10 z-10">
            <div className="text-2xl font-bold text-accent-green tracking-wider">闻啼鸟</div>
            <div className="text-[10px] bg-black/5 px-3 py-1.5 rounded-full text-secondary-text font-medium">
              39.9N 116.4E
            </div>
          </div>

          {/* Main App Area */}
          <div className="flex-1 flex flex-col z-10">
            <AnimatePresence mode="wait">
              {state === 'idle' && (
                <motion.div 
                  key="idle"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 flex flex-col items-center justify-center gap-8"
                >
                  <div className="text-center">
                    <div className="w-20 h-20 bg-white/50 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-sm">
                      <Bird className="w-10 h-10 text-accent-green" />
                    </div>
                    <h2 className="text-xl font-bold text-primary-text mb-2">准备好识别了吗？</h2>
                    <p className="text-xs text-secondary-text px-6">点击开始，记录大自然的声音</p>
                  </div>

                  <button 
                    onClick={startRecording}
                    className="w-24 h-24 rounded-full bg-white border-[8px] border-accent-green/20 flex items-center justify-center shadow-lg hover:scale-105 transition-transform group"
                  >
                    <div className="w-12 h-12 bg-accent-green rounded-full flex items-center justify-center group-active:scale-95 transition-transform">
                      <Mic className="text-white w-6 h-6" />
                    </div>
                  </button>
                  
                  <div className="text-xs text-secondary-text mt-4 flex items-center gap-2">
                    <HistoryIcon className="w-3.5 h-3.5" />
                    查看历史记录
                  </div>
                </motion.div>
              )}

              {state === 'recording' && (
                <motion.div 
                  key="recording"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex-1 flex flex-col items-center justify-center gap-12"
                >
                  <div className="flex items-center gap-1 h-14">
                    {[...Array(8)].map((_, i) => (
                      <motion.div 
                        key={i}
                        animate={{ height: [15, 60, 15] }}
                        transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.1 }}
                        className="w-1 bg-accent-green rounded-full opacity-60"
                        style={{ height: '20px' }}
                      />
                    ))}
                  </div>

                  <button 
                    onClick={stopRecording}
                    className="w-24 h-24 rounded-full bg-white border-[8px] border-red-500/20 flex items-center justify-center shadow-lg hover:scale-105 transition-transform"
                  >
                    <div className="w-12 h-12 bg-red-500 rounded-xl animate-pulse" />
                  </button>

                  <div className="flex flex-col items-center gap-2">
                    <div className="text-2xl font-mono font-bold text-primary-text">{formatTime(recordingTime)}</div>
                    <div className="text-xs text-secondary-text">正在聆听森林的声音...</div>
                  </div>
                </motion.div>
              )}

              {state === 'analyzing' && (
                <motion.div 
                   key="analyzing"
                   initial={{ opacity: 0 }}
                   animate={{ opacity: 1 }}
                   className="flex-1 flex flex-col items-center justify-center gap-10"
                >
                   <div className="relative">
                     <motion.div 
                       animate={{ rotate: 360 }}
                       transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
                       className="w-32 h-32 border-4 border-accent-green/20 border-t-accent-green rounded-full" 
                     />
                     <div className="absolute inset-0 flex items-center justify-center">
                       <Bird className="w-10 h-10 text-accent-green animate-bounce" />
                     </div>
                   </div>
                   <div className="text-center">
                     <div className="text-lg font-bold text-primary-text mb-2">深度分析中</div>
                     <div className="text-[11px] text-secondary-text tracking-widest uppercase">Analyzing preview.mp3</div>
                   </div>
                </motion.div>
              )}

              {state === 'result' && (
                <motion.div 
                  key="result-mobile"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex-1 flex flex-col"
                >
                  <div className="mb-6 flex items-center gap-2">
                    <button onClick={resetApp} className="p-1.5 bg-black/5 rounded-lg text-secondary-text">
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <span className="text-sm font-bold text-primary-text">识别结果</span>
                  </div>

                  {detections.length > 0 && (
                    <div className="bg-white/60 rounded-3xl p-5 border border-white/40 mb-6">
                      <div className="flex gap-4 mb-6">
                        <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-sm">
                          <img src={BIRD_DATASET[detections[0].species]?.image || DEFAULT_BIRD.image} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        </div>
                        <div>
                          <div className="font-bold text-primary-text">{BIRD_DATASET[detections[0].species]?.nameCn}</div>
                          <div className="text-[10px] text-secondary-text italic">{detections[0].scientific_name}</div>
                          <div className="mt-2 text-xs font-bold text-accent-green">置信度: {Math.round(detections[0].confidence * 100)}%</div>
                        </div>
                      </div>
                      <p className="text-[10px] text-secondary-text leading-relaxed line-clamp-3">
                        {BIRD_DATASET[detections[0].species]?.description}
                      </p>
                    </div>
                  )}

                  <div className="mt-auto space-y-3">
                    <button onClick={resetApp} className="w-full py-3.5 bg-accent-green text-white rounded-2xl font-bold shadow-lg shadow-accent-green/20 flex items-center justify-center gap-2">
                       <RefreshCw className="w-4 h-4" />
                       再次识别
                    </button>
                    <button className="w-full py-3.5 bg-white text-secondary-text rounded-2xl font-bold border border-glass-border flex items-center justify-center gap-2">
                       <Share2 className="w-4 h-4" />
                       分享发现
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer Text */}
          <div className="mt-6 pt-6 border-t border-black/5 text-center">
            <p className="text-[9px] text-secondary-text/60 tracking-widest uppercase font-bold">Smart AI Bird Observation Tool</p>
          </div>
        </div>

        {/* Placeholder for small screen results list if mobile view doesn't show it */}
        <div className={`lg:hidden flex flex-col gap-4 mt-8 w-full ${state !== 'result' ? 'hidden' : ''}`}>
           {detections.map((det, idx) => {
              const info = BIRD_DATASET[det.species] || DEFAULT_BIRD;
              return (
                <div key={idx} className="glass-card p-5 rounded-3xl flex gap-4">
                  <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-2xl shrink-0 overflow-hidden">
                    <img src={info.image} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-primary-text">{info.nameCn}</div>
                    <div className="text-[10px] text-secondary-text mb-2 italic">{info.scientificName}</div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1 bg-black/5 rounded-full overflow-hidden">
                        <div className="h-full bg-accent-green" style={{ width: `${det.confidence * 100}%` }} />
                      </div>
                      <span className="text-[10px] font-bold text-accent-green">{Math.round(det.confidence * 100)}%</span>
                    </div>
                  </div>
                </div>
              );
           })}
        </div>

      </div>

      {state === 'error' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-6">
          <div className="glass-panel p-8 rounded-[32px] max-w-sm w-full text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500">
              <Info />
            </div>
            <h3 className="text-xl font-bold mb-2">识别出错了</h3>
            <p className="text-secondary-text text-sm mb-6">{errorMessage}</p>
            <button onClick={resetApp} className="w-full py-4 bg-accent-green text-white rounded-2xl font-bold shadow-lg">
              返回重试
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
