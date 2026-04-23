import { Capacitor, registerPlugin } from '@capacitor/core';

export type LocalModelId = 'qwen2Chat' | 'qwen3Vision' | 'whisperSmall';

export interface LocalModelSpec {
  id: LocalModelId;
  label: string;
  fileName: string;
  role: string;
}

export interface LocalModelStatus {
  id: LocalModelId;
  label: string;
  fileName: string;
  role: string;
  imported: boolean;
  path?: string;
  sizeBytes?: number;
}

export interface LocalModelPluginStatus {
  nativeReady: boolean;
  nativeStatus?: string;
  modelDirectory: string;
  models: LocalModelStatus[];
}

interface LocalModelPlugin {
  getStatus(): Promise<LocalModelPluginStatus>;
  pickAndImportModel(options: { modelId: LocalModelId }): Promise<LocalModelStatus>;
  pickAndTranscribeAudio(options?: { language?: string; preprocessAudio?: boolean }): Promise<{ text: string; audioPath: string }>;
  chat(options: { modelId: Extract<LocalModelId, 'qwen2Chat' | 'qwen3Vision'>; prompt: string }): Promise<{ text: string }>;
  resetSession(options: { modelId: Extract<LocalModelId, 'qwen2Chat' | 'qwen3Vision'> }): Promise<void>;
}

export const LOCAL_MODEL_SPECS: LocalModelSpec[] = [
  {
    id: 'whisperSmall',
    label: '语音转文字',
    fileName: 'ggml-small.bin',
    role: 'whisper.cpp',
  },
  {
    id: 'qwen2Chat',
    label: '文本对话',
    fileName: 'qwen2-0_5b-instruct-q8_0.gguf',
    role: 'llama.cpp',
  },
  {
    id: 'qwen3Vision',
    label: '视觉语言',
    fileName: 'Qwen3VL-2B-Instruct-Q4_K_M.gguf',
    role: 'llama.cpp / multimodal',
  },
];

const LocalModel = registerPlugin<LocalModelPlugin>('LocalModel');

function requireNativePlatform() {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('端侧模型实验需要在 Android App 中运行。');
  }
}

export async function getLocalModelStatus() {
  requireNativePlatform();
  return LocalModel.getStatus();
}

export async function pickAndImportLocalModel(modelId: LocalModelId) {
  requireNativePlatform();
  return LocalModel.pickAndImportModel({ modelId });
}

export async function pickAndTranscribeAudio(language = 'zh', preprocessAudio = true) {
  requireNativePlatform();
  return LocalModel.pickAndTranscribeAudio({ language, preprocessAudio });
}

export async function runLocalModelChat(modelId: Extract<LocalModelId, 'qwen2Chat' | 'qwen3Vision'>, prompt: string) {
  requireNativePlatform();
  return LocalModel.chat({ modelId, prompt });
}

export async function resetLocalModelSession(modelId: Extract<LocalModelId, 'qwen2Chat' | 'qwen3Vision'>) {
  requireNativePlatform();
  return LocalModel.resetSession({ modelId });
}
