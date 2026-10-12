import { Button } from '@navet/app/components/primitives/button';
import { Input } from '@navet/app/components/primitives/input';
import { InteractivePill } from '@navet/app/components/primitives/interactive-pill';
import { EntityRoomSelector } from '@navet/app/components/shared/entity-room-selector';
import {
  getSegmentedControlSelectionStyle,
  getSegmentedControlStyles,
} from '@navet/app/components/shared/theme/segmented-control-styles';
import { getThemeColorValue } from '@navet/app/components/shared/theme/theme-colors';
import {
  getThemeFocusRingClassName,
  navetTypographyTokens,
} from '@navet/app/components/system/tokens';
import { cn } from '@navet/app/components/ui/utils';
import { useI18n, useIntegrationStore, useTheme } from '@navet/app/hooks';
import type { ThemeType } from '@navet/app/hooks/use-theme';
import { integrationAdminService } from '@navet/app/services/integration-admin.service';
import { integrationSelectors } from '@navet/app/stores/selectors';
import { getProviderEntityTypeLabel } from '@navet/app/utils/provider-entity-label';
import { getProviderNativeId } from '@navet/app/utils/provider-ids';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, type LucideIcon, X } from 'lucide-react';
import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  memo,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';

interface CardDialogHeaderProps {
  presentation?: 'default' | 'compact';
  titleEditing?: boolean;
  onTitleEditingChange?: (editing: boolean) => void;
  title: string;
  description?: string;
  entityId?: string;
  eyebrow?: ReactNode;
  showRoomSelector?: boolean;
  forceDarkRoomSelector?: boolean;
  roomSelectorFallbackRoomName?: string;
  roomSelectorClassName?: string;
  roomSelectorCompactContentStyle?: CSSProperties;
  editableTitle?: boolean;
  onTitleChange?: (title: string) => void | Promise<void>;
  trailing?: ReactNode;
  supportingContent?: ReactNode;
  className?: string;
  theme?: ThemeType;
  titleStyle?: CSSProperties;
  descriptionStyle?: CSSProperties;
  actionButtonStyle?: CSSProperties;
}

interface CardDialogSectionProps {
  children: ReactNode;
  className?: string;
  helperText?: string;
  helperTextClassName?: string;
  label?: ReactNode;
  labelClassName?: string;
}

interface CardDialogBodyProps {
  children: ReactNode;
  className?: string;
}

interface CardDialogTabTriggerProps {
  active: boolean;
  children: ReactNode;
  accentColor?: string;
  icon?: LucideIcon;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
}

interface CardDialogChoicePillProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  active?: boolean;
  accentColor?: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  size?: 'default' | 'small' | 'compact';
  style?: CSSProperties;
}

interface CardDialogDoneFooterProps {
  label: string;
  className?: string;
  style?: CSSProperties;
}

export const CardDialogHeader = memo(function CardDialogHeader({
  presentation = 'default',
  titleEditing,
  onTitleEditingChange,
  title,
  description,
  entityId,
  eyebrow,
  showRoomSelector = true,
  forceDarkRoomSelector = false,
  roomSelectorFallbackRoomName,
  roomSelectorClassName,
  roomSelectorCompactContentStyle,
  editableTitle = true,
  onTitleChange,
  trailing,
  supportingContent,
  className,
  theme = 'dark',
  titleStyle,
  descriptionStyle,
  actionButtonStyle,
}: CardDialogHeaderProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [internalTitleEditing, setInternalTitleEditing] = useState(false);
  const isEditingTitle = titleEditing ?? internalTitleEditing;
  const setIsEditingTitle = (editing: boolean) => {
    setInternalTitleEditing(editing);
    onTitleEditingChange?.(editing);
  };
  const [displayTitle, setDisplayTitle] = useState(title);
  const [draftTitle, setDraftTitle] = useState(title);
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const canEditTitle = Boolean(editableTitle && (entityId || onTitleChange));
  const providerSessions = useIntegrationStore(integrationSelectors.providerSessions);
  const connectedProviderCount = Object.keys(providerSessions).length;
  const resolvedDescription =
    getProviderEntityTypeLabel(entityId, description, connectedProviderCount > 1) ?? description;
  const roomSelector =
    showRoomSelector && entityId ? (
      <EntityRoomSelector
        entityId={entityId}
        compact
        compactVariant="plain"
        forceDark={forceDarkRoomSelector}
        fallbackRoomName={roomSelectorFallbackRoomName}
        compactContentStyle={roomSelectorCompactContentStyle}
        className={cn('shrink-0', roomSelectorClassName)}
      />
    ) : null;
  const editLabel = t('entityNameEditor.edit', { name: '' }).trim();
  const resolvedEyebrow = eyebrow ?? (presentation === 'compact' ? null : roomSelector);
  const titleClassName = theme === 'light' ? 'text-slate-950' : 'text-white';
  const descriptionClassName = theme === 'light' ? 'text-slate-700' : 'text-white/82';
  const descriptionSeparatorClassName = theme === 'light' ? 'text-slate-400' : 'text-white/40';
  const editLinkClassName = theme === 'light' ? 'hover:text-slate-950' : 'hover:text-white';
  const actionButtonClassName =
    theme === 'light'
      ? 'border-slate-300/80 bg-slate-100/90 text-slate-700 hover:bg-slate-200/90 hover:text-slate-950'
      : 'border-white/12 bg-white/8 text-white/82 hover:bg-white/12 hover:text-white';
  const titleInputClassName =
    theme === 'light'
      ? 'h-9 bg-slate-100/95 text-base font-semibold text-slate-950 placeholder:text-slate-400'
      : 'h-9 bg-white/10 text-base font-semibold text-white placeholder:text-white/45';

  useEffect(() => {
    setDisplayTitle(title);
  }, [title]);

  useEffect(() => {
    if (!isEditingTitle) {
      setDraftTitle(displayTitle);
    }
  }, [displayTitle, isEditingTitle]);

  useEffect(() => {
    if (isEditingTitle) {
      inputRef.current?.focus();
      const titleLength = inputRef.current?.value.length ?? 0;
      inputRef.current?.setSelectionRange(titleLength, titleLength);
    }
  }, [isEditingTitle]);

  const cancelTitleEdit = () => {
    setDraftTitle(displayTitle);
    setIsEditingTitle(false);
  };

  const saveTitleEdit = async () => {
    if (!entityId && !onTitleChange) {
      return;
    }

    const nextTitle = draftTitle.trim();
    if (!nextTitle) {
      toast.error(t('entityNameEditor.empty'));
      return;
    }

    if (nextTitle === displayTitle.trim()) {
      setIsEditingTitle(false);
      return;
    }

    setIsSavingTitle(true);
    try {
      if (onTitleChange) {
        await onTitleChange(nextTitle);
      } else if (entityId) {
        await integrationAdminService.updateEntityName(entityId, nextTitle);
      }
      setDisplayTitle(nextTitle);
      if (entityId && !onTitleChange) {
        toast.success(t('entityNameEditor.saved', { name: nextTitle }));
      }
      setIsEditingTitle(false);
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : t('entityNameEditor.failed');
      toast.error(message);
    } finally {
      setIsSavingTitle(false);
    }
  };

  return (
    <div className={cn('mb-4 flex items-start justify-between gap-4 max-sm:pr-14', className)}>
      <div className="min-w-0">
        {presentation === 'compact' ? (
          <div
            className={cn(
              'flex min-w-0 items-center gap-1.5 text-xs font-medium',
              descriptionClassName
            )}
          >
            {resolvedEyebrow}
            {resolvedEyebrow && resolvedDescription ? <span aria-hidden="true">·</span> : null}
            {resolvedDescription ? (
              <Dialog.Description asChild>
                <span className="shrink-0" style={descriptionStyle}>
                  {resolvedDescription}
                </span>
              </Dialog.Description>
            ) : null}
          </div>
        ) : (
          resolvedEyebrow
        )}
        <div className={cn('flex min-w-0 items-center', isEditingTitle ? 'gap-4' : 'gap-2')}>
          <Dialog.Title asChild>
            <h2
              className={cn(
                navetTypographyTokens.sectionHeading,
                'min-w-0',
                titleClassName,
                isEditingTitle ? 'flex-1' : 'truncate'
              )}
              style={titleStyle}
            >
              {isEditingTitle ? (
                <Input
                  ref={inputRef}
                  aria-label={t('entityNameEditor.inputLabel')}
                  value={draftTitle}
                  disabled={isSavingTitle}
                  size="small"
                  variant="soft"
                  containerClassName="min-w-0"
                  inputClassName={titleInputClassName}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void saveTitleEdit();
                    }

                    if (event.key === 'Escape') {
                      event.preventDefault();
                      cancelTitleEdit();
                    }
                  }}
                />
              ) : (
                displayTitle
              )}
            </h2>
          </Dialog.Title>
          {canEditTitle ? (
            isEditingTitle ? (
              <div className="flex shrink-0 items-center gap-2.5">
                <button
                  type="button"
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                    actionButtonClassName
                  )}
                  aria-label={t('entityNameEditor.save')}
                  disabled={isSavingTitle}
                  onClick={() => void saveTitleEdit()}
                  style={actionButtonStyle}
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                    actionButtonClassName
                  )}
                  aria-label={t('common.cancel')}
                  disabled={isSavingTitle}
                  onClick={cancelTitleEdit}
                  style={actionButtonStyle}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : null
          ) : null}
        </div>
        {presentation !== 'compact' &&
        (resolvedDescription || (canEditTitle && !isEditingTitle)) ? (
          <Dialog.Description asChild>
            <div
              className={cn(
                '-mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5',
                navetTypographyTokens.label,
                descriptionClassName
              )}
              style={descriptionStyle}
            >
              {resolvedDescription ? (
                <span className="min-w-0 whitespace-normal break-words">{resolvedDescription}</span>
              ) : null}
              {canEditTitle && !isEditingTitle ? (
                <>
                  {resolvedDescription ? (
                    <span aria-hidden="true" className={descriptionSeparatorClassName}>
                      •
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className={cn(
                      "relative inline-flex h-7 shrink-0 items-center text-inherit [font:inherit] transition-colors after:absolute after:inset-x-0 after:-inset-y-2 after:content-['']",
                      editLinkClassName
                    )}
                    aria-label={t('entityNameEditor.edit', { name: displayTitle })}
                    onClick={() => setIsEditingTitle(true)}
                  >
                    {editLabel}
                  </button>
                </>
              ) : null}
            </div>
          </Dialog.Description>
        ) : null}
        {entityId && presentation !== 'compact' ? (
          <p className={cn('mt-1 text-xs', descriptionClassName)} style={descriptionStyle}>
            <span>{t('common.entityId')}: </span>
            <code className="select-text whitespace-normal [overflow-wrap:anywhere]">
              {getProviderNativeId(entityId)}
            </code>
          </p>
        ) : null}
        {supportingContent ? <div className="mt-2 min-w-0">{supportingContent}</div> : null}
      </div>

      <div
        className={cn(
          'flex shrink-0 items-center gap-2',
          isEditingTitle ? 'max-sm:hidden' : undefined
        )}
      >
        {trailing}
        <Dialog.Close asChild>
          <button
            type="button"
            data-cover-sheet-inline-dismiss
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors',
              actionButtonClassName
            )}
            aria-label={t('common.close')}
            style={actionButtonStyle}
          >
            <X className="h-4 w-4" />
          </button>
        </Dialog.Close>
      </div>
    </div>
  );
});

export function CardDialogBody({ children, className }: CardDialogBodyProps) {
  return <div className={cn('w-full min-w-0 p-6 max-sm:p-4', className)}>{children}</div>;
}

export const CardDialogSection = memo(function CardDialogSection({
  children,
  className,
  helperText,
  helperTextClassName,
  label,
  labelClassName,
}: CardDialogSectionProps) {
  const { theme } = useTheme();
  const resolvedLabelClassName = theme === 'light' ? 'text-slate-950' : 'text-white';
  const resolvedHelperTextClassName = theme === 'light' ? 'text-slate-700' : 'text-white/82';

  return (
    <div className={cn('mb-6 min-w-0 last:mb-0', className)}>
      {label ? (
        <div className={cn('mb-1 text-sm font-medium', resolvedLabelClassName, labelClassName)}>
          {label}
        </div>
      ) : null}
      {helperText ? (
        <p
          className={cn(
            'mb-3',
            navetTypographyTokens.helper,
            resolvedHelperTextClassName,
            helperTextClassName
          )}
        >
          {helperText}
        </p>
      ) : null}
      {children}
    </div>
  );
});

export function CardDialogTabList({
  children,
  className,
  segmented = false,
}: {
  children: ReactNode;
  className?: string;
  segmented?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <div
      className={cn(
        segmented
          ? cn(getSegmentedControlStyles(theme).shell, 'mt-1 mb-4 flex w-full flex-wrap')
          : 'mt-1 mb-4 inline-flex items-center gap-1',
        className
      )}
    >
      {children}
    </div>
  );
}

export const CardDialogTabTrigger = memo(function CardDialogTabTrigger({
  active,
  children,
  accentColor,
  icon,
  onClick,
  className,
  style,
}: CardDialogTabTriggerProps) {
  const { theme, accentColor: themeAccentColor, primaryColor } = useTheme();
  const segmented = getSegmentedControlStyles(theme);
  const selectedColor = accentColor ?? (themeAccentColor || getThemeColorValue(primaryColor));
  const Icon = icon;
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        segmented.option,
        segmented.button,
        getThemeFocusRingClassName(theme),
        className
      )}
      onClick={onClick}
      style={style}
    >
      {Icon ? <Icon aria-hidden="true" className="h-4 w-4 shrink-0" /> : null}
      <span className="min-w-0 break-words">{children}</span>
      {active ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-full"
          style={getSegmentedControlSelectionStyle(selectedColor)}
        />
      ) : null}
    </button>
  );
});

export const CardDialogChoicePill = memo(function CardDialogChoicePill({
  active = false,
  accentColor,
  children,
  className,
  onClick,
  size = 'default',
  style,
  ...props
}: CardDialogChoicePillProps) {
  return (
    <InteractivePill
      active={active}
      accentColor={accentColor}
      onClick={onClick}
      className={cn('min-w-22', className)}
      size={size}
      style={style}
      {...props}
    >
      {children}
    </InteractivePill>
  );
});

export function CardDialogFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mt-6 flex flex-nowrap items-center justify-end gap-2 max-sm:pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] [&>*:first-child:not(:only-child)]:mr-auto',
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardDialogDoneFooter({ label, className, style }: CardDialogDoneFooterProps) {
  return (
    <CardDialogFooter>
      <Dialog.Close asChild>
        <Button variant="soft" className={className} style={style}>
          {label}
        </Button>
      </Dialog.Close>
    </CardDialogFooter>
  );
}
