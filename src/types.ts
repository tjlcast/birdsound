export interface BirdDetection {
  scientific_name: string;
  common_name: string;
  species: string;
  confidence: number;
  start_seconds: number;
  end_seconds: number;
}

export interface AnalyzeResponse {
  message: string;
  detections: BirdDetection[];
}

export interface HistoryRecord {
  id: string;
  createdAt: string;
  lat: number;
  lon: number;
  detections: BirdDetection[];
}

export interface BirdInfo {
  id: string; // matches species from API
  nameCn: string;
  nameEn: string;
  scientificName: string;
  description: string;
  tags: string[];
  image: string;
}
