import { CardDialogHeader } from '@navet/app/components/patterns/card-dialog';
import { Button } from '@navet/app/components/primitives/button';
import { BaseCardDialog } from '@navet/app/components/primitives/Cards/BaseCardDialog';
import {
  coverSheetHeaderClassName,
  DialogFooter,
} from '@navet/app/components/primitives/dialog-primitives';
import { InteractivePill } from '@navet/app/components/primitives/interactive-pill';
import { Select } from '@navet/app/components/primitives/select';
import { CustomScrollbar } from '@navet/app/components/shared/device-editor/custom-scrollbar';
import { BUILT_IN_WALLPAPERS } from '@navet/app/constants/built-in-wallpapers';
import {
  isScreensaverBackground,
  isScreensaverIdleMinutes,
  resolveScreensaverAppearance,
  SCREENSAVER_IDLE_MINUTES,
} from '@navet/app/constants/screensaver-options';
import {
  getSolidWallpaper,
  SOLID_WALLPAPERS,
  solidWallpaperForeground,
} from '@navet/app/constants/solid-wallpapers';
import { useScreensaverStore } from '@navet/app/features/dashboard/screensaver/screensaver-store';
import { ScreensaverThumbnail } from '@navet/app/features/dashboard/screensaver/screensaver-thumbnail';
import { useI18n } from '@navet/app/hooks';
import { Check, Upload, X } from 'lucide-react';
import { type MouseEvent, type RefObject, useId, useRef, useState } from 'react';
import type { SettingsSectionController } from '../hooks/use-settings-section-controller';
import { AppearanceWallpaperPreview } from './appearance-wallpaper-preview';
import { OnOffPillToggle } from './settings-pill-toggle';

export type AppearanceBackgroundTarget = 'wallpaper' | 'screensaver';

export function AppearanceBackgroundDialog({
  target,
  controller,
  onClose,
  returnFocusRef,
}: {
  target: AppearanceBackgroundTarget;
  controller: SettingsSectionController;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}) {
  const { t } = useI18n();
  const {
    styles,
    theme,
    wallpaper,
    screensaverBackground,
    screensaverEnabled,
    screensaverIdleMinutes,
  } = controller;
  const screensaver = target === 'screensaver';
  const selected = screensaver ? screensaverBackground : wallpaper;
  const solid = getSolidWallpaper(selected);
  const mode = selected === 'automatic' ? 'automatic' : solid ? 'solid' : 'wallpaper';
  const [lastWallpaper, setLastWallpaper] = useState(
    selected?.startsWith('builtin:') ? selected : BUILT_IN_WALLPAPERS[0].token
  );
  const [lastColor, setLastColor] = useState(solid?.value ?? SOLID_WALLPAPERS[0].value);
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const delayId = useId();
  const hintId = useId();
  const appearance = resolveScreensaverAppearance(screensaverBackground, wallpaper);
  const select = (value: string) => {
    if (screensaver) {
      if (isScreensaverBackground(value))
        controller.updateScopedSettings({ screensaverBackground: value }, [
          'screensaverBackground',
        ]);
    } else controller.handleSelectWallpaper(value);
    if (value.startsWith('builtin:')) setLastWallpaper(value);
    const color = getSolidWallpaper(value);
    if (color) setLastColor(color.value);
  };
  const preview = (event: MouseEvent<HTMLButtonElement>) => {
    // Mobile taps do not consistently focus buttons; capture the launcher for safe dismissal.
    event.currentTarget.focus({ preventScroll: true });
    useScreensaverStore.getState().start();
  };
  const selectionMark = (
    <span className="absolute bottom-2 right-2 rounded-full bg-white p-1 text-black">
      <Check aria-hidden className="h-3 w-3" />
    </span>
  );
  return (
    <BaseCardDialog
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      variant="modal"
      theme={theme}
      title={t(screensaver ? 'screensaver.title' : 'settings.appearance.wallpaper.title')}
      description={t(
        screensaver
          ? 'settings.dashboard.screensaver.description'
          : 'settings.appearance.wallpaper.description'
      )}
      titleInContent
      maxWidth="md"
      height="tall"
      mobileCoverSheet
      persistentMobileDismiss
      contentClassName="flex flex-col"
      shellBodyClassName="flex min-h-0 flex-1 flex-col"
      bodyClassName="flex min-h-0 flex-1 flex-col"
      bodyPadding={false}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        returnFocusRef.current?.focus({ preventScroll: true });
      }}
    >
      <header className={`${coverSheetHeaderClassName} shrink-0 ${styles.textColor}`}>
        <CardDialogHeader
          title={t(screensaver ? 'screensaver.title' : 'settings.appearance.wallpaper.title')}
          theme={theme}
          editableTitle={false}
          showRoomSelector={false}
          className="mb-0"
        />
      </header>
      <CustomScrollbar isOn={theme !== 'light'} className="min-h-0 flex-1">
        <div className={`space-y-4 px-5 pb-5 ${styles.textColor}`}>
          {screensaver ? (
            <OnOffPillToggle
              ariaLabel={t('screensaver.title')}
              value={screensaverEnabled}
              onChange={(value) =>
                controller.updateScopedSettings({ screensaverEnabled: value }, [
                  'screensaverEnabled',
                ])
              }
            />
          ) : null}
          {!screensaver || screensaverEnabled ? (
            <>
              {screensaver ? (
                <div className="space-y-2">
                  <button
                    type="button"
                    data-screensaver-preview
                    aria-label={t('screensaver.openPreview')}
                    onClick={preview}
                    className="relative block aspect-video w-full overflow-hidden rounded-xl bg-black text-white focus-visible:outline-2 focus-visible:outline-offset-4"
                  >
                    <ScreensaverThumbnail appearance={appearance} />
                  </button>
                  <Button variant="secondary" data-screensaver-preview onClick={preview}>
                    {t('screensaver.preview')}
                  </Button>
                </div>
              ) : (
                <AppearanceWallpaperPreview wallpaper={wallpaper} styles={styles} />
              )}
              {screensaver ? (
                <div className="space-y-2">
                  <label htmlFor={delayId} className="block text-sm font-medium">
                    {t('screensaver.startAfter')}
                  </label>
                  <Select
                    id={delayId}
                    value={screensaverIdleMinutes}
                    aria-describedby={hintId}
                    containerClassName="max-w-xs"
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (isScreensaverIdleMinutes(value))
                        controller.updateScopedSettings({ screensaverIdleMinutes: value }, [
                          'screensaverIdleMinutes',
                        ]);
                    }}
                  >
                    {SCREENSAVER_IDLE_MINUTES.map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {t(minutes === 1 ? 'screensaver.minute' : 'screensaver.minutes', {
                          count: minutes,
                        })}
                      </option>
                    ))}
                  </Select>
                  <p id={hintId} className={`text-sm ${styles.subtleColor}`}>
                    {t('screensaver.delayHint')}
                  </p>
                </div>
              ) : null}
              <fieldset className="space-y-2">
                <legend className="sr-only">{t('wallpaper.backgroundType')}</legend>
                <div className="flex flex-wrap gap-2">
                  {screensaver ? (
                    <InteractivePill
                      active={mode === 'automatic'}
                      aria-pressed={mode === 'automatic'}
                      onClick={() => select('automatic')}
                    >
                      {t('screensaver.automatic')}
                    </InteractivePill>
                  ) : null}
                  <InteractivePill
                    active={mode === 'wallpaper'}
                    aria-pressed={mode === 'wallpaper'}
                    onClick={() => select(lastWallpaper)}
                  >
                    {t('settings.appearance.wallpaper.title')}
                  </InteractivePill>
                  <InteractivePill
                    active={mode === 'solid'}
                    aria-pressed={mode === 'solid'}
                    onClick={() => select(lastColor)}
                  >
                    {t('wallpaper.solidColor')}
                  </InteractivePill>
                </div>
              </fieldset>
              {mode === 'automatic' ? (
                <p className={`text-sm ${styles.subtleColor}`}>{t('screensaver.automaticHint')}</p>
              ) : (
                <>
                  {!screensaver && mode === 'wallpaper' ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        leading={<Upload className="h-4 w-4" />}
                        onClick={() => uploadRef.current?.click()}
                      >
                        {t('settings.appearance.wallpaper.upload')}
                      </Button>
                      <input
                        ref={uploadRef}
                        type="file"
                        accept="image/*"
                        onChange={controller.handleWallpaperUpload}
                        className="hidden"
                      />
                    </div>
                  ) : null}
                  <fieldset
                    aria-label={t(
                      mode === 'solid' ? 'wallpaper.solidColors' : 'wallpaper.builtInWallpapers'
                    )}
                    className="grid grid-cols-2 gap-3 @min-[560px]/settings-detail:grid-cols-3"
                  >
                    {mode === 'solid'
                      ? SOLID_WALLPAPERS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            aria-label={t(option.labelKey)}
                            aria-pressed={selected === option.value}
                            onClick={() => select(option.value)}
                            className={`relative aspect-video overflow-hidden rounded-xl border focus-visible:outline-2 focus-visible:outline-offset-4 ${styles.borderColor}`}
                            style={{
                              backgroundColor: option.color,
                              color: solidWallpaperForeground(option.color),
                              outlineColor: styles.accentColor,
                              boxShadow:
                                selected === option.value
                                  ? `0 0 0 2px ${styles.accentColor}`
                                  : undefined,
                            }}
                          >
                            <span className="absolute bottom-2 left-2 right-8 text-left text-xs leading-4">
                              {t(option.labelKey)}
                            </span>
                            {selected === option.value ? selectionMark : null}
                          </button>
                        ))
                      : BUILT_IN_WALLPAPERS.map((option) => (
                          <button
                            key={option.token}
                            type="button"
                            aria-label={t('settings.appearance.wallpaper.optionAria', {
                              id: option.id,
                            })}
                            aria-pressed={selected === option.token}
                            onClick={() => select(option.token)}
                            className={`relative aspect-video overflow-hidden rounded-xl border text-white focus-visible:outline-2 focus-visible:outline-offset-4 ${styles.borderColor}`}
                            style={{
                              outlineColor: styles.accentColor,
                              boxShadow:
                                selected === option.token
                                  ? `0 0 0 2px ${styles.accentColor}`
                                  : undefined,
                            }}
                          >
                            <img
                              src={option.webpSrc}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              className="absolute inset-0 h-full w-full object-cover"
                            />
                            <span className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                            <span className="absolute bottom-2 left-2 right-8 text-left text-xs leading-4">
                              {option.id
                                .replace(/-/g, ' ')
                                .replace(/^./, (letter) => letter.toUpperCase())}
                            </span>
                            {selected === option.token ? selectionMark : null}
                          </button>
                        ))}
                  </fieldset>
                </>
              )}
              {!screensaver && wallpaper ? (
                <Button
                  variant="ghost"
                  leading={<X className="h-4 w-4" />}
                  onClick={controller.handleRemoveWallpaper}
                >
                  {t('settings.appearance.wallpaper.remove')}
                </Button>
              ) : null}
            </>
          ) : null}
          {screensaver ? (
            <p className={`text-sm ${styles.subtleColor}`}>{t('screensaver.deviceHint')}</p>
          ) : null}
        </div>
      </CustomScrollbar>
      <DialogFooter className="mt-0 shrink-0 px-5 py-3">
        <Button variant="secondary" onClick={onClose}>
          {t('common.done')}
        </Button>
      </DialogFooter>
    </BaseCardDialog>
  );
}
