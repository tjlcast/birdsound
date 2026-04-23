import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Bird, Bot, Check, ChevronRight, Clock3, FileAudio, FlaskConical, FolderOpen, History as HistoryIcon, Info, Loader2, MapPin, Mic, RefreshCw, Server, Settings, Share2, Trash2, Upload } from 'lucide-react';
import { BIRD_DATASET, DEFAULT_BIRD } from './constants/birds';
import { analyzeBirdSound, buildApiBaseUrl, checkServerHealth, DEFAULT_API_HOST, DEFAULT_API_PORT } from './services/api';
import { clearHistoryRecords, loadHistoryRecords, saveHistoryRecord } from './services/history';
import { getLocalModelStatus, LOCAL_MODEL_SPECS, pickAndImportLocalModel, pickAndTranscribeAudio, resetLocalModelSession, runLocalModelChat, type LocalModelId, type LocalModelPluginStatus } from './services/localModels';
import { AnalysisDetails, BirdDetection, HistoryRecord } from './types';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';

type AppState = 'idle' | 'recording' | 'analyzing' | 'result' | 'history' | 'service-config' | 'experiment-config' | 'error';
type HealthStatus = 'healthy' | 'unhealthy';
type ConnectionTestStatus = 'idle' | 'checking' | 'available' | 'unavailable';
type BirdDisplayInfo = {
  name: string;
  scientificName: string;
  description: string;
  image: string;
};

const API_HOST_STORAGE_KEY = 'birdsound_api_host';
const API_PORT_STORAGE_KEY = 'birdsound_api_port';

export default function App() {
  const [state, setState] = useState<AppState>('idle');
  const [recordingTime, setRecordingTime] = useState(0);
  const [detections, setDetections] = useState<BirdDetection[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioFileName, setAudioFileName] = useState('preview.mp3');
  const [location, setLocation] = useState<{ lat: number; lon: number }>({ lat: 39.9042, lon: 116.4074 });
  const [healthStatus, setHealthStatus] = useState<HealthStatus>('unhealthy');
  const [historyRecords, setHistoryRecords] = useState<HistoryRecord[]>([]);
  const [analysisDetails, setAnalysisDetails] = useState<AnalysisDetails | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [apiHost, setApiHost] = useState(() => localStorage.getItem(API_HOST_STORAGE_KEY) || DEFAULT_API_HOST);
  const [apiPort, setApiPort] = useState(() => localStorage.getItem(API_PORT_STORAGE_KEY) || DEFAULT_API_PORT);
  const [draftApiHost, setDraftApiHost] = useState(apiHost);
  const [draftApiPort, setDraftApiPort] = useState(apiPort);
  const [connectionTestStatus, setConnectionTestStatus] = useState<ConnectionTestStatus>('idle');
  const [localModelStatus, setLocalModelStatus] = useState<LocalModelPluginStatus | null>(null);
  const [localModelBusy, setLocalModelBusy] = useState<string | null>(null);
  const [localModelMessage, setLocalModelMessage] = useState<string | null>(null);
  const [localTranscript, setLocalTranscript] = useState('');
  const [localTranscribePreprocessEnabled, setLocalTranscribePreprocessEnabled] = useState(true);
  const [localPrompt, setLocalPrompt] = useState('');
  const [localChatResponse, setLocalChatResponse] = useState('');
  const [localChatModelId, setLocalChatModelId] = useState<Extract<LocalModelId, 'qwen2Chat' | 'qwen3Vision'>>('qwen2Chat');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analysisAbortControllerRef = useRef<AbortController | null>(null);
  const analysisRunIdRef = useRef(0);
  const audioUrlRef = useRef<string | null>(null);
  const healthCheckInFlightRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const locationMessageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const apiBaseUrl = buildApiBaseUrl(apiHost, apiPort);

  const showLocationMessage = (message: string) => {
    setLocationMessage(message);

    if (locationMessageTimerRef.current) {
      clearTimeout(locationMessageTimerRef.current);
    }

    locationMessageTimerRef.current = setTimeout(() => {
      setLocationMessage(null);
      locationMessageTimerRef.current = null;
    }, 2600);
  };

  const updateCurrentLocation = (shouldNotify = true) => {
    if (!navigator.geolocation) {
      if (shouldNotify) {
        showLocationMessage('当前设备不支持定位。');
      }
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        };

        setLocation(nextLocation);

        if (shouldNotify) {
          showLocationMessage(`当前位置已更新：${formatCoordinates(nextLocation.lat, nextLocation.lon)}`);
        }
      },
      (error) => {
        console.warn('Geolocation error:', error);

        if (shouldNotify) {
          showLocationMessage('无法更新位置，请检查定位权限。');
        }
      }
    );
  };

  useEffect(() => {
    const initStatusBar = async () => {
      // 只在原生平台执行，网页端跳过
      if (Capacitor.isNativePlatform()) {
        await StatusBar.setStyle({ style: Style.Light }); // 状态栏图标深色
        await StatusBar.setBackgroundColor({ color: '#ffffff' }); // 背景白色
      }
    };

    initStatusBar();
  }, []);

  useEffect(() => {
    setHistoryRecords(loadHistoryRecords());
  }, []);

  useEffect(() => {
    updateCurrentLocation(false);
  }, []);

  useEffect(() => {
    if (state === 'experiment-config') {
      refreshLocalModelStatus();
    }
  }, [state]);

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
        const isHealthy = await checkServerHealth(apiBaseUrl);

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
  }, [apiBaseUrl]);

  useEffect(() => {
    return () => {
      cleanupRecordingResources();
      cancelAnalyzeRequest();
      revokeAudioUrl(audioUrlRef.current);
      if (locationMessageTimerRef.current) {
        clearTimeout(locationMessageTimerRef.current);
      }
    };
  }, []);

  const getBirdInfo = (species: string | null | undefined) => (species ? BIRD_DATASET[species] || DEFAULT_BIRD : DEFAULT_BIRD);

  const getDetectionDisplayInfo = (detection?: BirdDetection | null): BirdDisplayInfo => {
    if (!detection) {
      return {
        name: DEFAULT_BIRD.nameCn,
        scientificName: DEFAULT_BIRD.scientificName,
        description: DEFAULT_BIRD.description,
        image: DEFAULT_BIRD.image,
      };
    }

    const fallback = getBirdInfo(detection.species);

    return {
      name: detection.common_name_zh || detection.common_name || fallback.nameCn,
      scientificName: detection.scientific_name || fallback.scientificName,
      description: detection.description || fallback.description,
      image: detection.image_url || fallback.image,
    };
  };

  const getResultMessage = (responseMessage?: string | null) => {
    if (responseMessage?.trim()) {
      return responseMessage;
    }

    return '服务端已完成分析，但没有返回可展示的鸟类结果。';
  };

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
    setAudioFileName('preview.mp3');

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const persistHistoryRecord = (nextDetections: BirdDetection[], details: AnalysisDetails) => {
    const record = saveHistoryRecord({
      lat: details.lat,
      lon: details.lon,
      analysisDurationMs: details.analysisDurationMs,
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
    setAnalysisDetails(null);
    setIsSettingsOpen(false);
  };

  const openHistoryPage = () => {
    cleanupRecordingResources();
    cancelAnalyzeRequest();
    clearAudio();
    setDetections([]);
    setErrorMessage(null);
    setRecordingTime(0);
    setAnalysisDetails(null);
    setHistoryRecords(loadHistoryRecords());
    setIsSettingsOpen(false);
    setState('history');
  };

  const openHistoryRecord = (record: HistoryRecord) => {
    cleanupRecordingResources();
    cancelAnalyzeRequest();
    clearAudio();
    setDetections(record.detections);
    setAnalysisDetails({
      lat: record.lat,
      lon: record.lon,
      analysisDurationMs: record.analysisDurationMs,
      createdAt: record.createdAt,
    });
    setErrorMessage(record.detections.length === 0 ? '这条历史记录没有可展示的识别结果。' : null);
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
        setAudioFileName('recording.mp3');
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

  const handleUploadAudio = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const isAudioFile =
      file.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(file.name);

    if (!isAudioFile) {
      clearAudio();
      setErrorMessage('请选择 MP3、WAV、M4A 等音频文件。');
      setState('error');
      return;
    }

    resetApp();
    const nextAudioUrl = URL.createObjectURL(file);
    audioUrlRef.current = nextAudioUrl;
    setAudioUrl(nextAudioUrl);
    setAudioFileName(file.name);
    await handleAnalyze(file);
  };

  const handleAnalyze = async (blob: Blob) => {
    const runId = analysisRunIdRef.current + 1;
    analysisRunIdRef.current = runId;
    const startedAt = Date.now();
    const analysisLocation = {
      lat: location.lat,
      lon: location.lon,
    };

    const controller = new AbortController();
    analysisAbortControllerRef.current = controller;

    setErrorMessage(null);
    setAnalysisDetails(null);
    setState('analyzing');

    try {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      if (analysisRunIdRef.current !== runId) {
        return;
      }

      const response = await analyzeBirdSound(blob, analysisLocation.lat, analysisLocation.lon, controller.signal, apiBaseUrl);
      if (analysisRunIdRef.current !== runId) {
        return;
      }

      const nextAnalysisDetails: AnalysisDetails = {
        ...analysisLocation,
        analysisDurationMs: Date.now() - startedAt,
      };

      setDetections(response.detections);
      setErrorMessage(response.detections.length === 0 ? getResultMessage(response.message) : null);
      setAnalysisDetails(nextAnalysisDetails);
      persistHistoryRecord(response.detections, nextAnalysisDetails);
      setState('result');
    } catch (err) {
      if (analysisRunIdRef.current !== runId || controller.signal.aborted) {
        return;
      }

      console.error('Analysis failed:', err);
      setDetections([]);
      setAnalysisDetails(null);
      setErrorMessage(err instanceof Error ? err.message : '识别失败，请检查网络或后端服务。');
      setState('error');
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
    setAnalysisDetails(null);
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

  const formatCoordinates = (lat: number, lon: number) => `${lat.toFixed(4)}N ${lon.toFixed(4)}E`;

  const healthStatusLabel = healthStatus === 'healthy' ? '服务正常' : '服务异常';

  const openSettings = () => {
    setLocationMessage(null);
    setIsSettingsOpen((prev) => !prev);
  };

  const openServiceConfig = () => {
    setDraftApiHost(apiHost);
    setDraftApiPort(apiPort);
    setConnectionTestStatus('idle');
    setIsSettingsOpen(false);
    setState('service-config');
  };

  const openExperimentConfig = () => {
    setIsSettingsOpen(false);
    setState('experiment-config');
  };

  const refreshLocalModelStatus = async () => {
    try {
      const status = await getLocalModelStatus();
      setLocalModelStatus(status);
      setLocalModelMessage(status.nativeReady ? null : status.nativeStatus || 'Android 插件已连接；native 推理库还未接入 llama.cpp / whisper.cpp。');
    } catch (error) {
      setLocalModelStatus(null);
      setLocalModelMessage(error instanceof Error ? error.message : '无法读取端侧模型状态。');
    }
  };

  const handleImportLocalModel = async (modelId: LocalModelId) => {
    const spec = LOCAL_MODEL_SPECS.find((item) => item.id === modelId);
    setLocalModelBusy(`import-${modelId}`);
    setLocalModelMessage(`请选择 ${spec?.fileName ?? '模型文件'}。`);

    try {
      await pickAndImportLocalModel(modelId);
      await refreshLocalModelStatus();
      setLocalModelMessage(`${spec?.fileName ?? '模型'} 已导入到 App 私有目录。`);
    } catch (error) {
      setLocalModelMessage(error instanceof Error ? error.message : '模型导入失败。');
    } finally {
      setLocalModelBusy(null);
    }
  };

  const handlePickAndTranscribe = async () => {
    setLocalModelBusy('transcribe');
    setLocalModelMessage(localTranscribePreprocessEnabled ? '请选择要转写的音频文件；将先经过 Android 预处理。' : '请选择要转写的音频文件；将直接交给 native whisper。');

    try {
      const result = await pickAndTranscribeAudio('zh', localTranscribePreprocessEnabled);
      setLocalTranscript(result.text);
      setLocalPrompt((prev) => prev || result.text);
      setLocalModelMessage(localTranscribePreprocessEnabled ? '语音转文字完成（已使用 Android 预处理）。' : '语音转文字完成（已直接交给 native whisper）。');
    } catch (error) {
      setLocalModelMessage(error instanceof Error ? error.message : '语音转文字失败。');
    } finally {
      setLocalModelBusy(null);
    }
  };

  const handleLocalChat = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const prompt = localPrompt.trim();
    if (!prompt) {
      setLocalModelMessage('请输入要发送给端侧大模型的内容。');
      return;
    }

    setLocalModelBusy('chat');
    setLocalChatResponse('');
    setLocalModelMessage('正在调用端侧大模型。');

    try {
      const result = await runLocalModelChat(localChatModelId, prompt);
      setLocalChatResponse(result.text);
      setLocalModelMessage('端侧对话完成。');
    } catch (error) {
      setLocalModelMessage(error instanceof Error ? error.message : '端侧对话失败。');
    } finally {
      setLocalModelBusy(null);
    }
  };

  const handleResetLocalSession = async () => {
    setLocalModelBusy('reset-chat');

    try {
      await resetLocalModelSession(localChatModelId);
      setLocalChatResponse('');
      setLocalModelMessage('端侧会话已重置。');
    } catch (error) {
      setLocalModelMessage(error instanceof Error ? error.message : '会话重置失败。');
    } finally {
      setLocalModelBusy(null);
    }
  };

  const applySettings = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextHost = draftApiHost.trim() || DEFAULT_API_HOST;
    const nextPort = draftApiPort.trim() || DEFAULT_API_PORT;

    localStorage.setItem(API_HOST_STORAGE_KEY, nextHost);
    localStorage.setItem(API_PORT_STORAGE_KEY, nextPort);
    setApiHost(nextHost);
    setApiPort(nextPort);
    setIsSettingsOpen(false);
    setState('idle');
    setHealthStatus('unhealthy');
    setConnectionTestStatus('idle');
  };

  const testConnection = async () => {
    const testHost = draftApiHost.trim() || DEFAULT_API_HOST;
    const testPort = draftApiPort.trim() || DEFAULT_API_PORT;
    const testApiBaseUrl = buildApiBaseUrl(testHost, testPort);

    setConnectionTestStatus('checking');

    const isHealthy = await checkServerHealth(testApiBaseUrl);

    setHealthStatus(isHealthy ? 'healthy' : 'unhealthy');
    setConnectionTestStatus(isHealthy ? 'available' : 'unavailable');
  };

  const formatDuration = (durationMs: number) => {
    if (durationMs < 1000) {
      return `${durationMs} ms`;
    }

    return `${(durationMs / 1000).toFixed(durationMs >= 10000 ? 0 : 1)} s`;
  };

  const renderAnalysisDetails = (compact = false) => {
    if (!analysisDetails) {
      return null;
    }

    return (
      <div className={`rounded-3xl border border-white/40 bg-white/60 ${compact ? 'p-4' : 'glass-card p-5'}`}>
        <div className={`grid gap-3 ${compact ? 'grid-cols-1' : 'grid-cols-2'}`}>
          <div className="rounded-2xl bg-white/75 p-3">
            <div className="mb-1 flex items-center gap-2 text-[11px] text-secondary-text">
              <MapPin className="h-3.5 w-3.5" />
              分析位置
            </div>
            <div className={`${compact ? 'text-xs' : 'text-sm'} font-semibold text-primary-text break-all`}>
              {formatCoordinates(analysisDetails.lat, analysisDetails.lon)}
            </div>
          </div>
          <div className="rounded-2xl bg-white/75 p-3">
            <div className="mb-1 flex items-center gap-2 text-[11px] text-secondary-text">
              <Clock3 className="h-3.5 w-3.5" />
              分析耗时
            </div>
            <div className={`${compact ? 'text-xs' : 'text-sm'} font-semibold text-primary-text`}>
              {formatDuration(analysisDetails.analysisDurationMs)}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const historySummary = {
    count: historyRecords.length,
    latestBird:
      historyRecords[0]?.detections[0] ? getDetectionDisplayInfo(historyRecords[0].detections[0]).name : '暂无',
  };

  const renderResultList = (compact = false) => {
    if (detections.length === 0) {
      return (
        <div className={`glass-card rounded-3xl text-sm text-secondary-text ${compact ? 'p-5' : 'p-6'}`}>
          {errorMessage || '当前没有可展示的识别结果。'}
        </div>
      );
    }

    return (
      <div className={`w-full max-w-full min-w-0 ${compact ? 'space-y-3' : 'space-y-4'} sm:space-y-4`}>
        {detections.map((det, idx) => {
          const info = getDetectionDisplayInfo(det);

          return (
            <motion.div
              key={`${det.species}-${idx}`}
              initial={{ opacity: 0, x: compact ? 0 : -20, y: compact ? 12 : 0 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              transition={{ delay: idx * 0.1 }}
               className={`glass-card rounded-3xl flex w-full max-w-full min-w-0 ${compact ? 'gap-3 p-4' : 'gap-4 p-6'} sm:gap-4 sm:p-5 md:p-6 ${idx > 0 ? 'opacity-80' : ''}`}
            >
               <div className={`${compact ? 'w-16 h-16' : 'w-20 h-20'} sm:w-[4.5rem] sm:h-[4.5rem] md:w-20 md:h-20 bg-white rounded-2xl flex items-center justify-center text-3xl shadow-sm overflow-hidden shrink-0`}>
                <img src={info.image} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              </div>
              <div className="flex-1 min-w-0">
                 <div className={`${compact ? 'text-base' : 'text-xl'} sm:text-lg md:text-xl font-bold text-primary-text truncate`}>{info.name}</div>
                 <div className={`${compact ? 'text-[10px] mb-2' : 'text-xs mb-3'} sm:text-xs sm:mb-3 italic text-secondary-text truncate`}>{info.scientificName}</div>
                 <div className={`flex min-w-0 items-center ${compact ? 'gap-2' : 'gap-3'} sm:gap-3`}>
                   <div className={`min-w-0 flex-1 bg-black/5 rounded-full overflow-hidden ${compact ? 'h-1' : 'h-1.5'} sm:h-1.5`}>
                    <div
                      className="h-full bg-accent-green transition-all duration-1000"
                      style={{ width: `${det.confidence * 100}%` }}
                    />
                  </div>
                   <div className={`${compact ? 'text-[10px] w-9' : 'text-xs w-10'} sm:text-xs sm:w-10 font-bold text-accent-green text-right`}>
                    {Math.round(det.confidence * 100)}%
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    );
  };

  const renderHistoryList = (compact = false) => {
    if (historyRecords.length === 0) {
      return (
        <div
          className={`rounded-3xl border border-white/40 text-sm text-secondary-text ${
            compact ? 'bg-white/55 p-5' : 'glass-card p-6'
          }`}
        >
          当前没有可查看的历史结果。
        </div>
      );
    }

    return (
      <div className={`w-full max-w-full ${compact ? 'space-y-3' : 'space-y-4'} sm:space-y-4`}>
        {historyRecords.map((record) => {
          const topDetection = record.detections[0];
          const info = getDetectionDisplayInfo(topDetection);

          return (
            <button
              key={record.id}
              onClick={() => openHistoryRecord(record)}
                className={`w-full max-w-full rounded-3xl border border-white/40 text-left transition-transform ${
                  compact ? 'bg-white/55 p-4' : 'glass-card p-5 hover:-translate-y-0.5'
                } sm:p-5 min-h-[44px]`}
            >
               <div className={`flex ${compact ? 'items-center gap-3' : 'items-start gap-4'} sm:items-start sm:gap-4`}>
                <div className={`${compact ? 'w-14 h-14' : 'w-20 h-20'} sm:w-[4.5rem] sm:h-[4.5rem] md:w-20 md:h-20 rounded-2xl overflow-hidden shrink-0 shadow-sm bg-white`}>
                  <img src={info.image} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
                <div className="flex-1 min-w-0">
                  {compact ? (
                     <>
                       <div className="text-sm font-bold text-primary-text truncate sm:text-base">{info.name}</div>
                       <div className="text-[10px] text-secondary-text truncate sm:text-xs">{formatHistoryDate(record.createdAt)}</div>
                       <div className="text-[10px] text-accent-green mt-1 sm:text-xs">
                         {topDetection ? Math.round(topDetection.confidence * 100) : 0}% 置信度
                       </div>
                       <div className="text-[10px] text-secondary-text truncate sm:text-xs">
                         {formatCoordinates(record.lat, record.lon)} · {formatDuration(record.analysisDurationMs)}
                       </div>
                     </>
                   ) : (
                     <>
                       <div className="flex items-center justify-between gap-3 mb-2">
                         <div className="text-lg font-bold text-primary-text truncate sm:text-xl">{info.name}</div>
                         <div className="text-[11px] text-secondary-text whitespace-nowrap sm:text-xs">
                           {formatHistoryDate(record.createdAt)}
                         </div>
                       </div>
                       <div className="text-xs italic text-secondary-text truncate mb-3 sm:text-sm">
                         {topDetection?.scientific_name || '暂无识别结果'}
                       </div>
                       <div className="flex flex-wrap items-center gap-2 text-[11px] text-secondary-text sm:text-xs">
                         <span className="rounded-full bg-white/70 px-2.5 py-1 sm:px-3 sm:py-1.5">
                           最高置信度 {topDetection ? Math.round(topDetection.confidence * 100) : 0}%
                         </span>
                         <span className="rounded-full bg-white/70 px-2.5 py-1 sm:px-3 sm:py-1.5">
                           共 {record.detections.length} 项结果
                         </span>
                         <span className="rounded-full bg-white/70 px-2.5 py-1 sm:px-3 sm:py-1.5">
                           {formatCoordinates(record.lat, record.lon)}
                         </span>
                         <span className="rounded-full bg-white/70 px-2.5 py-1 sm:px-3 sm:py-1.5">
                           {formatDuration(record.analysisDurationMs)}
                         </span>
                       </div>
                     </>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  const getLocalModel = (modelId: LocalModelId) => localModelStatus?.models.find((model) => model.id === modelId);
  const importedModelCount = localModelStatus?.models.filter((model) => model.imported).length ?? 0;
  const nativeStatusLabel = localModelStatus?.nativeReady ? 'Native 已就绪' : '等待 native 接入';
  const isLocalModelActionBusy = (key: string) => localModelBusy === key;
  const formatFileSize = (sizeBytes?: number) => {
    if (!sizeBytes) {
      return '未导入';
    }

    if (sizeBytes >= 1024 * 1024 * 1024) {
      return `${(sizeBytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
    }

    return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const renderExperimentPanel = (compact = false) => (
    <div className={`app-scroll-region min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto pr-0.5 ${compact ? 'space-y-3' : 'space-y-4'}`}>
      <div className={`min-w-0 rounded-3xl border border-white/40 bg-white/60 ${compact ? 'p-4' : 'p-5'}`}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-primary-text">
            <FlaskConical className="h-4 w-4 text-accent-green" />
            端侧模型
          </div>
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${localModelStatus?.nativeReady ? 'bg-accent-green/10 text-accent-green' : 'bg-yellow-50 text-yellow-700'}`}>
            {nativeStatusLabel}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-white/75 p-3">
            <div className="text-[10px] text-secondary-text">模型目录</div>
            <div className="mt-1 break-all text-[11px] font-semibold text-primary-text">
              {localModelStatus?.modelDirectory ?? '仅 Android App 可用'}
            </div>
          </div>
          <div className="rounded-2xl bg-white/75 p-3">
            <div className="text-[10px] text-secondary-text">已导入</div>
            <div className="mt-1 text-xl font-bold text-primary-text">{importedModelCount}/3</div>
          </div>
        </div>
        {localModelMessage && (
          <div className="mt-3 rounded-2xl bg-accent-green/10 px-3 py-2 text-xs font-semibold text-accent-green" role="status">
            {localModelMessage}
          </div>
        )}
      </div>

      <div className={`min-w-0 rounded-3xl border border-white/40 bg-white/60 ${compact ? 'p-4' : 'p-5'}`}>
        <div className="mb-3 text-xs font-bold text-primary-text">导入本地模型文件</div>
        <div className="space-y-2">
          {LOCAL_MODEL_SPECS.map((spec) => {
            const status = getLocalModel(spec.id);
            const busyKey = `import-${spec.id}`;
            const isBusy = isLocalModelActionBusy(busyKey);

            return (
              <button
                key={spec.id}
                type="button"
                onClick={() => handleImportLocalModel(spec.id)}
                disabled={localModelBusy !== null}
                className="flex min-h-16 w-full items-center gap-3 rounded-2xl bg-white/75 p-3 text-left transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/5 text-accent-green">
                  {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold text-primary-text">{spec.label}</span>
                  <span className="mt-0.5 block truncate text-[11px] font-medium text-secondary-text">{spec.fileName}</span>
                  <span className="mt-0.5 block text-[10px] text-secondary-text">{status?.imported ? formatFileSize(status.sizeBytes) : spec.role}</span>
                </span>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${status?.imported ? 'bg-accent-green/10 text-accent-green' : 'bg-black/5 text-secondary-text'}`}>
                  {status?.imported ? '已导入' : '选择'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className={`min-w-0 rounded-3xl border border-white/40 bg-white/60 ${compact ? 'p-4' : 'p-5'}`}>
        <div className="mb-3 flex items-center gap-2 text-xs font-bold text-primary-text">
          <FileAudio className="h-4 w-4 text-accent-green" />
          语音转文字
        </div>
        <label className="mb-3 flex cursor-pointer items-start gap-3 rounded-2xl bg-white/75 p-3">
          <input
            type="checkbox"
            checked={localTranscribePreprocessEnabled}
            onChange={(event) => setLocalTranscribePreprocessEnabled(event.target.checked)}
            disabled={localModelBusy !== null}
            className="mt-0.5 h-4 w-4 rounded border-glass-border text-accent-green focus:ring-accent-green disabled:cursor-not-allowed"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-bold text-primary-text">先用 Android 预处理音频</span>
            <span className="mt-1 block text-[11px] font-medium text-secondary-text">
              开启后会先用 `MediaExtractor / MediaCodec` 解码并统一写成 mono WAV，更适合 `m4a` / `aac`。关闭后会把原音频直接交给 native whisper，失败错误也会直接返回。
            </span>
          </span>
          <span className={`mt-0.5 shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${localTranscribePreprocessEnabled ? 'bg-accent-green/10 text-accent-green' : 'bg-black/5 text-secondary-text'}`}>
            {localTranscribePreprocessEnabled ? '已开启' : '已关闭'}
          </span>
        </label>
        <button
          type="button"
          onClick={handlePickAndTranscribe}
          disabled={localModelBusy !== null}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-accent-green py-3.5 text-sm font-bold text-white shadow-lg shadow-accent-green/20 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isLocalModelActionBusy('transcribe') ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          选择音频并转写
        </button>
        <textarea
          value={localTranscript}
          onChange={(event) => setLocalTranscript(event.target.value)}
          className={`${compact ? 'min-h-24' : 'min-h-28'} w-full resize-none rounded-2xl border border-glass-border bg-white px-3.5 py-3 text-sm font-medium text-primary-text outline-none focus:border-accent-green`}
          placeholder="转写文本会显示在这里，也可以手动编辑后发送给对话模型。"
        />
      </div>

      <form onSubmit={handleLocalChat} className={`min-w-0 rounded-3xl border border-white/40 bg-white/60 ${compact ? 'p-4' : 'p-5'}`}>
        <div className="mb-3 flex items-center gap-2 text-xs font-bold text-primary-text">
          <Bot className="h-4 w-4 text-accent-green" />
          大模型对话
        </div>
        <div className="mb-3 grid grid-cols-2 gap-2">
          {(['qwen2Chat', 'qwen3Vision'] as const).map((modelId) => (
            <button
              key={modelId}
              type="button"
              onClick={() => setLocalChatModelId(modelId)}
              className={`rounded-2xl px-3 py-2.5 text-xs font-bold transition-colors ${
                localChatModelId === modelId ? 'bg-accent-green text-white' : 'bg-white/75 text-secondary-text'
              }`}
            >
              {modelId === 'qwen2Chat' ? 'Qwen2 0.5B' : 'Qwen3VL 2B'}
            </button>
          ))}
        </div>
        <textarea
          value={localPrompt}
          onChange={(event) => setLocalPrompt(event.target.value)}
          className={`${compact ? 'min-h-28' : 'min-h-32'} mb-3 w-full resize-none rounded-2xl border border-glass-border bg-white px-3.5 py-3 text-sm font-medium text-primary-text outline-none focus:border-accent-green`}
          placeholder="输入问题，或使用上面的语音转文字结果作为提示词。"
        />
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <button
            type="submit"
            disabled={localModelBusy !== null}
            className="flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-accent-green px-4 text-sm font-bold text-white shadow-lg shadow-accent-green/20 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isLocalModelActionBusy('chat') ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
            发送
          </button>
          <button
            type="button"
            onClick={handleResetLocalSession}
            disabled={localModelBusy !== null}
            className="flex min-h-11 items-center justify-center rounded-2xl border border-glass-border bg-white px-4 text-sm font-bold text-secondary-text disabled:cursor-not-allowed disabled:opacity-70"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
        {localChatResponse && (
          <div className="mt-3 rounded-2xl bg-white/75 p-3">
            <div className="mb-1 text-[10px] text-secondary-text">模型回复</div>
            <div className="whitespace-pre-wrap break-words text-sm font-medium text-primary-text">{localChatResponse}</div>
          </div>
        )}
      </form>
    </div>
  );

  return (
    <div className="min-h-screen w-full overflow-x-hidden flex flex-col items-center justify-start p-3 sm:p-4 md:justify-center md:p-8">
      <div className="w-full max-w-5xl min-w-0 flex flex-col lg:flex-row gap-4 sm:gap-6 lg:gap-8 items-start lg:items-stretch justify-center">
        <div className="hidden min-w-0 flex-col gap-6 flex-1 max-w-lg lg:flex lg:max-h-[min(640px,calc(100dvh-4rem))] lg:min-h-0 lg:self-stretch">
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

            {(state === 'service-config' || state === 'experiment-config') && (
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
            ) : state === 'service-config' ? (
              <>
                <h2 className="text-4xl font-bold text-accent-green mb-4 leading-tight">服务配置</h2>
                <p className="text-secondary-text leading-relaxed">
                  管理识别后端的 IP、端口与连接状态。保存后，后续录音和上传分析会使用新的服务地址。
                </p>
                <div className="flex gap-3 mt-6">
                  <span className="px-4 py-2 bg-white rounded-xl text-xs font-semibold border border-glass-border shadow-sm">
                    {apiHost}:{apiPort}
                  </span>
                  <span className="px-4 py-2 bg-white rounded-xl text-xs font-semibold border border-glass-border shadow-sm">
                    {healthStatusLabel}
                  </span>
                </div>
              </>
            ) : state === 'experiment-config' ? (
              <>
                <h2 className="text-4xl font-bold text-accent-green mb-4 leading-tight">实验</h2>
                <p className="text-secondary-text leading-relaxed">
                  导入手机文件中的 GGUF / Whisper 模型，在 App 私有目录内完成语音转文字和端侧对话实验。
                </p>
                <div className="flex gap-3 mt-6">
                  <span className="px-4 py-2 bg-white rounded-xl text-xs font-semibold border border-glass-border shadow-sm">
                    {importedModelCount}/3 模型
                  </span>
                  <span className="px-4 py-2 bg-white rounded-xl text-xs font-semibold border border-glass-border shadow-sm">
                    {nativeStatusLabel}
                  </span>
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
            <div className="history-scroll glass-panel flex min-h-0 flex-1 flex-col overflow-y-auto rounded-[32px] p-5 pr-3">
              <div className="shrink-0 rounded-3xl bg-white/60 border border-white/40 p-5 mb-4">
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

              <div className="pb-3">
                {renderHistoryList()}
              </div>
            </div>
          )}

          {state === 'result' && (
            <div className="space-y-4">
              {renderAnalysisDetails()}
              {renderResultList()}
            </div>
          )}

          {state === 'experiment-config' && (
            <div className="history-scroll glass-panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[32px] p-5 pr-3">
              {renderExperimentPanel()}
            </div>
          )}
        </div>

        <div
          className={`app-shell app-view glass-panel relative flex w-full max-w-full min-w-0 shrink-0 flex-col overflow-hidden rounded-[28px] px-4 py-4 shadow-2xl sm:max-w-[420px] sm:rounded-[34px] sm:p-6 lg:max-w-[360px] lg:rounded-[40px] lg:px-8 lg:py-8 ${
            state === 'result' ? 'lg:hidden' : ''
          }`}
        >
          <div className="relative z-20 mb-6 flex items-center justify-between gap-3 sm:mb-8 lg:mb-10">
            <div className="text-xl font-bold tracking-wider text-accent-green sm:text-2xl">听鸟</div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={openSettings}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-glass-border bg-white/75 text-secondary-text shadow-sm transition-transform hover:scale-105"
                title={healthStatusLabel}
                aria-label={`设置，${healthStatusLabel}`}
                aria-expanded={isSettingsOpen}
              >
                <Settings className="h-4 w-4" />
                <span
                  className={`absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full border border-white shadow-sm ${
                    healthStatus === 'healthy' ? 'bg-emerald-500' : 'bg-red-500'
                  }`}
                />
              </button>

              {isSettingsOpen && (
                <div
                  className="absolute inset-x-0 top-12 z-30 rounded-[28px] border border-glass-border bg-white/95 p-4 text-left shadow-2xl sm:inset-x-auto sm:right-0 sm:w-[19rem] sm:rounded-3xl"
                >
                  <div className="mb-3 flex items-center justify-between gap-3 px-1">
                    <div className="text-sm font-bold text-primary-text">设置</div>
                    <div className="flex items-center justify-end gap-1.5 text-[10px] font-medium text-secondary-text">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          healthStatus === 'healthy' ? 'bg-emerald-500' : 'bg-red-500'
                        }`}
                      />
                      {healthStatusLabel}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => updateCurrentLocation()}
                      className="flex w-full items-center gap-3 rounded-2xl bg-black/5 p-3 text-left transition-colors hover:bg-black/10"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-accent-green shadow-sm">
                        <MapPin className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-bold text-primary-text">当前位置</span>
                        <span className="mt-0.5 block break-all text-[11px] font-medium text-secondary-text">
                          {formatCoordinates(location.lat, location.lon)}
                        </span>
                      </span>
                      <RefreshCw className="h-3.5 w-3.5 shrink-0 text-secondary-text" />
                    </button>

                    <button
                      type="button"
                      onClick={openServiceConfig}
                      className="flex w-full items-center gap-3 rounded-2xl bg-white/80 p-3 text-left transition-colors hover:bg-black/5"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/5 text-primary-text">
                        <Server className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-bold text-primary-text">服务配置</span>
                        <span className="mt-0.5 block truncate text-[11px] font-medium text-secondary-text">
                          {apiHost}:{apiPort}
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-secondary-text" />
                    </button>

                    <button
                      type="button"
                      onClick={openExperimentConfig}
                      className="flex w-full items-center gap-3 rounded-2xl bg-white/80 p-3 text-left transition-colors hover:bg-black/5"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/5 text-primary-text">
                        <FlaskConical className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-bold text-primary-text">实验</span>
                        <span className="mt-0.5 block text-[11px] font-medium text-secondary-text">端侧模型调用</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-secondary-text" />
                    </button>
                  </div>

                  {locationMessage && (
                    <div className="mt-3 rounded-2xl bg-accent-green/10 px-3 py-2 text-xs font-semibold text-accent-green" role="status">
                      {locationMessage}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="z-10 flex min-h-0 flex-1 flex-col">
            <AnimatePresence mode="wait">
              {state === 'idle' && (
                <motion.div
                  key="idle"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 flex flex-col items-center justify-center gap-6 py-2 text-center sm:gap-8"
                >
                  <div className="w-full max-w-xs text-center sm:max-w-sm">
                    <div className="mx-auto mb-4 flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-3xl bg-white/50 shadow-sm sm:mb-6 sm:h-20 sm:w-20">
                      <Bird className="h-9 w-9 text-accent-green sm:h-10 sm:w-10" />
                    </div>
                    <h2 className="mb-2 text-lg font-bold text-primary-text sm:text-xl">准备开始识别了吗？</h2>
                    <p className="px-2 text-xs leading-relaxed text-secondary-text sm:px-6">点击开始，记录周围环境中的鸟鸣声</p>
                  </div>

                  <div className="flex w-full flex-col items-center gap-3 sm:gap-4">
                    <button
                      onClick={startRecording}
                      className="group flex h-[5.5rem] w-[5.5rem] items-center justify-center rounded-full border-[8px] border-accent-green/20 bg-white shadow-lg transition-transform hover:scale-105 sm:h-24 sm:w-24"
                    >
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-green transition-transform group-active:scale-95 sm:h-12 sm:w-12">
                        <Mic className="h-5 w-5 text-white sm:h-6 sm:w-6" />
                      </div>
                    </button>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac"
                      className="hidden"
                      onChange={handleUploadAudio}
                    />

                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-glass-border bg-white/75 px-4 py-2.5 text-xs font-medium text-secondary-text"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      上传音频文件
                    </button>
                  </div>

                  <button
                    onClick={openHistoryPage}
                    className="mt-2 flex min-h-11 items-center gap-2 rounded-full border border-glass-border bg-white/55 px-4 py-2.5 text-xs text-secondary-text sm:mt-4"
                  >
                    <HistoryIcon className="w-3.5 h-3.5" />
                    查看历史记录
                  </button>
                </motion.div>
              )}

              {state === 'service-config' && (
                <motion.form
                  key="service-config"
                  onSubmit={applySettings}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  className="app-scroll-region flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto pr-0.5"
                >
                  <div className="mb-5 flex items-center gap-2">
                    <button type="button" onClick={resetApp} className="rounded-lg bg-black/5 p-2 text-secondary-text">
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <span className="text-sm font-bold text-primary-text">服务配置</span>
                  </div>

                  <div className="mb-4 rounded-3xl border border-white/40 bg-white/60 p-4">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-primary-text">
                        <Server className="h-4 w-4 text-accent-green" />
                        后端服务
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] font-medium text-secondary-text">
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${
                            healthStatus === 'healthy' ? 'bg-emerald-500' : 'bg-red-500'
                          }`}
                        />
                        {healthStatusLabel}
                      </div>
                    </div>
                    <div className="break-all text-[11px] font-medium text-secondary-text">{apiBaseUrl}</div>
                  </div>

                  <label className="mb-3 block">
                    <span className="mb-1.5 block text-[10px] font-medium text-secondary-text">IP 地址</span>
                    <input
                      value={draftApiHost}
                      onChange={(event) => {
                        setDraftApiHost(event.target.value);
                        setConnectionTestStatus('idle');
                      }}
                      className="h-11 w-full rounded-2xl border border-glass-border bg-white px-3.5 text-sm font-medium text-primary-text outline-none focus:border-accent-green"
                      placeholder={DEFAULT_API_HOST}
                    />
                  </label>

                  <label className="mb-5 block">
                    <span className="mb-1.5 block text-[10px] font-medium text-secondary-text">端口</span>
                    <input
                      value={draftApiPort}
                      onChange={(event) => {
                        setDraftApiPort(event.target.value);
                        setConnectionTestStatus('idle');
                      }}
                      className="h-11 w-full rounded-2xl border border-glass-border bg-white px-3.5 text-sm font-medium text-primary-text outline-none focus:border-accent-green"
                      inputMode="numeric"
                      placeholder={DEFAULT_API_PORT}
                    />
                  </label>

                  <button
                    type="button"
                    onClick={testConnection}
                    disabled={connectionTestStatus === 'checking'}
                    className="mb-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-glass-border bg-white py-3.5 text-sm font-bold text-primary-text shadow-sm transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${connectionTestStatus === 'checking' ? 'animate-spin' : ''}`} />
                    {connectionTestStatus === 'checking' ? '测试中' : '连接测试'}
                  </button>

                  {connectionTestStatus !== 'idle' && connectionTestStatus !== 'checking' && (
                    <div
                      className={`mb-3 rounded-2xl px-3 py-2 text-center text-xs font-bold ${
                        connectionTestStatus === 'available'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-red-50 text-red-700'
                      }`}
                      role="status"
                    >
                      {connectionTestStatus === 'available' ? '服务可用' : '服务不可用'}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="mt-auto flex w-full items-center justify-center gap-2 rounded-2xl bg-accent-green py-3.5 text-sm font-bold text-white shadow-lg shadow-accent-green/20"
                  >
                    <Check className="h-3.5 w-3.5" />
                    确定
                  </button>
                </motion.form>
              )}

              {state === 'experiment-config' && (
                <motion.div
                  key="experiment-config"
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                >
                  <div className="mb-5 flex items-center gap-2">
                    <button type="button" onClick={resetApp} className="rounded-lg bg-black/5 p-2 text-secondary-text">
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <span className="text-sm font-bold text-primary-text">实验</span>
                  </div>
                  {renderExperimentPanel(true)}
                </motion.div>
              )}

              {state === 'history' && (
                <motion.div
                  key="history"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="history-scroll history-mobile-shell app-scroll-region flex min-h-0 flex-1 flex-col overflow-y-auto pr-0.5"
                >
                  <div className="shrink-0">
                  <div className="mb-4 flex items-center gap-2 sm:mb-6">
                    <button onClick={resetApp} className="rounded-lg bg-black/5 p-2 text-secondary-text">
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <span className="text-sm font-bold text-primary-text">历史记录</span>
                  </div>

                  <div className="mb-4 rounded-3xl border border-white/40 bg-white/60 p-4 sm:p-5">
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
                  </div>

                  <div className="pb-3">{renderHistoryList(true)}</div>

                  <div className="history-footer-mobile shrink-0 border-t border-black/5 pt-4 mt-2 space-y-3">
                    <button
                      onClick={resetApp}
                      className="w-full rounded-2xl bg-accent-green py-3.5 font-bold text-white shadow-lg shadow-accent-green/20"
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
                  className="flex-1 flex flex-col items-center justify-center gap-8 py-2 sm:gap-10"
                >
                  <div className="w-full flex justify-start">
                    <button
                      onClick={cancelRecording}
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-black/5 px-3 py-2 text-xs font-medium text-secondary-text"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      取消
                    </button>
                  </div>

                  <div className="flex h-12 items-center gap-1 sm:h-14">
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
                      className="flex h-[5.5rem] w-[5.5rem] items-center justify-center rounded-full border-[8px] border-red-500/20 bg-white shadow-lg transition-transform hover:scale-105 sm:h-24 sm:w-24"
                    >
                      <div className="h-11 w-11 animate-pulse rounded-xl bg-red-500 sm:h-12 sm:w-12" />
                    </button>

                  <div className="flex flex-col items-center gap-2">
                    <div className="text-xl font-mono font-bold text-primary-text sm:text-2xl">{formatTime(recordingTime)}</div>
                    <div className="text-xs text-secondary-text">正在聆听周围环境...</div>
                  </div>
                </motion.div>
              )}

              {state === 'analyzing' && (
                <motion.div
                  key="analyzing"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex-1 flex flex-col items-center justify-center gap-7 py-2 sm:gap-10"
                >
                  <div className="w-full flex justify-start">
                    <button
                      onClick={cancelAnalyzing}
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-black/5 px-3 py-2 text-xs font-medium text-secondary-text"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      返回
                    </button>
                  </div>

                  <div className="relative">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
                      className="h-[6.5rem] w-[6.5rem] rounded-full border-4 border-accent-green/20 border-t-accent-green sm:h-32 sm:w-32"
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Bird className="h-8 w-8 animate-bounce text-accent-green sm:h-10 sm:w-10" />
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="text-lg font-bold text-primary-text mb-2">正在分析中</div>
                    <div className="break-all text-[11px] text-secondary-text tracking-[0.2em] uppercase">
                      Analyzing {audioFileName}
                    </div>
                  </div>
                </motion.div>
              )}

              {state === 'result' && (
                <motion.div
                  key="result-mobile"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex min-h-0 min-w-0 flex-1 flex-col"
                >
                  <div className="mb-4 flex items-center gap-2 sm:mb-5">
                    <button onClick={resetApp} className="rounded-lg bg-black/5 p-2 text-secondary-text">
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <span className="text-sm font-bold text-primary-text">识别结果</span>
                  </div>

                  <div className="app-scroll-region flex-1 min-h-0 min-w-0 overflow-y-auto pr-0.5 space-y-3 sm:space-y-4">
                    {renderAnalysisDetails(true)}
                    {detections.length > 0 && (
                      <div className="w-full min-w-0 rounded-3xl border border-white/40 bg-white/60 p-4 sm:p-5">
                      {(() => {
                        const topInfo = getDetectionDisplayInfo(detections[0]);

                        return (
                          <>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-secondary-text/70 mb-3">
                              Top Match
                            </div>
                            <div className="mb-4 flex min-w-0 gap-3 sm:gap-4">
                              <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-sm shrink-0">
                                <img src={topInfo.image} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="break-words font-bold text-primary-text">{topInfo.name}</div>
                                <div className="break-all text-[10px] italic text-secondary-text">{topInfo.scientificName}</div>
                                <div className="mt-2 text-xs font-bold text-accent-green">
                                  置信度 {Math.round(detections[0].confidence * 100)}%
                                </div>
                              </div>
                            </div>
                            <p className="text-[10px] text-secondary-text leading-relaxed line-clamp-3">
                              {topInfo.description}
                            </p>
                          </>
                        );
                      })()}
                      </div>
                    )}
                    {renderResultList(true)}
                  </div>

                  <div className="app-shell-footer mt-4 space-y-3 border-t border-black/5 pt-4">
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

          <div className="app-shell-footer mt-4 border-t border-black/5 pt-4 text-center sm:mt-6 sm:pt-6">
            <p className="text-[9px] text-secondary-text/60 tracking-widest uppercase font-bold">
              Smart AI Bird Observation Tool
            </p>
          </div>
        </div>

      </div>

      {state === 'error' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4 backdrop-blur-sm sm:p-6">
          <div className="glass-panel w-full max-w-sm rounded-[28px] p-5 text-center sm:rounded-[32px] sm:p-8">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500">
              <Info />
            </div>
            <h3 className="text-xl font-bold mb-2">识别出错了</h3>
            <p className="mb-6 break-words text-sm text-secondary-text">{errorMessage}</p>
            <button onClick={resetApp} className="w-full rounded-2xl bg-accent-green py-4 font-bold text-white shadow-lg">
              返回重试
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

