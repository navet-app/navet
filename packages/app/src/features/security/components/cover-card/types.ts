import type { CardSize } from '@navet/app/components/shared/card-size-selector';
import type { EntityCardDialogControl } from '@navet/app/components/shared/entity-card-dialog';
import type { TranslationKey } from '@navet/app/i18n';
import type { LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';

export type CoverState = 'open' | 'closed' | 'opening' | 'closing' | 'unknown' | 'unavailable';

export type DeviceClass =
  | 'blind'
  | 'shade'
  | 'curtain'
  | 'garage'
  | 'gate'
  | 'awning'
  | 'shutter'
  | 'door'
  | 'window';

export interface CoverCardProps {
  dialog?: EntityCardDialogControl;
  id: string;
  name: string;
  room: string;
  initialState?: CoverState;
  initialPosition?: number;
  initialPositionMode?: 'position' | 'tilt';
  supportedFeatures?: number;
  hasPosition?: boolean;
  initialDeviceClass?: string;
  size: CardSize;
  onSizeChange: (id: string, size: CardSize) => void;
  isEditMode: boolean;
}

export interface DeviceClassConfig {
  labelKey: TranslationKey;
  icon: LucideIcon;
}

export type CoverIconButtonProps = Pick<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-label' | 'onClick' | 'onPointerDown' | 'disabled'
>;
