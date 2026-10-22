import { useEditModeSettingsRequest } from '@navet/app/components/shared/edit-mode-settings-request';
import { useEntityCardDialogState } from '@navet/app/components/shared/entity-card-dialog';
import { useEntityCardInteractionController } from '@navet/app/components/shared/entity-card-interaction-controller';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { readNavetCoverState } from '@navet/app/core/navet-device-state';
import {
  useI18n,
  useProviderEntityModel,
  useServiceActionHandler,
  useTheme,
} from '@navet/app/hooks';
import { integrationSecurityFeatureService } from '@navet/app/services/integration-security-feature.service';
import { useSettingsStore } from '@navet/app/stores/settings-store';
import { ensureCanonicalEntityId } from '@navet/app/utils/provider-entity-id';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { DEVICE_CLASS_CONFIG, resolveCoverDeviceClass } from './constants';
import type { CoverCardProps, CoverState, DeviceClass } from './types';
import { CoverCardView } from './view';

const COVER_FEATURE_OPEN = 1;
const COVER_FEATURE_CLOSE = 2;
const COVER_FEATURE_SET_POSITION = 4;
const COVER_FEATURE_STOP = 8;
const COVER_FEATURE_OPEN_TILT = 16;
const COVER_FEATURE_CLOSE_TILT = 32;
const COVER_FEATURE_STOP_TILT = 64;
const COVER_FEATURE_SET_TILT_POSITION = 128;
const COVER_POSITION_OPTIMISTIC_TIMEOUT_MS = 20_000;
const COVER_POSITION_REACHED_TOLERANCE = 1;

function normalizeCoverPosition(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function supportsCoverFeature(
  supportedFeatures: number | undefined,
  feature: number,
  defaultValue: boolean
) {
  if (typeof supportedFeatures !== 'number') {
    return defaultValue;
  }

  return (supportedFeatures & feature) !== 0;
}

function resolveCoverStatePosition(state: CoverState) {
  return state === 'open' || state === 'opening' ? 100 : 0;
}

export const CoverCardContainer = memo(function CoverCardContainer({
  id,
  name,
  room,
  initialState,
  initialPosition,
  initialPositionMode,
  supportedFeatures: initialSupportedFeatures,
  hasPosition: initialHasPosition,
  initialDeviceClass = 'blind',
  size,
  onSizeChange,
  isEditMode,
  dialog,
}: CoverCardProps) {
  const resolvedInitialPosition = normalizeCoverPosition(initialPosition) ?? 0;
  const [position, setPosition] = useState(resolvedInitialPosition);
  const optimisticPositionRef = useRef<number | null>(null);
  const optimisticPositionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestLivePositionRef = useRef<number | null>(null);
  const latestLiveStateRef = useRef<CoverState | null>(null);
  const [deviceClass, setDeviceClass] = useState<DeviceClass>(
    resolveCoverDeviceClass(initialDeviceClass)
  );
  const [coverState, setCoverState] = useState<CoverState>(
    initialState ?? (resolvedInitialPosition === 0 ? 'closed' : 'open')
  );
  const [isSettingsOpen, setIsSettingsOpen] = useEntityCardDialogState(dialog);
  const { t } = useI18n();
  const runAction = useServiceActionHandler();
  const providerEntity = useProviderEntityModel(id);
  const providerState = readNavetCoverState(providerEntity);
  const liveSupportedFeatures = providerState?.supportedFeatures;
  const resolvedSupportedFeatures = liveSupportedFeatures ?? initialSupportedFeatures;
  const livePosition = normalizeCoverPosition(providerState?.position);
  const positionMode = providerState?.positionMode ?? initialPositionMode ?? 'position';
  const hasLivePosition = livePosition !== null;
  const hasPosition =
    hasLivePosition || providerState?.hasPosition === true || Boolean(initialHasPosition);
  const liveState = providerState?.value ?? initialState ?? coverState;
  const isUnavailable = liveState === 'unknown' || liveState === 'unavailable';
  const canOpen =
    !isUnavailable &&
    supportsCoverFeature(
      resolvedSupportedFeatures,
      positionMode === 'tilt' ? COVER_FEATURE_OPEN_TILT : COVER_FEATURE_OPEN,
      true
    );
  const canClose =
    !isUnavailable &&
    supportsCoverFeature(
      resolvedSupportedFeatures,
      positionMode === 'tilt' ? COVER_FEATURE_CLOSE_TILT : COVER_FEATURE_CLOSE,
      true
    );
  const supportsStop = supportsCoverFeature(
    resolvedSupportedFeatures,
    positionMode === 'tilt' ? COVER_FEATURE_STOP_TILT : COVER_FEATURE_STOP,
    true
  );
  const canStop = !isUnavailable && supportsStop;
  const canSetPosition =
    !isUnavailable &&
    hasPosition &&
    supportsCoverFeature(
      resolvedSupportedFeatures,
      positionMode === 'tilt' ? COVER_FEATURE_SET_TILT_POSITION : COVER_FEATURE_SET_POSITION,
      false
    );

  const resolvedDeviceClass = resolveCoverDeviceClass(providerState?.deviceClass ?? deviceClass);
  const controlMode = useSettingsStore(
    (state) => state.coverControlModes[ensureCanonicalEntityId(id)]
  );
  const updateControlMode = useSettingsStore((state) => state.updateCoverControlMode);
  const showPosition =
    hasPosition &&
    (controlMode ?? (resolvedDeviceClass === 'garage' ? 'simple' : 'position')) === 'position';
  const displayPosition = showPosition ? position : resolveCoverStatePosition(coverState);

  const clearOptimisticPosition = useCallback(() => {
    optimisticPositionRef.current = null;
    if (optimisticPositionTimerRef.current !== null) {
      clearTimeout(optimisticPositionTimerRef.current);
      optimisticPositionTimerRef.current = null;
    }
  }, []);

  const beginOptimisticPosition = useCallback(
    (nextPosition: number) => {
      clearOptimisticPosition();
      optimisticPositionRef.current = nextPosition;
      optimisticPositionTimerRef.current = setTimeout(() => {
        optimisticPositionRef.current = null;
        optimisticPositionTimerRef.current = null;
        setPosition((currentPosition) => latestLivePositionRef.current ?? currentPosition);
      }, COVER_POSITION_OPTIMISTIC_TIMEOUT_MS);
    },
    [clearOptimisticPosition]
  );

  useEffect(() => {
    if (!providerState) return;
    const nextPosition = normalizeCoverPosition(providerState.position);
    if (nextPosition !== null) {
      latestLivePositionRef.current = nextPosition;
      const optimisticPosition = optimisticPositionRef.current;
      const hasReachedOptimisticPosition =
        optimisticPosition !== null &&
        Math.abs(nextPosition - optimisticPosition) <= COVER_POSITION_REACHED_TOLERANCE;

      if (hasReachedOptimisticPosition) {
        clearOptimisticPosition();
        setPosition(nextPosition);
      } else if (optimisticPosition === null) {
        setPosition(nextPosition);
      }
    }
    const liveState = providerState.value as CoverState;
    if (['open', 'closed', 'opening', 'closing', 'unknown', 'unavailable'].includes(liveState)) {
      latestLiveStateRef.current = liveState;
      setCoverState(liveState);
      if (liveState === 'unknown' || liveState === 'unavailable') {
        clearOptimisticPosition();
        setPosition(0);
        return;
      }
      if (nextPosition === null) {
        const statePosition = resolveCoverStatePosition(liveState);
        latestLivePositionRef.current = statePosition;
        if (optimisticPositionRef.current === null) {
          setPosition(statePosition);
        }
      }
    }
  }, [clearOptimisticPosition, providerState]);

  useEffect(() => clearOptimisticPosition, [clearOptimisticPosition]);
  const { colors, theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);

  const previewPosition = (newPosition: number) => {
    if (!canSetPosition) {
      return;
    }

    const nextPosition = normalizeCoverPosition(newPosition);
    if (nextPosition === null) {
      return;
    }

    setPosition(nextPosition);
    setCoverState(nextPosition === 100 ? 'open' : nextPosition === 0 ? 'closed' : 'open');
  };

  const commitPosition = (newPosition: number) => {
    if (!canSetPosition) {
      return;
    }

    const nextPosition = normalizeCoverPosition(newPosition);
    if (nextPosition === null) {
      return;
    }

    previewPosition(nextPosition);
    beginOptimisticPosition(nextPosition);
    void runAction(
      () => integrationSecurityFeatureService.setCoverPosition(id, nextPosition, positionMode),
      t('cover.feedback.updateFailed'),
      {
        onError: () => {
          clearOptimisticPosition();
          setPosition((currentPosition) => latestLivePositionRef.current ?? currentPosition);
        },
      }
    );
  };

  const handleOpen = () => {
    if (!canOpen) {
      return;
    }

    const previousState = coverState;
    const previousPosition = position;
    setCoverState('opening');
    if (!hasPosition) {
      setPosition(100);
    }
    void runAction(
      () => integrationSecurityFeatureService.openCover(id, positionMode),
      t('cover.feedback.updateFailed'),
      {
        onError: () => {
          setCoverState((currentState) =>
            currentState === 'opening'
              ? (latestLiveStateRef.current ?? previousState)
              : currentState
          );
          setPosition(latestLivePositionRef.current ?? previousPosition);
        },
      }
    );
  };

  const handleClose = () => {
    if (!canClose) {
      return;
    }

    const previousState = coverState;
    const previousPosition = position;
    setCoverState('closing');
    if (!hasPosition) {
      setPosition(0);
    }
    void runAction(
      () => integrationSecurityFeatureService.closeCover(id, positionMode),
      t('cover.feedback.updateFailed'),
      {
        onError: () => {
          setCoverState((currentState) =>
            currentState === 'closing'
              ? (latestLiveStateRef.current ?? previousState)
              : currentState
          );
          setPosition(latestLivePositionRef.current ?? previousPosition);
        },
      }
    );
  };

  const handleStop = () => {
    if (!canStop) {
      return;
    }

    clearOptimisticPosition();
    setPosition((prev) => {
      setCoverState(prev >= 100 ? 'open' : prev <= 0 ? 'closed' : 'open');
      return prev;
    });
    void runAction(
      () => integrationSecurityFeatureService.stopCover(id, positionMode),
      t('cover.feedback.updateFailed')
    );
  };

  // Get state text and color — active states use the accent color, inactive use muted
  const getStateDisplay = () => {
    switch (isUnavailable ? 'unavailable' : coverState) {
      case 'unknown':
      case 'unavailable':
        return { text: t('common.unavailable'), color: surface.textSecondary, unavailable: true };
      case 'open':
        return { text: t('cover.state.open'), color: colors.cover.open.accent };
      case 'opening':
        return { text: t('cover.state.opening'), color: colors.cover.open.accent };
      case 'closed':
        return { text: t('cover.state.closed'), color: surface.textSecondary };
      case 'closing':
        return { text: t('cover.state.closing'), color: surface.textSecondary };
    }
  };

  const stateDisplay = getStateDisplay();
  const cardId = `cover-${name.toLowerCase().replace(/ /g, '-')}`;
  const cardInteraction = useEntityCardInteractionController({
    ariaLabel: t('cover.ariaLabel', { name }),
    ariaPressed: !isUnavailable && displayPosition > 0,
    isEditMode,
    onToggle: isUnavailable
      ? undefined
      : () => {
          if (displayPosition > 0) {
            handleClose();
            return;
          }
          handleOpen();
        },
    onOpenSettings: () => setIsSettingsOpen(true),
  });
  useEditModeSettingsRequest(id, () => setIsSettingsOpen(true), isEditMode);

  return (
    <CoverCardView
      dialog={dialog}
      entityId={id}
      name={name}
      room={room}
      position={displayPosition}
      showPosition={showPosition}
      controlMode={showPosition ? 'position' : 'simple'}
      onControlModeChange={(mode) => updateControlMode(id, mode)}
      hasPosition={hasPosition}
      deviceClass={resolvedDeviceClass}
      deviceClassConfig={DEVICE_CLASS_CONFIG}
      size={size}
      isEditMode={isEditMode}
      cardId={cardId}
      openColors={colors.cover.open}
      closedColors={colors.cover.closed}
      cardProps={cardInteraction.cardProps}
      iconButtonProps={{ ...cardInteraction.iconButtonProps, disabled: isUnavailable }}
      settingsButtonProps={cardInteraction.settingsButtonProps}
      theme={theme}
      stateDisplay={stateDisplay}
      isSettingsOpen={isSettingsOpen}
      setIsSettingsOpen={setIsSettingsOpen}
      onSizeChange={onSizeChange}
      onPreviewPosition={previewPosition}
      onCommitPosition={commitPosition}
      handleOpen={handleOpen}
      handleClose={handleClose}
      handleStop={handleStop}
      canOpen={canOpen}
      canClose={canClose}
      supportsStop={supportsStop}
      canStop={canStop}
      canSetPosition={showPosition && canSetPosition}
      setDeviceClass={setDeviceClass}
    />
  );
});
