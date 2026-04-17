import { BirdDetection, HistoryRecord } from '../types';

const HISTORY_STORAGE_KEY = 'birdsound-history';
const MAX_HISTORY_RECORDS = 20;

function isBirdDetection(value: unknown): value is BirdDetection {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.scientific_name === 'string' &&
    typeof candidate.common_name === 'string' &&
    (typeof candidate.species === 'string' || candidate.species === null) &&
    typeof candidate.confidence === 'number' &&
    typeof candidate.start_seconds === 'number' &&
    typeof candidate.end_seconds === 'number'
  );
}

function isHistoryRecord(value: unknown): value is HistoryRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.lat === 'number' &&
    typeof candidate.lon === 'number' &&
    typeof candidate.analysisDurationMs === 'number' &&
    Array.isArray(candidate.detections) &&
    candidate.detections.every(isBirdDetection)
  );
}

function normalizeHistoryRecord(value: unknown): HistoryRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Record<string, unknown>;

  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.createdAt !== 'string' ||
    typeof candidate.lat !== 'number' ||
    typeof candidate.lon !== 'number' ||
    !Array.isArray(candidate.detections) ||
    !candidate.detections.every(isBirdDetection)
  ) {
    return null;
  }

  return {
    id: candidate.id,
    createdAt: candidate.createdAt,
    lat: candidate.lat,
    lon: candidate.lon,
    analysisDurationMs: typeof candidate.analysisDurationMs === 'number' ? candidate.analysisDurationMs : 0,
    detections: candidate.detections,
  };
}

export function loadHistoryRecords(): HistoryRecord[] {
  try {
    const rawValue = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!rawValue) {
      return [];
    }

    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(normalizeHistoryRecord)
      .filter((record): record is HistoryRecord => record !== null && isHistoryRecord(record));
  } catch (error) {
    console.warn('Failed to load history records:', error);
    return [];
  }
}

export function saveHistoryRecord(input: Omit<HistoryRecord, 'id' | 'createdAt'>): HistoryRecord {
  const record: HistoryRecord = {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`,
    createdAt: new Date().toISOString(),
    ...input,
  };

  const nextRecords = [record, ...loadHistoryRecords()].slice(0, MAX_HISTORY_RECORDS);
  window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(nextRecords));

  return record;
}

export function clearHistoryRecords() {
  window.localStorage.removeItem(HISTORY_STORAGE_KEY);
}
