import { dispatchEntityCommand } from '@navet/app/commands';
import { CardDialogBody, CardDialogHeader } from '@navet/app/components/patterns/card-dialog';
import { BaseCard } from '@navet/app/components/primitives';
import { Button } from '@navet/app/components/primitives/button';
import { BaseCardDialog } from '@navet/app/components/primitives/Cards/BaseCardDialog';
import { EntityCardHeader } from '@navet/app/components/primitives/entity-card-header';
import { EntityCardHeaderIcon } from '@navet/app/components/primitives/entity-card-header-icon';
import { EntityCardTitleBlock } from '@navet/app/components/primitives/entity-card-title-block';
import { RoundControlButton } from '@navet/app/components/primitives/round-control-button';
import {
  type CardSize,
  isCompactCardSize,
  isTinyCardSize,
} from '@navet/app/components/shared/card-size-selector';
import {
  type EntityCardDialogControl,
  useEntityCardDialogState,
} from '@navet/app/components/shared/entity-card-dialog';
import { useEntityCardInteractionController } from '@navet/app/components/shared/entity-card-interaction-controller';
import { getCardReadableTextTokens } from '@navet/app/components/shared/theme/card-readable-text-tokens';
import { getCardShellSurfaceTokens } from '@navet/app/components/shared/theme/card-shell-surface-tokens';
import { getThemeColorValue } from '@navet/app/components/shared/theme/theme-colors';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { TinyCardWatermark } from '@navet/app/components/shared/tiny-card-watermark';
import {
  useI18n,
  useIntegrationStore,
  useProviderEntityModel,
  useServiceActionHandler,
  useTheme,
} from '@navet/app/hooks';
import type { IntegrationProviderId } from '@navet/app/types/provider';
import { Loader2, Play, Sparkles } from 'lucide-react';
import { memo, useState } from 'react';

interface SceneCardProps {
  dialog?: EntityCardDialogControl;
  id: string;
  name: string;
  room: string;
  providerId?: IntegrationProviderId;
  size: CardSize;
  onSizeChange: (id: string, size: CardSize) => void;
  isEditMode: boolean;
}

export const SceneCard = memo(function SceneCard({
  id,
  name,
  room,
  providerId,
  size,
  onSizeChange: _onSizeChange,
  isEditMode,
  dialog,
}: SceneCardProps) {
  const providerEntity = useProviderEntityModel(id);
  const connected = useIntegrationStore((state) =>
    providerEntity ? state.providerRuntime[providerEntity.providerId]?.connected : true
  );
  const unavailable = Boolean(
    providerEntity && (!connected || providerEntity.availability !== 'available')
  );
  const [dialogOpen, setDialogOpen] = useEntityCardDialogState(dialog);
  const interaction = useEntityCardInteractionController({
    ariaLabel: name,
    isEditMode: isEditMode || unavailable,
    onOpenControls: () => setDialogOpen(true),
    onOpenSettings: () => setDialogOpen(true),
  });
  const { t } = useI18n();
  const { theme, primaryColor } = useTheme();
  const cardShell = getCardShellSurfaceTokens(theme);
  const surface = getThemeSurfaceTokens(theme);
  const accentColor = getThemeColorValue(primaryColor);
  const [isActivating, setIsActivating] = useState(false);
  const runAction = useServiceActionHandler();
  const isTiny = isTinyCardSize(size);
  const isCompact = isCompactCardSize(size);
  const tinyTextTokens = getCardReadableTextTokens({
    theme,
    tone: 'primary',
    accentColor,
  });

  const handleActivate = () => {
    if (isEditMode || isActivating || unavailable) {
      return;
    }

    setIsActivating(true);
    void runAction(async () => {
      await dispatchEntityCommand({ type: 'turn_on', entityId: id }, providerId);
    }, t('scene.activateFailed')).finally(() => {
      setIsActivating(false);
    });
  };

  const controlsDialog = (
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
          description={room}
          theme={theme}
          editableTitle={false}
          showRoomSelector={false}
        />
        <Button
          onClick={handleActivate}
          disabled={isEditMode || isActivating || unavailable}
          loading={isActivating}
        >
          {t('scene.activate')}
        </Button>
      </CardDialogBody>
    </BaseCardDialog>
  );
  if (dialog) return controlsDialog;
  if (isTiny) {
    return (
      <>
        <BaseCard
          {...interaction.cardProps}
          size="tiny"
          className={`transition-opacity ${isEditMode || isActivating ? 'cursor-default opacity-75' : 'cursor-pointer'}`}
          disableDefaultSheen
          overlay={
            <>
              <div
                className="absolute inset-0"
                style={{
                  background: `radial-gradient(circle at 18% 12%, ${accentColor}28, transparent 34%), linear-gradient(155deg, transparent 24%, ${accentColor}14 100%)`,
                }}
              />
              {cardShell.sheenOverlayClassName ? (
                <div className={cardShell.sheenOverlayClassName} />
              ) : null}
            </>
          }
          contentClassName="h-full"
        >
          {isActivating ? (
            <TinyCardWatermark
              IconComponent={Loader2}
              color={tinyTextTokens.titleColor}
              className="opacity-20"
              spin
            />
          ) : (
            <TinyCardWatermark
              IconComponent={Sparkles}
              color={tinyTextTokens.titleColor}
              className="opacity-20"
            />
          )}

          <div className="relative flex h-full w-full flex-col justify-between text-left">
            <div className="min-w-0 w-full">
              <EntityCardTitleBlock
                title={name}
                subtitle={t('deviceType.scene')}
                layout="eyebrow-first"
                titleClassName={`mt-0.5 line-clamp-2 text-xs font-semibold leading-tight ${surface.textPrimary}`}
                subtitleClassName={`truncate text-xs tracking-normal ${surface.textMuted}`}
                titleStyle={{ color: tinyTextTokens.titleColor }}
                subtitleStyle={{ color: tinyTextTokens.subtitleColor }}
              />
            </div>
            <span />
          </div>

          <button
            type="button"
            className="absolute inset-0"
            onClick={handleActivate}
            disabled={isEditMode || isActivating || unavailable}
            aria-label={isActivating ? t('scene.activating') : t('scene.activate')}
          />
        </BaseCard>
        {controlsDialog}
      </>
    );
  }

  return (
    <>
      <BaseCard
        {...interaction.cardProps}
        size={size}
        disableDefaultSheen
        overlay={
          <>
            <div
              className="absolute inset-0"
              style={{
                background: `radial-gradient(circle at 14% 10%, ${accentColor}28, transparent 36%), linear-gradient(155deg, transparent 28%, ${accentColor}14 100%)`,
              }}
            />
            {cardShell.sheenOverlayClassName ? (
              <div className={cardShell.sheenOverlayClassName} />
            ) : null}
          </>
        }
        contentClassName="h-full"
      >
        <div className="relative flex h-full flex-col">
          <EntityCardHeader
            title={name}
            subtitle={t('deviceType.scene')}
            layout="eyebrow-first"
            size={size}
            tone="primary"
            titleClassName={surface.textPrimary}
            subtitleClassName={surface.textSecondary}
            leading={
              <EntityCardHeaderIcon IconComponent={Sparkles} isActive size={size} tone="primary" />
            }
          />

          <div
            className={`flex flex-1 ${isCompact ? 'items-end justify-between gap-3' : 'flex-col justify-between gap-4'}`}
          >
            <div className={isCompact ? 'min-w-0 flex-1' : ''}>
              <p className={`text-sm ${surface.textSecondary}`}>{room}</p>
              {!isCompact ? (
                <p className={`mt-1 text-xs ${surface.textMuted}`}>{t('scene.tapToActivate')}</p>
              ) : null}
            </div>

            <div className={isCompact ? 'shrink-0' : 'flex justify-end'}>
              <RoundControlButton
                theme={theme}
                size={isCompact ? 'small' : 'large'}
                variant="emphasis"
                onClick={handleActivate}
                disabled={isEditMode || isActivating || unavailable}
                aria-label={isActivating ? t('scene.activating') : t('scene.activate')}
                className="shadow-lg disabled:opacity-60"
                style={{
                  background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`,
                  boxShadow: `0 14px 30px -16px ${accentColor}`,
                }}
              >
                {isActivating ? (
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                ) : (
                  <Play className="h-4 w-4 fill-current text-white" />
                )}
              </RoundControlButton>
            </div>
          </div>
        </div>
      </BaseCard>
      {controlsDialog}
    </>
  );
});
