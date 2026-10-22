import { ImageWithFallback } from '@navet/app/components/figma/ImageWithFallback';
import { CardDialogBody, CardDialogHeader } from '@navet/app/components/patterns/card-dialog';
import { BaseCard } from '@navet/app/components/primitives';
import { BaseCardDialog } from '@navet/app/components/primitives/Cards/BaseCardDialog';
import {
  type CardSize,
  getStandardCardPadding,
} from '@navet/app/components/shared/card-size-selector';
import {
  type EntityCardDialogControl,
  useEntityCardDialogState,
} from '@navet/app/components/shared/entity-card-dialog';
import { useEntityCardInteractionController } from '@navet/app/components/shared/entity-card-interaction-controller';
import { getCardShellSurfaceTokens } from '@navet/app/components/shared/theme/card-shell-surface-tokens';
import { readNavetPersonState } from '@navet/app/core/navet-device-state';
import { useI18n, useProviderEntityModel, useProviderResource, useTheme } from '@navet/app/hooks';
import { User } from 'lucide-react';
import { memo } from 'react';
import { getPersonCardSurfaceTokens } from './person-card-surface-tokens';

interface PersonCardProps {
  dialog?: EntityCardDialogControl;
  id: string;
  name: string;
  room: string;
  location: string;
  state: 'home' | 'away';
  entityPicture?: string;
  size: CardSize;
  onSizeChange: (id: string, size: CardSize) => void;
  isEditMode: boolean;
}

function normalizePersonDetailCandidate(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const normalized = trimmed.toLowerCase();
  if (
    normalized === 'unknown' ||
    normalized === 'unavailable' ||
    normalized === 'unassigned' ||
    normalized === 'none' ||
    normalized === 'null' ||
    normalized === 'n/a'
  ) {
    return null;
  }

  return trimmed;
}

function getFirstString(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const normalizedValue = normalizePersonDetailCandidate(value);
    if (normalizedValue) {
      return normalizedValue;
    }
  }

  return null;
}

export const PersonCard = memo(function PersonCard({
  id,
  name,
  room,
  location,
  state,
  entityPicture,
  size,
  onSizeChange: _onSizeChange,
  isEditMode,
  dialog,
}: PersonCardProps) {
  const [dialogOpen, setDialogOpen] = useEntityCardDialogState(dialog);
  const interaction = useEntityCardInteractionController({
    ariaLabel: name,
    isEditMode,
    onOpenControls: () => setDialogOpen(true),
    onOpenSettings: () => setDialogOpen(true),
  });
  const { t } = useI18n();
  const { theme, colors } = useTheme();
  const cardShell = getCardShellSurfaceTokens(theme);
  const providerEntity = useProviderEntityModel(id);
  const providerState = readNavetPersonState(providerEntity);
  const liveState: 'home' | 'away' =
    providerState?.value === 'home' ? 'home' : providerState?.value === 'away' ? 'away' : state;
  const fallbackPicture =
    typeof providerState?.entityPicture === 'string' ? providerState.entityPicture : entityPicture;
  const pictureRequestKey = [
    providerEntity?.resources?.primary_image?.path,
    fallbackPicture,
    providerEntity?.providerId,
  ]
    .filter(Boolean)
    .join('::');
  const primaryImageResource = useProviderResource({
    deviceId: id,
    kind: 'primary_image',
    attrs: providerEntity?.resources?.primary_image?.path
      ? { entity_picture: providerEntity.resources.primary_image.path }
      : undefined,
    fallbackPicture,
    providerId: providerEntity?.providerId,
    requestKey: pictureRequestKey,
  });
  const presenceLabel = liveState === 'home' ? t('person.home') : t('person.away');
  const detailLabel =
    liveState === 'home'
      ? getFirstString(room, location)
      : getFirstString(
          providerState?.address,
          providerState?.locationName,
          providerState?.geocodedLocation,
          providerState?.zone,
          providerState?.location,
          location
        );

  const cardColors = liveState === 'home' ? colors.person.home : colors.person.away;
  const surface = getPersonCardSurfaceTokens(theme, liveState);
  const padding = getStandardCardPadding(size);
  const resolvedEntityPicture =
    primaryImageResource?.kind === 'image' ? (primaryImageResource.url ?? undefined) : undefined;
  const hasPortrait = Boolean(resolvedEntityPicture);
  const isTiny = size === 'tiny';
  const isExtraSmall = size === 'extra-small';
  const nameTextClassName = isTiny ? 'text-xs' : isExtraSmall ? 'text-sm' : 'text-sm';
  const eyebrowTextClassName = 'text-xs';
  const pillTextClassName = 'text-xs';

  return (
    <>
      {!dialog ? (
        <BaseCard
          {...interaction.cardProps}
          size={size}
          fullBleed
          frameClassName={`${cardShell.rootFrameClassName} ${cardColors.border} ${surface.containerShadowClassName}`}
          disableDefaultSheen={theme !== 'glass'}
          overlay={
            <>
              {hasPortrait ? (
                <ImageWithFallback
                  src={resolvedEntityPicture}
                  alt={name}
                  className="absolute inset-0 h-full w-full object-cover"
                  draggable={false}
                />
              ) : (
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${surface.fallbackBackgroundClassName}`}
                >
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.22),transparent_55%)]" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div
                      className={`rounded-full border p-4 backdrop-blur-sm ${surface.fallbackIconContainerClassName}`}
                    >
                      <User className={`h-7 w-7 ${surface.fallbackIconClassName}`} />
                    </div>
                  </div>
                </div>
              )}
              <div
                className={`absolute inset-0 bg-gradient-to-t ${cardColors.glow} to-transparent`}
              />
              <div
                className={`absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t ${
                  hasPortrait
                    ? 'from-black/88 via-black/38 to-transparent'
                    : surface.fallbackScrimClassName
                }`}
              />
              {surface.overlayClassName ? (
                <div className={`absolute inset-0 ${surface.overlayClassName}`} />
              ) : null}
            </>
          }
          contentClassName="h-full"
        >
          <div
            className={`relative flex h-full ${isExtraSmall ? 'items-center' : 'items-end'} ${padding}`}
          >
            <div className="min-w-0 max-w-full">
              <div
                className={`truncate text-white/88 drop-shadow-[0_2px_8px_rgba(0,0,0,0.75)] ${eyebrowTextClassName}`}
              >
                {presenceLabel}
              </div>
              <div
                className={`mt-0.5 truncate font-semibold leading-tight text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)] ${nameTextClassName}`}
              >
                {name}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {detailLabel && detailLabel !== presenceLabel ? (
                  <div
                    className={`max-w-[11rem] truncate rounded-full border border-white/12 bg-black/28 px-2.5 py-1 text-white/88 backdrop-blur-sm ${pillTextClassName}`}
                  >
                    {detailLabel}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </BaseCard>
      ) : null}
      <BaseCardDialog
        variant="modal"
        titleInContent
        title={name}
        theme={theme}
        isOpen={dialogOpen}
        onOpenChange={setDialogOpen}
        onCloseAutoFocus={dialog?.onCloseAutoFocus}
        maxWidth="sm"
        bodyPadding={false}
      >
        <CardDialogBody>
          <CardDialogHeader
            title={name}
            description={presenceLabel}
            theme={theme}
            editableTitle={false}
            showRoomSelector={false}
          />
          {detailLabel && detailLabel !== presenceLabel ? <p>{detailLabel}</p> : null}
        </CardDialogBody>
      </BaseCardDialog>
    </>
  );
});
