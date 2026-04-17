import axios from 'axios';
import { AnalyzeResponse } from '../types';

const API_BASE_URL = 'http://127.0.0.1:8000';

interface HealthResponse {
  status: string;
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
    const response = await axios.post<AnalyzeResponse>(`${API_BASE_URL}/analyze`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      signal,
    });
    return response.data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
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
