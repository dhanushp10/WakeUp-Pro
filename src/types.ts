export type AlarmType = 'simple' | 'wifi' | 'motion';

export interface Alarm {
  id: string;
  time: string; // HH:mm
  period: 'AM' | 'PM';
  label: string;
  type: AlarmType;
  enabled: boolean;
  repeat: string[]; // ['M', 'T', ...]
  config?: {
    wifi?: {
      locationSet: boolean;
      sensitivity: 'Low' | 'Medium' | 'High';
    };
    motion?: {
      steps: number;
      sensitivity: 'Low' | 'Medium' | 'High';
      mode: 'Walk' | 'Shake';
    };
  };
}
