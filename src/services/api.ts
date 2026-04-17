import axios from 'axios';
import { AnalyzeResponse } from '../types';

const API_BASE_URL = 'http://127.0.0.1:8000';

export async function analyzeBirdSound(
  audioBlob: Blob, 
  lat: number, 
  lon: number
): Promise<AnalyzeResponse> {
  const formData = new FormData();
  // Create a file from the blob
  const audioFile = new File([audioBlob], 'recording.mp3', { type: 'audio/mpeg' });
  
  formData.append('audio', audioFile);
  formData.append('lat', lat.toString());
  formData.append('lon', lon.toString());

  try {
    const response = await axios.post<AnalyzeResponse>(`${API_BASE_URL}/analyze`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}
