import {
  CardActionRow,
  CardDialogBody,
  CardDialogFooter,
  CardDialogHeader,
} from '@navet/app/components/patterns';
import {
  BaseCard,
  BaseCardDialog,
  Button,
  EntityCardHeaderIcon,
  Input,
  InteractivePill,
} from '@navet/app/components/primitives';
import type { CardSize } from '@navet/app/components/shared/card-size-selector';
import { withTintAlpha } from '@navet/app/components/shared/theme/custom-card-tint-surface';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@navet/app/components/ui/alert-dialog';
import { useI18n, useTheme } from '@navet/app/hooks';
import type { ThemeType } from '@navet/app/hooks/use-theme';
import type { TranslateFn } from '@navet/app/i18n';
import { integrationSecurityFeatureService } from '@navet/app/services/integration-security-feature.service';
import type { NavetAlarmAction, NavetAlarmEntity } from '@navet/core/alarm-types';
import {
  BellRing,
  Home,
  Loader2,
  MoonStar,
  MoreHorizontal,
  Plane,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldEllipsis,
  ShieldHalf,
  ShieldMinus,
  ShieldOff,
  ShieldQuestion,
  ShieldX,
  Unlock,
  X,
} from 'lucide-react';
import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { getAlarmStateLabel } from '../utils/alarm-state-label';
import {
  getSecurityCardSurfaceTokens,
  getSecurityStateSurfaceProps,
} from './security-card-surface-tokens';

interface SecurityPanelCardProps {
  alarms: NavetAlarmEntity[];
  size?: Extract<CardSize, 'medium' | 'large' | 'extra-large'>;
  presentation?: 'card' | 'compact';
}

type PendingActionState = {
  action: NavetAlarmAction;
  alarmId: string;
} | null;

const ACTION_ORDER: NavetAlarmAction[] = [
  'arm_home',
  'arm_away',
  'arm_night',
  'arm_vacation',
  'arm_custom_bypass',
  'disarm',
  'trigger',
];

const STATE_PRIORITY: Record<NavetAlarmEntity['state'], number> = {
  triggered: 0,
  pending: 1,
  arming: 2,
  disarming: 3,
  armed_away: 4,
  armed_home: 5,
  armed_night: 6,
  armed_vacation: 7,
  armed_custom_bypass: 8,
  disarmed: 9,
  unavailable: 10,
  unknown: 11,
};

function compareAlarms(left: NavetAlarmEntity, right: NavetAlarmEntity) {
  const priorityDifference = STATE_PRIORITY[left.state] - STATE_PRIORITY[right.state];
  if (priorityDifference !== 0) {
    return priorityDifference;
  }

  return left.name.localeCompare(right.name);
}

function getAlarmStateTone(state: NavetAlarmEntity['state']) {
  switch (state) {
    case 'disarmed':
      return 'neutral' as const;
    case 'armed_away':
    case 'armed_home':
    case 'armed_night':
    case 'armed_vacation':
    case 'armed_custom_bypass':
      return 'primary' as const;
    case 'pending':
    case 'arming':
    case 'disarming':
      return 'yellow' as const;
    case 'triggered':
      return 'red' as const;
    case 'unavailable':
    case 'unknown':
      return 'neutral' as const;
  }
}

function getAlarmStatePalette(
  state: NavetAlarmEntity['state'],
  theme: ThemeType,
  accentColor?: string
) {
  const tone = getAlarmStateTone(state);

  if (tone === 'primary') {
    const tintColor = accentColor ?? '#f97316';

    if (theme === 'light') {
      return {
        pillClassName: 'text-slate-900 hover:bg-white/96',
        pillStyle: {
          backgroundColor: withTintAlpha(tintColor, 0.14),
          borderColor: withTintAlpha(tintColor, 0.28),
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.78), 0 10px 24px -20px ${withTintAlpha(
            tintColor,
            0.3
          )}`,
        },
      };
    }

    if (theme === 'glass') {
      return {
        pillClassName: 'text-white hover:bg-white/16',
        pillStyle: {
          backgroundColor: withTintAlpha(tintColor, 0.16),
          borderColor: withTintAlpha(tintColor, 0.24),
          boxShadow: `0 12px 28px -22px ${withTintAlpha(tintColor, 0.34)}`,
        },
      };
    }

    return {
      pillClassName: 'text-white hover:bg-white/12',
      pillStyle: {
        backgroundColor: withTintAlpha(tintColor, theme === 'black' ? 0.18 : 0.14),
        borderColor: withTintAlpha(tintColor, theme === 'black' ? 0.26 : 0.24),
        boxShadow: `0 12px 28px -24px ${withTintAlpha(tintColor, 0.28)}`,
      },
    };
  }

  if (tone === 'yellow') {
    if (theme === 'light') {
      return {
        pillClassName: 'border-amber-300/80 bg-amber-50/88 text-amber-700 hover:bg-amber-100/92',
        frameGradient: 'from-amber-100 via-white to-orange-50',
        frameBorder: 'border-amber-200/80',
        glow: 'from-amber-300/28',
      };
    }

    if (theme === 'glass') {
      return {
        pillClassName: 'border-amber-300/22 bg-amber-500/14 text-amber-100 hover:bg-amber-500/20',
        frameGradient: 'from-amber-500/18 via-white/8 to-orange-500/12',
        frameBorder: 'border-amber-300/22',
        glow: 'from-amber-300/18',
      };
    }

    return {
      pillClassName: 'border-amber-400/24 bg-amber-900/34 text-amber-100 hover:bg-amber-900/46',
      frameGradient: 'from-amber-950 via-zinc-950 to-orange-900/72',
      frameBorder: 'border-amber-400/24',
      glow: 'from-amber-400/16',
    };
  }

  if (tone === 'neutral') {
    if (theme === 'light') {
      return {
        pillClassName: 'border-slate-300/80 bg-slate-50/88 text-slate-700 hover:bg-slate-100/92',
        frameGradient: 'from-slate-100 via-white to-slate-50',
        frameBorder: 'border-slate-200/80',
        glow: 'from-slate-300/18',
      };
    }

    if (theme === 'glass') {
      return {
        pillClassName: 'border-white/18 bg-white/10 text-white/92 hover:bg-white/14',
        frameGradient: 'from-slate-500/16 via-white/8 to-slate-400/10',
        frameBorder: 'border-white/18',
        glow: 'from-white/10',
      };
    }

    return {
      pillClassName: 'border-white/14 bg-white/8 text-white/92 hover:bg-white/12',
      frameGradient: 'from-zinc-900 via-black to-slate-950/72',
      frameBorder: 'border-white/14',
      glow: 'from-white/8',
    };
  }

  if (theme === 'light') {
    return {
      pillClassName: 'border-red-300/80 bg-red-50/88 text-red-700 hover:bg-red-100/92',
      frameGradient: 'from-red-100 via-white to-rose-50',
      frameBorder: 'border-red-200/80',
      glow: 'from-red-300/30',
    };
  }

  if (theme === 'glass') {
    return {
      pillClassName: 'border-red-300/22 bg-red-500/14 text-red-100 hover:bg-red-500/20',
      frameGradient: 'from-red-500/18 via-white/8 to-rose-500/12',
      frameBorder: 'border-red-300/22',
      glow: 'from-red-300/18',
    };
  }

  return {
    pillClassName: 'border-red-400/24 bg-red-900/34 text-red-100 hover:bg-red-900/46',
    frameGradient: 'from-red-950 via-zinc-950 to-rose-900/72',
    frameBorder: 'border-red-400/24',
    glow: 'from-red-400/16',
  };
}

function getAlarmToneBaseColor(tone: ReturnType<typeof getAlarmStateTone>, accentColor?: string) {
  switch (tone) {
    case 'primary':
      return accentColor ?? '#f97316';
    case 'yellow':
      return '#f59e0b';
    case 'red':
      return '#ef4444';
    default:
      return '#64748b';
  }
}

function getAlarmActionStyles({
  alarmState,
  theme,
  accentColor,
  selected,
  destructive,
}: {
  alarmState: NavetAlarmEntity['state'];
  theme: ThemeType;
  accentColor?: string;
  selected: boolean;
  destructive: boolean;
}) {
  const tone = destructive ? 'red' : getAlarmStateTone(alarmState);
  const baseColor = getAlarmToneBaseColor(tone, accentColor);

  const buttonStyle: CSSProperties =
    theme === 'light'
      ? {
          backgroundColor: withTintAlpha(baseColor, selected ? 0.24 : 0.08),
          borderColor: withTintAlpha(baseColor, selected ? 0.46 : 0.18),
          color: tone === 'neutral' ? '#334155' : tone === 'red' ? '#991b1b' : '#0f172a',
          boxShadow: selected
            ? `0 16px 32px -22px ${withTintAlpha(baseColor, 0.3)}, inset 0 1px 0 rgba(255,255,255,0.82), inset 0 0 0 1px ${withTintAlpha(baseColor, 0.18)}`
            : `inset 0 1px 0 rgba(255,255,255,0.55)`,
        }
      : {
          backgroundColor: withTintAlpha(baseColor, selected ? 0.24 : 0.1),
          borderColor: withTintAlpha(baseColor, selected ? 0.42 : 0.18),
          color: 'rgba(255,255,255,0.96)',
          boxShadow: selected
            ? `0 18px 34px -24px ${withTintAlpha(baseColor, 0.34)}, inset 0 0 0 1px ${withTintAlpha(
                baseColor,
                0.16
              )}`
            : 'none',
        };

  const iconStyle: CSSProperties =
    theme === 'light'
      ? {
          backgroundColor: withTintAlpha(baseColor, selected ? 0.22 : 0.1),
          borderColor: withTintAlpha(baseColor, selected ? 0.36 : 0.16),
          color: tone === 'neutral' ? '#475569' : tone === 'red' ? '#b91c1c' : '#0f172a',
        }
      : {
          backgroundColor: withTintAlpha(baseColor, selected ? 0.22 : 0.12),
          borderColor: withTintAlpha(baseColor, selected ? 0.34 : 0.16),
          color: 'rgba(255,255,255,0.96)',
        };

  return { buttonStyle, iconStyle };
}

function getEmergencyTriggerClassName(
  state: NavetAlarmEntity['state'],
  theme: ThemeType,
  accentColor?: string
) {
  return getAlarmStatePalette(state, theme, accentColor).pillClassName;
}

function getAlarmSurfaceProps(
  state: NavetAlarmEntity['state'],
  theme: ThemeType,
  colors: ReturnType<typeof useTheme>['colors'],
  accentColor: string
) {
  const tone = getAlarmStateTone(state);
  const surfaceTone =
    tone === 'red'
      ? 'danger'
      : tone === 'yellow'
        ? 'warning'
        : tone === 'primary'
          ? 'armed'
          : 'neutral';

  return getSecurityStateSurfaceProps(surfaceTone, theme, colors, accentColor);
}

function getAlarmStateIcon(state: NavetAlarmEntity['state']) {
  switch (state) {
    case 'disarmed':
      return ShieldOff;
    case 'armed_home':
      return ShieldHalf;
    case 'armed_away':
      return ShieldCheck;
    case 'armed_night':
      return MoonStar;
    case 'armed_vacation':
      return Shield;
    case 'armed_custom_bypass':
      return ShieldEllipsis;
    case 'arming':
      return Loader2;
    case 'pending':
      return ShieldAlert;
    case 'disarming':
      return ShieldMinus;
    case 'triggered':
      return ShieldAlert;
    case 'unavailable':
      return ShieldX;
    default:
      return ShieldQuestion;
  }
}

function getActionLabel(action: NavetAlarmAction, t: TranslateFn) {
  switch (action) {
    case 'arm_home':
      return t('security.alarm.action.armHome');
    case 'arm_away':
      return t('security.alarm.action.armAway');
    case 'arm_night':
      return t('security.alarm.action.armNight');
    case 'arm_vacation':
      return t('security.alarm.action.armVacation');
    case 'arm_custom_bypass':
      return t('security.alarm.action.customBypass');
    case 'disarm':
      return t('security.alarm.action.disarm');
    case 'trigger':
      return t('security.alarm.action.trigger');
  }
}

function getActionIcon(action: NavetAlarmAction) {
  switch (action) {
    case 'arm_home':
      return Home;
    case 'arm_away':
      return ShieldCheck;
    case 'arm_night':
      return MoonStar;
    case 'arm_vacation':
      return Plane;
    case 'arm_custom_bypass':
      return ShieldEllipsis;
    case 'disarm':
      return Unlock;
    case 'trigger':
      return BellRing;
  }
}

function isActionActiveForState(action: NavetAlarmAction, state: NavetAlarmEntity['state']) {
  switch (action) {
    case 'disarm':
      return state === 'disarmed';
    case 'arm_home':
      return state === 'armed_home';
    case 'arm_away':
      return state === 'armed_away';
    case 'arm_night':
      return state === 'armed_night';
    case 'arm_vacation':
      return state === 'armed_vacation';
    case 'arm_custom_bypass':
      return state === 'armed_custom_bypass';
    default:
      return false;
  }
}

function isAlarmUnavailable(alarm: NavetAlarmEntity) {
  return (
    alarm.availability === 'unavailable' ||
    alarm.state === 'unavailable' ||
    alarm.state === 'unknown'
  );
}

function shouldRequireCode(alarm: NavetAlarmEntity) {
  return alarm.requiresCode === true;
}

function supportsAlarmCodeEntry(alarm: NavetAlarmEntity) {
  return alarm.codeFormat !== 'none' || alarm.requiresCode === true;
}

function getActionHandler(action: NavetAlarmAction) {
  switch (action) {
    case 'arm_home':
      return integrationSecurityFeatureService.armHome;
    case 'arm_away':
      return integrationSecurityFeatureService.armAway;
    case 'arm_night':
      return integrationSecurityFeatureService.armNight;
    case 'arm_vacation':
      return integrationSecurityFeatureService.armVacation;
    case 'arm_custom_bypass':
      return integrationSecurityFeatureService.armCustomBypass;
    case 'disarm':
      return integrationSecurityFeatureService.disarm;
    case 'trigger':
      return integrationSecurityFeatureService.trigger;
  }
}

function orderSupportedActions(actions: NavetAlarmAction[]) {
  return ACTION_ORDER.filter((action) => actions.includes(action));
}

function isArmAction(action: NavetAlarmAction) {
  return (
    action === 'arm_home' ||
    action === 'arm_away' ||
    action === 'arm_night' ||
    action === 'arm_vacation' ||
    action === 'arm_custom_bypass'
  );
}

function isPostSubmitArmTransitionSatisfied(
  action: NavetAlarmAction,
  state: NavetAlarmEntity['state']
) {
  switch (action) {
    case 'arm_home':
      return state === 'armed_home';
    case 'arm_away':
      return state === 'armed_away';
    case 'arm_night':
      return state === 'armed_night';
    case 'arm_vacation':
      return state === 'armed_vacation';
    case 'arm_custom_bypass':
      return state === 'armed_custom_bypass';
    default:
      return true;
  }
}

export function SecurityPanelCard({
  alarms,
  size = 'large',
  presentation = 'card',
}: SecurityPanelCardProps) {
  const { t } = useI18n();
  const sortedAlarms = useMemo(() => [...alarms].sort(compareAlarms), [alarms]);
  const [selectedAlarmId, setSelectedAlarmId] = useState<string | null>(
    sortedAlarms[0]?.id ?? null
  );
  const [code, setCode] = useState('');
  const [draftAction, setDraftAction] = useState<NavetAlarmAction | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingActionState>(null);
  const [postSubmitAction, setPostSubmitAction] = useState<PendingActionState>(null);
  const [triggerAction, setTriggerAction] = useState<{ alarmId: string } | null>(null);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const { theme, colors, accentColor } = useTheme();
  const securitySurface = getSecurityCardSurfaceTokens(theme);

  useEffect(() => {
    if (!sortedAlarms.some((alarm) => alarm.id === selectedAlarmId)) {
      setSelectedAlarmId(sortedAlarms[0]?.id ?? null);
    }
  }, [selectedAlarmId, sortedAlarms]);

  useEffect(() => {
    if (postSubmitAction === null) {
      return;
    }

    const matchingAlarm = sortedAlarms.find((alarm) => alarm.id === postSubmitAction.alarmId);
    if (!matchingAlarm) {
      setPostSubmitAction(null);
      return;
    }

    if (isPostSubmitArmTransitionSatisfied(postSubmitAction.action, matchingAlarm.state)) {
      setPostSubmitAction(null);
    }
  }, [postSubmitAction, sortedAlarms]);

  const selectedAlarm = useMemo(
    () => sortedAlarms.find((alarm) => alarm.id === selectedAlarmId) ?? sortedAlarms[0] ?? null,
    [selectedAlarmId, sortedAlarms]
  );

  if (!selectedAlarm) {
    return null;
  }

  const supportedActions = orderSupportedActions(selectedAlarm.supportedActions);
  const unavailable = isAlarmUnavailable(selectedAlarm);
  const requiresCode = shouldRequireCode(selectedAlarm);
  const supportsCodeEntry = supportsAlarmCodeEntry(selectedAlarm);
  const pendingForSelectedAlarm =
    pendingAction !== null && pendingAction.alarmId === selectedAlarm.id
      ? pendingAction
      : postSubmitAction !== null && postSubmitAction.alarmId === selectedAlarm.id
        ? postSubmitAction
        : null;
  const AlarmIcon = getAlarmStateIcon(selectedAlarm.state);
  const cardSurface = getAlarmSurfaceProps(selectedAlarm.state, theme, colors, accentColor);
  const codeDialogOpen = supportsCodeEntry && draftAction !== null;
  const themeSurface = getThemeSurfaceTokens(theme);

  const clearCode = () => {
    setCode('');
    setDraftAction(null);
  };

  const submitAction = async (action: NavetAlarmAction) => {
    if (unavailable || pendingForSelectedAlarm) {
      return;
    }

    if (requiresCode && code.trim().length === 0) {
      toast.error(t('security.alarm.feedback.codeRequired'));
      return;
    }

    setPendingAction({ action, alarmId: selectedAlarm.id });

    try {
      await getActionHandler(action)(selectedAlarm.id, code.trim().length > 0 ? code : undefined);
      if (isArmAction(action)) {
        setPostSubmitAction({ action, alarmId: selectedAlarm.id });
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('security.alarm.feedback.updateFailed')
      );
    } finally {
      clearCode();
      setPendingAction(null);
    }
  };

  const handleAction = async (action: NavetAlarmAction) => {
    if (action === 'trigger') {
      setTriggerAction({ alarmId: selectedAlarm.id });
      return;
    }

    if (supportsCodeEntry) {
      setDraftAction(action);
      setCode('');
      return;
    }

    await submitAction(action);
  };

  const handleConfirmedTrigger = () => {
    setTriggerAction(null);

    if (supportsCodeEntry) {
      setDraftAction('trigger');
      setCode('');
      return;
    }

    void submitAction('trigger');
  };

  const maskedCodeValue =
    selectedAlarm.codeFormat === 'number'
      ? '•'.repeat(code.length) || t('security.alarm.code.noneEntered')
      : null;
  const selectorPillSize = 'small';
  const actionGridClassName = 'grid-cols-2';
  const actionAwaitingCode = draftAction !== null ? getActionLabel(draftAction, t) : null;
  const isMedium = size === 'medium';
  const emergencyTriggerClassName = getEmergencyTriggerClassName(
    selectedAlarm.state,
    theme,
    accentColor
  );
  const emergencyTriggerPalette = getAlarmStatePalette(selectedAlarm.state, theme, accentColor);
  const mediumActionButtonClassName =
    'h-11 min-w-0 flex-1 flex-row items-center justify-start gap-2 rounded-full px-3 py-0 text-left';
  const mediumActionLabelClassName = 'whitespace-normal break-words text-[12px] leading-tight';
  const unavailableOverlayLabelClassName = isMedium
    ? 'px-2 py-0.5 text-[11px] leading-none tracking-[0.04em]'
    : 'px-2.5 py-1 text-xs tracking-[0.06em] uppercase';
  const numpadKeyClassName = 'h-12 w-12 rounded-full justify-self-center p-0 text-sm';
  const numpadDisplayClassName = 'w-40 rounded-3xl px-4 py-3 text-sm';
  const numpadButtonClassName =
    theme === 'light'
      ? 'border-gray-200/80 bg-white/92 text-slate-900 hover:bg-white'
      : theme === 'glass'
        ? 'border-white/18 bg-white/10 text-white hover:bg-white/14'
        : 'border-white/14 bg-white/8 text-white/92 hover:bg-white/12';
  const nonTriggerActions = supportedActions.filter((action) => action !== 'trigger');
  const primaryAction =
    selectedAlarm.state === 'disarmed'
      ? (supportedActions.find((action) => action === 'arm_away') ??
        supportedActions.find(isArmAction) ??
        null)
      : (supportedActions.find((action) => action === 'disarm') ?? null);
  const secondaryActions = supportedActions.filter((action) => action !== primaryAction);
  const mediumActionRows = isMedium
    ? nonTriggerActions.reduce<NavetAlarmAction[][]>((rows, action, index) => {
        if (index % 3 === 0) {
          rows.push([action]);
        } else {
          rows[rows.length - 1]?.push(action);
        }
        return rows;
      }, [])
    : [];

  const renderActionButton = (action: NavetAlarmAction, fullWidth = false) => {
    const isSelectedAction = isActionActiveForState(action, selectedAlarm.state);
    const isTriggeredDismissAction = action === 'disarm' && selectedAlarm.state === 'triggered';
    const isPendingAction = Boolean(pendingForSelectedAlarm);
    const isPendingCurrentAction = pendingForSelectedAlarm?.action === action;
    const isUnavailableAction = unavailable;
    const isDisabledAction = isUnavailableAction || isPendingAction || isSelectedAction;
    const buttonBaseClassName = mediumActionButtonClassName;
    const iconWrapClassName = 'h-7 w-7 rounded-full shrink-0';
    const iconClassName = 'h-3.5 w-3.5';
    const labelClassName = mediumActionLabelClassName;
    const actionStyles = getAlarmActionStyles({
      alarmState: selectedAlarm.state,
      theme,
      accentColor,
      selected: isSelectedAction,
      destructive: isTriggeredDismissAction,
    });

    return (
      <button
        type="button"
        key={action}
        aria-label={getActionLabel(action, t)}
        disabled={isDisabledAction}
        className={`group relative flex overflow-hidden ${fullWidth ? 'flex-1' : 'w-full'} border transition-[color,background-color,border-color,box-shadow,opacity,transform,filter] duration-200 ${
          buttonBaseClassName
        } ${
          isUnavailableAction
            ? 'cursor-not-allowed opacity-50'
            : isPendingAction
              ? 'cursor-wait'
              : isSelectedAction
                ? 'cursor-not-allowed'
                : ''
        }`}
        style={actionStyles.buttonStyle}
        onClick={() => void handleAction(action)}
      >
        {isPendingCurrentAction ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-1/2 motion-safe:animate-[navet-alarm-action-loading-sweep_1.05s_linear_infinite]"
            style={{
              background:
                theme === 'light'
                  ? 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 14%, rgba(255,255,255,0.38) 50%, rgba(255,255,255,0.08) 86%, transparent 100%)'
                  : 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.02) 14%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0.02) 86%, transparent 100%)',
            }}
          />
        ) : null}
        <span
          className={`relative z-10 flex items-center justify-center border ${iconWrapClassName} ${
            isPendingCurrentAction ? 'motion-safe:animate-pulse' : ''
          }`}
          style={actionStyles.iconStyle}
        >
          {isPendingCurrentAction ? (
            <Loader2 className={`${iconClassName} animate-spin`} />
          ) : (
            (() => {
              const ActionIcon = getActionIcon(action);
              return <ActionIcon className={iconClassName} />;
            })()
          )}
        </span>
        <span
          className={`relative z-10 flex min-w-0 flex-1 items-center font-medium ${labelClassName} ${
            isPendingCurrentAction ? 'motion-safe:animate-pulse' : ''
          }`}
        >
          {isPendingCurrentAction
            ? t('security.alarm.action.pending', { action: getActionLabel(action, t) })
            : getActionLabel(action, t)}
        </span>
      </button>
    );
  };

  const compactStateTone =
    selectedAlarm.state === 'triggered'
      ? 'red'
      : selectedAlarm.state === 'pending' ||
          selectedAlarm.state === 'arming' ||
          selectedAlarm.state === 'disarming'
        ? 'yellow'
        : 'neutral';

  return (
    <>
      <style>{`
        @keyframes navet-alarm-action-loading-sweep {
          0% {
            transform: translateX(-120%);
          }
          100% {
            transform: translateX(220%);
          }
        }
      `}</style>
      {presentation === 'compact' ? (
        <BaseCard
          size="large"
          fullBleed
          role="group"
          aria-label={t('security.alarm.controls')}
          className="h-auto"
          data-testid="security-alarm-compact"
        >
          {sortedAlarms.length > 1 ? (
            <fieldset
              className={`flex flex-wrap gap-2 border-b p-2.5 ${themeSurface.border}`}
              aria-label={t('security.alarm.selector')}
            >
              {sortedAlarms.map((alarm) => (
                <InteractivePill
                  key={alarm.id}
                  active={alarm.id === selectedAlarm.id}
                  intent="navigation"
                  size={selectorPillSize}
                  onClick={() => {
                    setSelectedAlarmId(alarm.id);
                    clearCode();
                  }}
                >
                  {alarm.name}
                </InteractivePill>
              ))}
            </fieldset>
          ) : null}
          <div className="flex min-h-16 items-center gap-3 p-3">
            <EntityCardHeaderIcon
              IconComponent={AlarmIcon}
              isActive={selectedAlarm.state === 'triggered'}
              size="small"
              tone={compactStateTone}
            />
            <div className="min-w-0 flex-1">
              <h3 className={`truncate text-xs font-semibold ${themeSurface.textPrimary}`}>
                {selectedAlarm.name}
              </h3>
              <p className={`mt-0.5 truncate text-[11px] ${themeSurface.textSecondary}`}>
                {getAlarmStateLabel(selectedAlarm.state, t)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {primaryAction ? (
                <Button
                  size="small"
                  variant={selectedAlarm.state === 'triggered' ? 'destructive' : 'soft'}
                  loading={pendingForSelectedAlarm?.action === primaryAction}
                  disabled={unavailable || Boolean(pendingForSelectedAlarm)}
                  onClick={() => void handleAction(primaryAction)}
                >
                  {getActionLabel(primaryAction, t)}
                </Button>
              ) : null}
              {secondaryActions.length > 0 ? (
                <Button
                  iconOnly
                  label={t('common.moreActions')}
                  size="small"
                  variant="ghost"
                  disabled={unavailable || Boolean(pendingForSelectedAlarm)}
                  onClick={() => setMoreActionsOpen(true)}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          </div>
        </BaseCard>
      ) : (
        <BaseCard
          size={size}
          title={selectedAlarm.name}
          subtitle={getAlarmStateLabel(selectedAlarm.state, t)}
          headerLeading={
            <EntityCardHeaderIcon
              IconComponent={AlarmIcon}
              isActive
              size={size}
              tone={getAlarmStateTone(selectedAlarm.state)}
            />
          }
          headerTrailing={
            selectedAlarm.state === 'triggered' ? (
              <InteractivePill
                active
                intent="navigation"
                size="compact"
                icon={ShieldAlert}
                className={emergencyTriggerClassName}
                style={emergencyTriggerPalette.pillStyle}
                disabled
              >
                {t('security.alarm.triggeredBadge')}
              </InteractivePill>
            ) : supportedActions.includes('trigger') ? (
              <InteractivePill
                intent="action"
                size="compact"
                icon={BellRing}
                className={emergencyTriggerClassName}
                style={emergencyTriggerPalette.pillStyle}
                disabled={unavailable || Boolean(pendingForSelectedAlarm)}
                onClick={() => void handleAction('trigger')}
              >
                {t('security.alarm.action.trigger')}
              </InteractivePill>
            ) : undefined
          }
          tone={getAlarmStateTone(selectedAlarm.state)}
          frameClassName={cardSurface.frameClassName}
          style={cardSurface.frameStyle}
          overlay={cardSurface.overlay}
          disableDefaultSheen={cardSurface.disableDefaultSheen}
        >
          <div className="relative h-full w-full overflow-hidden rounded-[inherit]">
            <div
              className={`flex h-full flex-col gap-3 ${
                unavailable ? 'pointer-events-none opacity-45 saturate-50' : ''
              }`}
            >
              {sortedAlarms.length > 1 ? (
                <fieldset
                  className="flex flex-wrap gap-2"
                  aria-label={t('security.alarm.selector')}
                >
                  {sortedAlarms.map((alarm) => (
                    <InteractivePill
                      key={alarm.id}
                      active={alarm.id === selectedAlarm.id}
                      intent="navigation"
                      size={selectorPillSize}
                      onClick={() => {
                        setSelectedAlarmId(alarm.id);
                        clearCode();
                      }}
                    >
                      {alarm.name}
                    </InteractivePill>
                  ))}
                </fieldset>
              ) : null}

              {selectedAlarm.changedBy ? (
                <div
                  className={`flex flex-wrap gap-x-4 gap-y-1 text-sm ${securitySurface.secondaryTextClassName}`}
                >
                  <span>{t('security.alarm.changedBy', { name: selectedAlarm.changedBy })}</span>
                </div>
              ) : null}

              <div className="mt-auto flex flex-1 flex-col justify-end pt-2">
                {isMedium ? (
                  <div className="flex w-full flex-col gap-2">
                    {mediumActionRows.map((row, rowIndex) => (
                      <CardActionRow
                        key={`alarm-action-row-${rowIndex}`}
                        theme={theme}
                        size="medium"
                        leftContent={
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            {row.map((action) => renderActionButton(action, true))}
                          </div>
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <div className={`grid w-full gap-2 ${actionGridClassName}`}>
                    {nonTriggerActions.map((action) => renderActionButton(action))}
                  </div>
                )}
              </div>
            </div>
            {unavailable ? (
              <>
                <div className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] bg-black/18 backdrop-blur-[1px]" />
                <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
                  <div
                    className={`inline-flex max-w-[calc(100%-1rem)] items-center justify-center truncate rounded-full border border-white/12 bg-black/45 font-semibold text-white/92 backdrop-blur-md ${unavailableOverlayLabelClassName}`}
                  >
                    {t('common.unavailable')}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </BaseCard>
      )}

      <BaseCardDialog
        variant="modal"
        titleInContent
        isOpen={moreActionsOpen}
        onOpenChange={setMoreActionsOpen}
        title={t('security.alarm.controls')}
        description={`${selectedAlarm.name} · ${getAlarmStateLabel(selectedAlarm.state, t)}`}
        theme={theme}
        overlayClassName={themeSurface.dialogBackdrop}
        maxWidth="sm"
        bodyPadding={false}
      >
        <CardDialogBody>
          <CardDialogHeader
            title={t('security.alarm.controls')}
            description={`${selectedAlarm.name} · ${getAlarmStateLabel(selectedAlarm.state, t)}`}
            showRoomSelector={false}
            editableTitle={false}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            {secondaryActions.map((action) => renderActionButton(action))}
          </div>
        </CardDialogBody>
      </BaseCardDialog>

      <BaseCardDialog
        variant="modal"
        titleInContent
        isOpen={codeDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            clearCode();
          }
        }}
        title={
          actionAwaitingCode
            ? t('security.alarm.code.actionTitle', { action: actionAwaitingCode })
            : t('security.alarm.code.title')
        }
        description={t('security.alarm.code.description', { name: selectedAlarm.name })}
        theme={theme}
        overlayClassName={themeSurface.dialogBackdrop}
        contentTitle={
          actionAwaitingCode
            ? t('security.alarm.code.actionTitle', { action: actionAwaitingCode })
            : t('security.alarm.code.title')
        }
        contentDescription={t('security.alarm.code.description', { name: selectedAlarm.name })}
        maxWidth="sm"
        bodyPadding={false}
      >
        <CardDialogBody>
          <CardDialogHeader
            title={
              actionAwaitingCode
                ? t('security.alarm.code.actionTitle', { action: actionAwaitingCode })
                : t('security.alarm.code.title')
            }
            description={t('security.alarm.code.description', { name: selectedAlarm.name })}
            showRoomSelector={false}
            editableTitle={false}
          />

          {selectedAlarm.codeFormat === 'text' ? (
            <div className="mx-auto w-full max-w-md">
              <Input
                type="password"
                autoComplete="off"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder={t('security.alarm.code.placeholder')}
                disabled={Boolean(pendingForSelectedAlarm) || unavailable}
              />
            </div>
          ) : (
            <div className="mx-auto w-full max-w-md">
              <div
                role="status"
                aria-live="polite"
                aria-atomic="true"
                aria-label={t('security.alarm.code.entered')}
                className={`${numpadDisplayClassName} mx-auto border border-white/10 bg-black/16 text-center ${securitySurface.primaryTextClassName}`}
              >
                {maskedCodeValue}
              </div>
              <div className="mt-4 mx-auto grid w-fit gap-2.5">
                {[
                  [null, '1', '2', '3', null],
                  [null, '4', '5', '6', null],
                  [null, '7', '8', '9', null],
                  [null, 'Cancel', '0', null, null],
                ].map((row, rowIndex) => (
                  <div
                    key={`dialog-row-${rowIndex}`}
                    className="grid grid-cols-5 justify-items-center gap-2.5"
                  >
                    {row.map((key, columnIndex) =>
                      key ? (
                        <Button
                          key={`${rowIndex}-${columnIndex}-${key}`}
                          variant="ghost"
                          size="small"
                          aria-label={key === 'Cancel' ? t('security.alarm.code.clear') : undefined}
                          className={`${numpadKeyClassName} ${numpadButtonClassName}`}
                          disabled={unavailable || Boolean(pendingForSelectedAlarm)}
                          onClick={() => {
                            if (key === 'Cancel') {
                              setCode('');
                              return;
                            }

                            setCode((current) => `${current}${key}`);
                          }}
                        >
                          {key === 'Cancel' ? <X className="h-4 w-4" /> : key}
                        </Button>
                      ) : (
                        <div
                          key={`${rowIndex}-${columnIndex}-spacer`}
                          className={numpadKeyClassName}
                        />
                      )
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <CardDialogFooter className="mt-5 flex items-center justify-end gap-2">
            <Button
              variant="soft"
              loading={pendingForSelectedAlarm?.action === draftAction}
              disabled={
                unavailable ||
                Boolean(pendingForSelectedAlarm) ||
                (requiresCode && code.trim().length === 0) ||
                draftAction === null
              }
              onClick={() => void (draftAction ? submitAction(draftAction) : undefined)}
            >
              {actionAwaitingCode
                ? t('security.alarm.code.confirmAction', { action: actionAwaitingCode })
                : t('security.alarm.code.confirm')}
            </Button>
          </CardDialogFooter>
        </CardDialogBody>
      </BaseCardDialog>

      <AlertDialog
        open={triggerAction?.alarmId === selectedAlarm.id}
        onOpenChange={(open) => {
          if (!open) {
            setTriggerAction(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('security.alarm.triggerConfirm.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('security.alarm.triggerConfirm.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmedTrigger}>
              {t('security.alarm.triggerConfirm.action')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export const AlarmPanelCard = SecurityPanelCard;
