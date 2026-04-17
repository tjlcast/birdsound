import axios from 'axios';
import { AnalyzeResponse } from '../types';

const API_BASE_URL = 'http://127.0.0.1:8000';

interface HealthResponse {
  status: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const responseData = error.response?.data;

    if (typeof responseData === 'string' && responseData.trim()) {
      return responseData;
    }

    if (isObject(responseData)) {
      const message = responseData.message;
      const detail = responseData.detail;
      const errorText = responseData.error;

      if (typeof message === 'string' && message.trim()) {
        return message;
      }

      if (typeof detail === 'string' && detail.trim()) {
        return detail;
      }

      if (typeof errorText === 'string' && errorText.trim()) {
        return errorText;
      }
    }

    if (error.message) {
      return error.message;
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

function normalizeAnalyzeResponse(data: unknown): AnalyzeResponse {
  if (!isObject(data)) {
    throw new Error('服务端返回的数据格式不正确');
  }

  const message = typeof data.message === 'string' ? data.message : '';
  const detections = Array.isArray(data.detections) ? data.detections : [];

  return {
    message,
    detections,
  };
}

export async function analyzeBirdSound(
  audioBlob: Blob,
  lat: number,
  lon: number,
  signal?: AbortSignal
): Promise<AnalyzeResponse> {
  const formData = new FormData();

  const audioFile =
    audioBlob instanceof File
      ? audioBlob
      : new File([audioBlob], 'recording.mp3', {
          type: audioBlob.type || 'audio/mpeg',
        });

  formData.append('audio', audioFile);
  formData.append('lat', lat.toString());
  formData.append('lon', lon.toString());

  try {
    const response = await axios.post(`${API_BASE_URL}/analyze`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      signal,
    });
    return normalizeAnalyzeResponse(response.data);
  } catch (error) {
    console.error('API Error:', error);
    throw new Error(getErrorMessage(error, '识别失败，请稍后重试'));
  }
}

export async function checkServerHealth(signal?: AbortSignal): Promise<boolean> {
  try {
    const response = await axios.get<HealthResponse>(`${API_BASE_URL}/health`, {
      signal,
    });

    return response.data.status === 'ok';
  } catch (error) {
    console.error('Health Check Error:', error);
    return false;
  }
}
