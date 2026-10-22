import type { CardSize } from '@navet/app/components/shared/card-size-selector';
import type { CardType } from '@navet/app/features/dashboard/stores/custom-cards-store';
import type { TranslationKey } from '@navet/app/i18n';
import type { DeviceWithType } from '@navet/app/types/device.types';
import type { ReactNode } from 'react';
import type { DashboardLibraryCard, DashboardLibraryRemoval } from '../dashboard-library-list';

export interface AddEntityDialogPrimitiveProps {
  open: boolean;
  onClose: () => void;
  onAddCard: (template: CardTemplate, size: CardSize) => void;
  onAddLibraryCard: (cardId: string) => void;
  currentRoom: string;
  libraryCards: DashboardLibraryCard[];
  showCardsTab?: boolean;
  /** Use the Home library for entity selection without custom-card authoring. */
  libraryOnly?: boolean;
  libraryAddDisabled?: boolean;
  libraryRemoval?: DashboardLibraryRemoval;
  title?: string;
  description?: string;
  actionLabel?: string;
  libraryEmptyText?: string;
  footer?: ReactNode;
  allowedTemplateIds?: CardTemplateId[];
}

export type CardTemplateId = CardType | 'scene' | 'energy-metric';

export interface CardTemplate {
  id: CardTemplateId;
  cardType: CardType;
  nameKey: TranslationKey;
  descriptionKey: TranslationKey;
  icon: ReactNode;
  defaultSize: CardSize;
  supportedSizes: CardSize[];
  initialData?: Record<string, unknown>;
}

export interface AddEntityDialogProps {
  open: boolean;
  onClose: () => void;
  onAddEntity: (entityId: string) => void;
  currentRoom: string;
  deviceMap: Map<string, DeviceWithType>;
  addedEntityIds: string[];
  visibleEntityIds?: string[];
  title?: string;
  description?: string;
  actionLabel?: string;
  onAddCard?: (template: CardTemplate, size: CardSize) => void;
  allowedTemplateIds?: CardTemplateId[];
}
