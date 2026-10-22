import type { SensorIconType, SensorReading } from '../sensors';

export interface AvailableSensor {
  id: string;
  label: string;
  value: string;
  unit: string;
  icon: SensorIconType;
  category: 'energy' | 'climate' | 'environmental' | 'other';
  room?: string;
}

export interface SensorGroupSettingsDialogProps {
  onCloseAutoFocus?: (event: Event) => void;
  entityId: string;
  isOpen: boolean;
  onClose: () => void;
  groupName: string;
  roomValue?: string;
  roomLabel?: string;
  roomOptions?: Array<{ label: string; value: string }>;
  currentSensors: SensorReading[];
  maxSensors: number;
  accentColor: 'teal' | 'blue' | 'purple' | 'amber' | 'emerald';
  availableSensors?: AvailableSensor[];
  showRoomSelector?: boolean;
  closeOnSelect?: boolean;
  onNameChange?: (name: string) => void;
  onRoomChange?: (room: string) => void;
  onSensorsUpdate: (sensors: SensorReading[]) => void;
}

export interface SensorGroupColorConfig {
  iconBg: string;
  iconColor: string;
  hover: string;
  selected: string;
}
