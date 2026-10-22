import type { TemperatureUnit } from '@navet/app/utils/temperature';
import type { ClimateSiblingEntity } from '../climate-card/use-climate-card-controller';

export interface ClimateTemperaturePreset {
  value: number;
  label?: string;
}

export interface ClimateSettingsDialogProps {
  onCloseAutoFocus?: (event: Event) => void;
  entityId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  isOn: boolean;
  mode: string;
  action?: string;
  targetTemp: number;
  currentTemp: number;
  sourceTemperatureUnit?: TemperatureUnit;
  minTemp?: number;
  maxTemp?: number;
  step?: number;
  temperaturePresets?: ClimateTemperaturePreset[];
  siblingEntities?: ClimateSiblingEntity[];
  supportedClimateModes?: string[];
  onModeChange: (mode: string) => void;
  onTargetTempChange: (temp: number) => void;
  onTargetTempCommit?: (temp: number) => void;
}
