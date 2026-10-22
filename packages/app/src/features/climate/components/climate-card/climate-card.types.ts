import type { CardSize } from '@navet/app/components/shared/card-size-selector';
import type { CompanionRowPresentation } from '@navet/app/components/shared/companion-row-presentation';
import type { IntegrationProviderId } from '@navet/app/types/provider';
import type { TemperatureUnit } from '@navet/app/utils/temperature';

export interface ClimateCardProps {
  id: string;
  name: string;
  room: string;
  providerId?: IntegrationProviderId;
  headerSubtitle?: string;
  initialTemp?: number;
  initialCurrentTemp?: number;
  temperatureUnit?: TemperatureUnit;
  initialMode?: string;
  initialAction?: string;
  supportedClimateModes?: string[];
  initialState?: boolean;
  size: CardSize;
  onSizeChange: (id: string, size: CardSize) => void;
  isEditMode: boolean;
  companion?: CompanionRowPresentation;
}
