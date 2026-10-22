import { BaseCard } from '@navet/app/components/primitives/base-card';
import { BaseCardDialog } from '@navet/app/components/primitives/Cards/BaseCardDialog';
import { EntityCardHeaderIcon } from '@navet/app/components/primitives/entity-card-header-icon';
import {
  type CardSize,
  isExtraSmallCardSize,
  isTinyCardSize,
} from '@navet/app/components/shared/card-size-selector';
import { HelperValueControl } from '@navet/app/components/shared/device-editor/helper-value-control';
import { useEditModeSettingsRequest } from '@navet/app/components/shared/edit-mode-settings-request';
import {
  type EntityCardDialogControl,
  useEntityCardDialogState,
} from '@navet/app/components/shared/entity-card-dialog';
import { getCardShellSurfaceTokens } from '@navet/app/components/shared/theme/card-shell-surface-tokens';
import { useI18n, useProviderEntityModel, useTheme } from '@navet/app/hooks';
import type { IntegrationProviderId } from '@navet/app/types/provider';
import { type NavetHelperState, readNavetHelperState } from '@navet/core/helper-state';
import { Sliders } from 'lucide-react';

export { HelperValueControl } from '@navet/app/components/shared/device-editor/helper-value-control';

export function HelperCard({
  id,
  name,
  room,
  helper: initialHelper,
  providerId,
  size,
  isEditMode,
  dialog,
}: {
  id: string;
  name: string;
  room?: string;
  helper: NavetHelperState;
  providerId?: IntegrationProviderId;
  size: CardSize;
  isEditMode: boolean;
  dialog?: EntityCardDialogControl;
}) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const entity = useProviderEntityModel(id);
  const liveHelper = entity ? readNavetHelperState(entity) : undefined;
  const helper = liveHelper ?? { ...initialHelper, writable: false };
  const unavailable = entity?.availability === 'unavailable';
  const [open, setOpen] = useEntityCardDialogState(dialog);
  const cardShell = getCardShellSurfaceTokens(theme);
  const isTiny = isTinyCardSize(size);
  const isExtraSmall = isExtraSmallCardSize(size);
  const isVeryCompact = isTiny || isExtraSmall;
  const chromeSize = isVeryCompact ? 'tiny' : size === 'small' ? 'small' : 'medium';
  const isDateTimeValue = helper.helperType === 'datetime' && !unavailable && helper.value !== null;
  useEditModeSettingsRequest(id, () => setOpen(true), isEditMode);
  const value = unavailable
    ? t('common.unavailable')
    : helper.value === null
      ? t('providerDetails.unknown')
      : helper.helperType === 'text' && helper.mode === 'password'
        ? '••••'
        : String(helper.value);
  return (
    <>
      {!dialog ? (
        <BaseCard
          size={size}
          title={name}
          subtitle={room}
          headerCompact={isExtraSmall}
          headerVariant={isExtraSmall ? 'dense' : 'default'}
          headerLayout="eyebrow-first"
          headerTitleOverflow={isTiny ? 'truncate' : 'wrap'}
          headerTone="neutral"
          headerLeading={
            !isTiny ? (
              <EntityCardHeaderIcon
                IconComponent={Sliders}
                isActive={!unavailable}
                size={chromeSize}
                variant={isExtraSmall ? 'dense' : 'default'}
                tone="neutral"
              />
            ) : undefined
          }
          frameClassName={cardShell.rootFrameClassName}
          disableDefaultSheen={theme !== 'light'}
          contentClassName="flex items-end"
          interactive={!isEditMode}
          role={!isEditMode ? 'button' : undefined}
          tabIndex={!isEditMode ? 0 : undefined}
          aria-label={
            isTiny
              ? `${name}, ${value}${helper.helperType === 'number' && helper.unit ? ` ${helper.unit}` : ''}`
              : name
          }
          onClick={() => {
            if (!isEditMode) setOpen(true);
          }}
        >
          {!isTiny ? (
            <div
              className={`relative z-10 min-w-0 font-light tracking-normal ${
                isDateTimeValue
                  ? 'whitespace-pre-line leading-tight text-xl'
                  : `${helper.helperType === 'text' ? 'break-words line-clamp-2' : 'truncate'} leading-none ${
                      isVeryCompact ? 'text-2xl' : size === 'small' ? 'text-3xl' : 'text-4xl'
                    }`
              }`}
              title={value}
            >
              {isDateTimeValue ? value.replace(/[ T]/, '\n') : value}
              {helper.helperType === 'number' && helper.unit ? (
                <span className={`${isVeryCompact ? 'text-base' : 'text-xl'} align-baseline`}>
                  {` ${helper.unit}`}
                </span>
              ) : null}
              {helper.helperType === 'datetime' && helper.timeZone ? (
                <span className="block truncate text-sm">{helper.timeZone}</span>
              ) : null}
            </div>
          ) : null}
        </BaseCard>
      ) : null}
      {open ? (
        <BaseCardDialog
          onCloseAutoFocus={dialog?.onCloseAutoFocus}
          isOpen={open}
          onOpenChange={setOpen}
          title={name}
          theme={theme}
          entityId={id}
          entityType="helper"
          // biome-ignore lint/complexity/noUselessFragments: The form owns its footer; an empty slot suppresses the default Done action.
          footerContent={<></>}
          tabs={[
            {
              key: 'controls',
              label: t('providerDetails.controls', { name }),
              icon: Sliders,
              content: (
                <HelperValueControl
                  id={id}
                  name={name}
                  helper={helper}
                  providerId={providerId}
                  unavailable={unavailable}
                  onSaved={() => setOpen(false)}
                />
              ),
            },
          ]}
        />
      ) : null}
    </>
  );
}
