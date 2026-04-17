import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Bird, History as HistoryIcon, Info, Mic, RefreshCw, Share2, Trash2 } from 'lucide-react';
import { BIRD_DATASET, DEFAULT_BIRD } from './constants/birds';
import { analyzeBirdSound, checkServerHealth } from './services/api';
import { clearHistoryRecords, loadHistoryRecords, saveHistoryRecord } from './services/history';
import { BirdDetection, HistoryRecord } from './types';

type AppState = 'idle' | 'recording' | 'analyzing' | 'result' | 'history' | 'error';
type HealthStatus = 'healthy' | 'unhealthy';

export default function App() {
  const isDevelopment =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  const [state, setState] = useState<AppState>('idle');
  const [recordingTime, setRecordingTime] = useState(0);
  const [detections, setDetections] = useState<BirdDetection[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lon: number }>({ lat: 39.9042, lon: 116.4074 });
  const [healthStatus, setHealthStatus] = useState<HealthStatus>('unhealthy');
  const [historyRecords, setHistoryRecords] = useState<HistoryRecord[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analysisAbortControllerRef = useRef<AbortController | null>(null);
  const analysisRunIdRef = useRef(0);
  const audioUrlRef = useRef<string | null>(null);
  const healthCheckInFlightRef = useRef(false);

  useEffect(() => {
    setHistoryRecords(loadHistoryRecords());
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
      },
      (error) => console.warn('Geolocation error:', error)
    );
  }, []);

  useEffect(() => {
    audioUrlRef.current = audioUrl;
  }, [audioUrl]);

  useEffect(() => {
    let isMounted = true;

    const runHealthCheck = async () => {
      if (healthCheckInFlightRef.current) {
        return;
      }

      healthCheckInFlightRef.current = true;

      try {
        const isHealthy = await checkServerHealth();

        if (isMounted) {
          setHealthStatus(isHealthy ? 'healthy' : 'unhealthy');
        }
      } finally {
        healthCheckInFlightRef.current = false;
      }
    };

    runHealthCheck();
    const intervalId = window.setInterval(runHealthCheck, 1000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    return () => {
      cleanupRecordingResources();
      cancelAnalyzeRequest();
      revokeAudioUrl(audioUrlRef.current);
    };
  }, []);

  const getBirdInfo = (species: string) => BIRD_DATASET[species] || DEFAULT_BIRD;

  const revokeAudioUrl = (url: string | null) => {
    if (url) {
      URL.revokeObjectURL(url);
    }
  };

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const cleanupRecordingResources = () => {
    clearTimer();

    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current = null;
    }

    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }

    audioChunksRef.current = [];
  };

  const cancelAnalyzeRequest = () => {
    analysisRunIdRef.current += 1;

    if (analysisAbortControllerRef.current) {
      analysisAbortControllerRef.current.abort();
      analysisAbortControllerRef.current = null;
    }
  };

  const clearAudio = () => {
    revokeAudioUrl(audioUrlRef.current);
    audioUrlRef.current = null;
    setAudioUrl(null);
  };

  const persistHistoryRecord = (nextDetections: BirdDetection[]) => {
    if (nextDetections.length === 0) {
      return;
    }

    const record = saveHistoryRecord({
      lat: location.lat,
      lon: location.lon,
      detections: nextDetections,
    });

    setHistoryRecords((prev) => [record, ...prev].slice(0, 20));
  };

  const resetApp = () => {
    cleanupRecordingResources();
    cancelAnalyzeRequest();
    clearAudio();
    setState('idle');
    setDetections([]);
    setErrorMessage(null);
    setRecordingTime(0);
  };

  const openHistoryPage = () => {
    cleanupRecordingResources();
    cancelAnalyzeRequest();
    clearAudio();
    setDetections([]);
    setErrorMessage(null);
    setRecordingTime(0);
    setHistoryRecords(loadHistoryRecords());
    setState('history');
  };

  const openHistoryRecord = (record: HistoryRecord) => {
    cleanupRecordingResources();
    cancelAnalyzeRequest();
    clearAudio();
    setDetections(record.detections);
    setErrorMessage(null);
    setRecordingTime(0);
    setState('result');
  };

  const clearAllHistory = () => {
    clearHistoryRecords();
    setHistoryRecords([]);
  };

  const startRecording = async () => {
    try {
      resetApp();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);

      audioStreamRef.current = stream;
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        mediaRecorderRef.current = null;

        if (audioChunksRef.current.length === 0) {
          return;
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/mpeg' });
        const nextAudioUrl = URL.createObjectURL(audioBlob);
        clearAudio();
        audioUrlRef.current = nextAudioUrl;
        setAudioUrl(nextAudioUrl);
        await handleAnalyze(audioBlob);
      };

      mediaRecorder.start();
      setErrorMessage(null);
      setState('recording');
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Microphone access denied:', err);
      setErrorMessage('无法访问麦克风，请检查权限设置。');
      setState('error');
    }
  };

  const stopRecording = () => {
    if (state !== 'recording' || !mediaRecorderRef.current) {
      return;
    }

    mediaRecorderRef.current.stop();

    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }

    clearTimer();
  };

  const cancelRecording = () => {
    if (state !== 'recording') {
      return;
    }

    cleanupRecordingResources();
    clearAudio();
    setRecordingTime(0);
    setDetections([]);
    setErrorMessage(null);
    setState('idle');
  };

  const handleAnalyze = async (blob: Blob) => {
    const runId = analysisRunIdRef.current + 1;
    analysisRunIdRef.current = runId;

    const controller = new AbortController();
    analysisAbortControllerRef.current = controller;

    setState('analyzing');

    try {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      if (analysisRunIdRef.current !== runId) {
        return;
      }

      const response = await analyzeBirdSound(blob, location.lat, location.lon, controller.signal);
      if (analysisRunIdRef.current !== runId) {
        return;
      }

      setDetections(response.detections);
      persistHistoryRecord(response.detections);
      setState('result');
    } catch (err) {
      if (analysisRunIdRef.current !== runId || controller.signal.aborted) {
        return;
      }

      console.error('Analysis failed:', err);

      if (isDevelopment) {
        const mockDetections: BirdDetection[] = [
          {
            scientific_name: 'Pycnonotus sinensis',
            common_name: 'Light-vented Bulbul',
            species: 'pycsin1',
            confidence: 0.876,
            start_seconds: 0,
            end_seconds: 5,
          },
          {
            scientific_name: 'Eophona migratoria',
            common_name: 'Chinese Grosbeak',
            species: 'chigro1',
            confidence: 0.124,
            start_seconds: 0,
            end_seconds: 5,
          },
        ];

        setDetections(mockDetections);
        persistHistoryRecord(mockDetections);
        setState('result');
      } else {
        setErrorMessage('识别失败，请检查网络或后端服务。');
        setState('error');
      }
    } finally {
      if (analysisAbortControllerRef.current === controller) {
        analysisAbortControllerRef.current = null;
      }
    }
  };

  const cancelAnalyzing = () => {
    if (state !== 'analyzing') {
      return;
    }

    cancelAnalyzeRequest();
    clearAudio();
    setDetections([]);
    setErrorMessage(null);
    setState('idle');
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatHistoryDate = (value: string) => {
    const date = new Date(value);

    return new Intl.DateTimeFormat('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const historySummary = {
    count: historyRecords.length,
    latestBird:
      historyRecords[0]?.detections[0] ? getBirdInfo(historyRecords[0].detections[0].species).nameCn : '暂无',
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 md:p-8">
      <div className="fixed right-4 top-4 z-50">
        <div
          className={`h-3.5 w-3.5 rounded-full border border-white/80 shadow-sm ${
            healthStatus === 'healthy' ? 'bg-emerald-500' : 'bg-red-500'
          }`}
          title={healthStatus === 'healthy' ? 'Server healthy' : 'Server unhealthy'}
          aria-label={healthStatus === 'healthy' ? 'Server healthy' : 'Server unhealthy'}
        />
      </div>

      <div className="w-full max-w-5xl flex flex-col lg:flex-row gap-8 items-start justify-center">
        <div className={`hidden lg:flex flex-col gap-6 flex-1 max-w-lg ${state === 'result' || state === 'history' ? '!flex' : ''}`}>
          <div className="mb-4">
            {state === 'result' && (
              <button
                onClick={resetApp}
                className="mb-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-medium text-secondary-text border border-glass-border shadow-sm"
              >
                <ArrowLeft className="w-4 h-4" />
                返回继续识别
              </button>
            )}

            {state === 'history' && (
              <button
                onClick={resetApp}
                className="mb-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-medium text-secondary-text border border-glass-border shadow-sm"
              >
                <ArrowLeft className="w-4 h-4" />
                返回首页
              </button>
            )}

            {state === 'history' ? (
              <>
                <h2 className="text-4xl font-bold text-accent-green mb-4 leading-tight">历史识别记录</h2>
                <p className="text-secondary-text leading-relaxed">
                  这里会保存每次识别后的本地结果。你可以快速查看概要、重新打开某次识别详情，或一次性清空全部记录。
                </p>
                <div className="flex gap-3 mt-6">
                  <span className="px-4 py-2 bg-white rounded-xl text-xs font-semibold border border-glass-border shadow-sm">
                    共 {historySummary.count} 条记录
                  </span>
                  <button
                    onClick={clearAllHistory}
                    disabled={historyRecords.length === 0}
                    className="px-4 py-2 bg-white rounded-xl text-xs font-semibold border border-glass-border shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    清空全部
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-4xl font-bold text-accent-green mb-4 leading-tight">闻其声，见其形</h2>
                <p className="text-secondary-text leading-relaxed">
                  用环境录音识别附近鸟类。完成分析后，结果会自动保存在当前设备，方便稍后从历史记录继续查看。
                </p>
                <div className="flex gap-3 mt-6">
                  <span className="px-4 py-2 bg-white rounded-xl text-xs font-semibold border border-glass-border shadow-sm">
                    1,200+ 种类识别
                  </span>
                  <span className="px-4 py-2 bg-white rounded-xl text-xs font-semibold border border-glass-border shadow-sm">
                    秒级结果回看
                  </span>
                </div>
              </>
            )}
          </div>

          {state === 'history' && (
            <div className="space-y-4 w-full">
              {historyRecords.length === 0 ? (
                <div className="glass-card p-6 rounded-3xl text-sm text-secondary-text">
                  还没有历史记录。先完成一次识别，结果就会自动保存到本地。
                </div>
              ) : (
                historyRecords.map((record) => {
                  const topDetection = record.detections[0];
                  const info = topDetection ? getBirdInfo(topDetection.species) : DEFAULT_BIRD;

                  return (
                    <button
                      key={record.id}
                      onClick={() => openHistoryRecord(record)}
                      className="glass-card p-5 rounded-3xl w-full text-left transition-transform hover:-translate-y-0.5"
                    >
                      <div className="flex items-start gap-4">
                        <div className="w-20 h-20 bg-white rounded-2xl overflow-hidden shrink-0 shadow-sm">
                          <img src={info.image} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-3 mb-2">
                            <div className="text-lg font-bold text-primary-text truncate">{info.nameCn}</div>
                            <div className="text-[11px] text-secondary-text whitespace-nowrap">
                              {formatHistoryDate(record.createdAt)}
                            </div>
                          </div>
                          <div className="text-xs italic text-secondary-text truncate mb-3">
                            {topDetection?.scientific_name || '暂无识别结果'}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-secondary-text">
                            <span className="rounded-full bg-white/70 px-2.5 py-1">
                              最高置信度 {topDetection ? Math.round(topDetection.confidence * 100) : 0}%
                            </span>
                            <span className="rounded-full bg-white/70 px-2.5 py-1">
                              共 {record.detections.length} 项结果
                            </span>
                            <span className="rounded-full bg-white/70 px-2.5 py-1">
                              {record.lat.toFixed(1)}N {record.lon.toFixed(1)}E
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}

          {state === 'result' && detections.length > 0 && (
            <div className="space-y-4 w-full">
              {detections.map((det, idx) => {
                const info = getBirdInfo(det.species);

                return (
                  <motion.div
                    key={`${det.species}-${idx}`}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className={`glass-card p-6 rounded-3xl flex gap-4 ${idx > 0 ? 'opacity-80' : ''}`}
                  >
                    <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center text-3xl shadow-sm overflow-hidden shrink-0">
                      <img src={info.image} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
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

        <div
          className={`app-view glass-panel rounded-[40px] w-full max-w-[360px] h-[640px] flex flex-col p-8 shadow-2xl relative overflow-hidden shrink-0 ${
            state === 'result' ? 'hidden lg:flex' : ''
          }`}
        >
          <div className="flex justify-between items-center mb-10 z-10">
            <div className="text-2xl font-bold text-accent-green tracking-wider">听鸟</div>
            <div className="text-[10px] bg-black/5 px-3 py-1.5 rounded-full text-secondary-text font-medium">
              {location.lat.toFixed(1)}N {location.lon.toFixed(1)}E
            </div>
          </div>

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
                    <h2 className="text-xl font-bold text-primary-text mb-2">准备开始识别了吗？</h2>
                    <p className="text-xs text-secondary-text px-6">点击开始，记录周围环境中的鸟鸣声</p>
                  </div>

                  <button
                    onClick={startRecording}
                    className="w-24 h-24 rounded-full bg-white border-[8px] border-accent-green/20 flex items-center justify-center shadow-lg hover:scale-105 transition-transform group"
                  >
                    <div className="w-12 h-12 bg-accent-green rounded-full flex items-center justify-center group-active:scale-95 transition-transform">
                      <Mic className="text-white w-6 h-6" />
                    </div>
                  </button>

                  <button
                    onClick={openHistoryPage}
                    className="text-xs text-secondary-text mt-4 flex items-center gap-2 rounded-full px-4 py-2 bg-white/55 border border-glass-border"
                  >
                    <HistoryIcon className="w-3.5 h-3.5" />
                    查看历史记录
                  </button>
                </motion.div>
              )}

              {state === 'history' && (
                <motion.div
                  key="history"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 flex flex-col"
                >
                  <div className="mb-6 flex items-center gap-2">
                    <button onClick={resetApp} className="p-1.5 bg-black/5 rounded-lg text-secondary-text">
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <span className="text-sm font-bold text-primary-text">历史记录</span>
                  </div>

                  <div className="rounded-3xl bg-white/60 border border-white/40 p-5 mb-4">
                    <div className="text-xs text-secondary-text mb-2">概要</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-2xl bg-white/75 p-3">
                        <div className="text-[11px] text-secondary-text">记录总数</div>
                        <div className="text-2xl font-bold text-primary-text">{historySummary.count}</div>
                      </div>
                      <div className="rounded-2xl bg-white/75 p-3">
                        <div className="text-[11px] text-secondary-text">最近识别</div>
                        <div className="text-sm font-bold text-primary-text truncate">{historySummary.latestBird}</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                    {historyRecords.length === 0 ? (
                      <div className="rounded-3xl bg-white/55 border border-white/40 p-5 text-sm text-secondary-text">
                        当前没有可查看的历史结果。
                      </div>
                    ) : (
                      historyRecords.map((record) => {
                        const topDetection = record.detections[0];
                        const info = topDetection ? getBirdInfo(topDetection.species) : DEFAULT_BIRD;

                        return (
                          <button
                            key={record.id}
                            onClick={() => openHistoryRecord(record)}
                            className="w-full rounded-3xl bg-white/55 border border-white/40 p-4 text-left"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-14 h-14 rounded-2xl overflow-hidden shrink-0">
                                <img
                                  src={info.image}
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-bold text-primary-text truncate">{info.nameCn}</div>
                                <div className="text-[10px] text-secondary-text truncate">
                                  {formatHistoryDate(record.createdAt)}
                                </div>
                                <div className="text-[10px] text-accent-green mt-1">
                                  {topDetection ? Math.round(topDetection.confidence * 100) : 0}% 置信度
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>

                  <div className="mt-4 space-y-3">
                    <button
                      onClick={resetApp}
                      className="w-full py-3.5 bg-accent-green text-white rounded-2xl font-bold shadow-lg shadow-accent-green/20"
                    >
                      返回首页
                    </button>
                    <button
                      onClick={clearAllHistory}
                      disabled={historyRecords.length === 0}
                      className="w-full py-3.5 bg-white text-secondary-text rounded-2xl font-bold border border-glass-border disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      清空所有历史记录
                    </button>
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
                  <div className="w-full flex justify-start">
                    <button
                      onClick={cancelRecording}
                      className="inline-flex items-center gap-2 rounded-xl bg-black/5 px-3 py-2 text-xs font-medium text-secondary-text"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      取消
                    </button>
                  </div>

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
                    <div className="text-xs text-secondary-text">正在聆听周围环境...</div>
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
                  <div className="w-full flex justify-start">
                    <button
                      onClick={cancelAnalyzing}
                      className="inline-flex items-center gap-2 rounded-xl bg-black/5 px-3 py-2 text-xs font-medium text-secondary-text"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      返回
                    </button>
                  </div>

                  <div className="relative">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
                      className="w-32 h-32 border-4 border-accent-green/20 border-t-accent-green rounded-full"
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Bird className="w-10 h-10 text-accent-green animate-bounce" />
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="text-lg font-bold text-primary-text mb-2">正在分析中</div>
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
                          <img
                            src={getBirdInfo(detections[0].species).image}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <div>
                          <div className="font-bold text-primary-text">{getBirdInfo(detections[0].species).nameCn}</div>
                          <div className="text-[10px] text-secondary-text italic">{detections[0].scientific_name}</div>
                          <div className="mt-2 text-xs font-bold text-accent-green">
                            置信度 {Math.round(detections[0].confidence * 100)}%
                          </div>
                        </div>
                      </div>
                      <p className="text-[10px] text-secondary-text leading-relaxed line-clamp-3">
                        {getBirdInfo(detections[0].species).description}
                      </p>
                    </div>
                  )}

                  <div className="mt-auto space-y-3">
                    <button
                      onClick={resetApp}
                      className="w-full py-3.5 bg-accent-green text-white rounded-2xl font-bold shadow-lg shadow-accent-green/20 flex items-center justify-center gap-2"
                    >
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

          <div className="mt-6 pt-6 border-t border-black/5 text-center">
            <p className="text-[9px] text-secondary-text/60 tracking-widest uppercase font-bold">
              Smart AI Bird Observation Tool
            </p>
          </div>
        </div>

        <div className={`lg:hidden flex flex-col gap-4 mt-8 w-full ${state !== 'result' ? 'hidden' : ''}`}>
          {detections.map((det, idx) => {
            const info = getBirdInfo(det.species);

            return (
              <div key={`${det.species}-${idx}`} className="glass-card p-5 rounded-3xl flex gap-4">
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
