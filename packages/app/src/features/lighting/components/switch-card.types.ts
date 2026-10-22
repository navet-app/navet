import type { CardSize } from '@navet/app/components/shared/card-size-selector';
import type { CompanionRowPresentation } from '@navet/app/components/shared/companion-row-presentation';
import type { DeviceMetric } from '@navet/app/types/device.types';
import type { IntegrationProviderId } from '@navet/app/types/provider';
import type { ReactNode } from 'react';

export interface SwitchCardProps {
  id: string;
  name: string;
  size: CardSize;
  room: string;
  providerId?: IntegrationProviderId;
  initialState?: boolean;
  /** Lets a feature own binary commands and confirmed state while reusing the switch surface. */
  binaryControl?: {
    isOn: boolean;
    disabled: boolean;
    onToggle: () => void;
    status?: ReactNode;
  };
  entityType?: string;
  serviceDomain?: string;
  serviceAction?: string;
  power?: number;
  voltage?: number;
  energy?: number;
  metrics?: DeviceMetric[];
  isEditMode?: boolean;
  companion?: CompanionRowPresentation;
}
