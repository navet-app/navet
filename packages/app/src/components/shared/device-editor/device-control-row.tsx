import { Button } from '@navet/app/components/primitives/button';
import { Switch } from '@navet/app/components/primitives/switch';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { getThemeFocusRingClassName } from '@navet/app/components/system/tokens';
import { cn } from '@navet/app/components/ui/utils';
import { useI18n, useTheme } from '@navet/app/hooks';
import type { ThemeType } from '@navet/app/hooks/use-theme';
import { ChevronRight } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';

type DeviceControlRowProps = {
  label: string;
  value?: ReactNode;
  icon?: ReactNode;
  status?: ReactNode;
  theme?: ThemeType;
} & (
  | { kind: 'disclosure'; children: ReactNode }
  | {
      kind: 'toggle';
      checked: boolean;
      disabled?: boolean;
      onCheckedChange: (checked: boolean) => void;
    }
  | { kind: 'action'; disabled?: boolean; onAction: () => void }
  | { kind: 'reading' }
);

/** Secondary device controls. The feature owns capabilities, commands and status copy. */
export function DeviceControlRow(props: DeviceControlRowProps) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const surfaceTheme = props.theme ?? theme;
  const surface = getThemeSurfaceTokens(surfaceTheme);
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const descriptionIds =
    [props.value != null ? `${id}-value` : '', props.status ? `${id}-status` : '']
      .filter(Boolean)
      .join(' ') || undefined;
  const heading = (
    <>
      {props.icon ? (
        <span
          aria-hidden="true"
          className={cn('flex h-4 w-4 shrink-0 items-center justify-center', surface.textSecondary)}
        >
          {props.icon}
        </span>
      ) : null}
      <span id={`${id}-label`} className="min-w-0 flex-1 break-words text-left">
        {props.label}
      </span>
      {props.value != null ? (
        <span
          id={`${id}-value`}
          className={cn('min-w-0 max-w-[50%] break-words text-right', surface.textSecondary)}
        >
          {props.value}
        </span>
      ) : null}
    </>
  );
  const rowClassName = cn(
    'flex min-h-10 w-full items-center gap-3 text-sm',
    props.kind === 'action' || props.kind === 'toggle' ? 'py-0' : 'py-2',
    surface.textPrimary
  );
  return (
    <div className={cn('border-b last:border-b-0', surface.dividerBorder)}>
      {props.kind === 'disclosure' ? (
        <>
          <button
            type="button"
            aria-label={props.label}
            aria-expanded={expanded}
            aria-controls={`${id}-content`}
            aria-describedby={descriptionIds}
            onClick={() => setExpanded((value) => !value)}
            className={cn(rowClassName, 'rounded-lg', getThemeFocusRingClassName(surfaceTheme))}
          >
            {heading}
            <ChevronRight
              aria-hidden="true"
              className={cn('h-4 w-4 shrink-0', expanded && 'rotate-90')}
            />
          </button>
          <section id={`${id}-content`} aria-label={props.label} hidden={!expanded}>
            <div className="pb-3 pt-1">{props.children}</div>
          </section>
        </>
      ) : (
        <div className={rowClassName}>
          {heading}
          {props.kind === 'toggle' ? (
            <Switch
              size="compact"
              aria-label={props.label}
              aria-describedby={descriptionIds}
              checked={props.checked}
              disabled={props.disabled}
              onCheckedChange={props.onCheckedChange}
              className="shrink-0"
            />
          ) : props.kind === 'action' ? (
            <Button
              size="compact"
              variant="ghost"
              className="min-w-9 shrink-0 justify-end px-0"
              aria-labelledby={`${id}-action ${id}-label`}
              aria-describedby={descriptionIds}
              disabled={props.disabled}
              onClick={props.onAction}
            >
              <span className="flex items-center gap-3">
                <span id={`${id}-action`}>{t('common.run')}</span>
                <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0" />
              </span>
            </Button>
          ) : null}
        </div>
      )}
      {props.status ? (
        <div id={`${id}-status`} className={cn('pb-2 text-sm', surface.textSecondary)}>
          {props.status}
        </div>
      ) : null}
    </div>
  );
}
