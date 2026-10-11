import { getCardReadableTextTokens } from '@navet/app/components/shared/theme/card-readable-text-tokens';
import { getCardShellSurfaceTokens } from '@navet/app/components/shared/theme/card-shell-surface-tokens';
import {
  getCardStateSurfaceStyleTokens,
  getCardStateSurfaceTokens,
} from '@navet/app/components/shared/theme/card-state-surface-tokens';
import { getEntityIconPillStyles } from '@navet/app/components/shared/theme/entity-icon-pill-styles';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import type { ThemeType } from '@navet/app/hooks/use-theme';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { AlertTriangle, Lightbulb, ShieldCheck, Zap } from 'lucide-react';

const THEMES: ThemeType[] = ['glass', 'dark', 'light', 'black'];

const STATE_VARIANTS = [
  {
    key: 'off',
    label: 'Off',
    isActive: false,
    tone: 'neutral' as const,
    baseColor: null,
    primaryColor: 'orange' as const,
    Icon: Lightbulb,
  },
  {
    key: 'on',
    label: 'On',
    isActive: true,
    tone: 'primary' as const,
    baseColor: '#f97316',
    primaryColor: 'orange' as const,
    Icon: Zap,
  },
  {
    key: 'special',
    label: 'Special',
    isActive: true,
    tone: 'blue' as const,
    baseColor: '#3b82f6',
    primaryColor: 'blue' as const,
    Icon: ShieldCheck,
  },
  {
    key: 'danger',
    label: 'Danger',
    isActive: true,
    tone: 'red' as const,
    baseColor: '#ef4444',
    primaryColor: 'red' as const,
    Icon: AlertTriangle,
  },
] as const;

function getFrameClassName(theme: ThemeType) {
  if (theme === 'light') {
    return 'bg-[linear-gradient(180deg,#f5f7fb,#e7edf6)]';
  }

  if (theme === 'black') {
    return 'bg-neutral-950';
  }

  if (theme === 'glass') {
    return 'bg-[radial-gradient(circle_at_top_left,#1e293b,transparent_45%),linear-gradient(180deg,#020617,#0f172a)]';
  }

  return 'bg-[radial-gradient(circle_at_top_center,rgba(249,115,22,0.08),transparent_42%),linear-gradient(180deg,#22131a,#1a1117)]';
}

function StateCardReference({
  theme,
  variant,
}: {
  theme: ThemeType;
  variant: (typeof STATE_VARIANTS)[number];
}) {
  const surface = getThemeSurfaceTokens(theme);
  const shell = getCardShellSurfaceTokens(theme);
  const state = getCardStateSurfaceTokens(theme, variant.isActive);
  const stateStyle = getCardStateSurfaceStyleTokens({
    theme,
    isActive: variant.isActive,
    baseColor: variant.baseColor,
  });
  const iconStyles = getEntityIconPillStyles({
    isActive: variant.isActive,
    isInteractive: false,
    primaryColor: variant.primaryColor,
    accentColor: variant.baseColor ?? '#f97316',
    size: 'medium',
    theme,
    tone: variant.isActive ? variant.tone : 'neutral',
  });
  const readableText = getCardReadableTextTokens({
    theme,
    tone: variant.isActive ? variant.tone : 'neutral',
    accentColor: variant.baseColor,
    baseColor: variant.baseColor,
  });
  const activeGlowStyle =
    variant.isActive && variant.baseColor
      ? {
          background: `linear-gradient(135deg, ${variant.baseColor}2e 0%, transparent 72%)`,
        }
      : undefined;

  return (
    <article
      className={`relative h-55 w-90 overflow-visible rounded-[32px] p-3 ${getFrameClassName(theme)}`}
    >
      {variant.baseColor ? (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute -inset-full z-0 blur-3xl ${
            theme === 'light' ? 'opacity-40' : 'opacity-20'
          }`}
          style={{
            background: `radial-gradient(circle, ${variant.baseColor} 0%, transparent 70%)`,
          }}
        />
      ) : null}

      <div
        className={`relative z-10 h-full w-full overflow-hidden rounded-3xl ${
          theme !== 'dark' ? 'border' : ''
        } p-4 transition-all duration-500 ${shell.backdropClassName} ${surface.panel} ${surface.border} ${state.containerClassName}`}
        style={stateStyle.cardStyle}
      >
        {activeGlowStyle ? (
          <div
            aria-hidden="true"
            className="absolute inset-0 transition-all duration-500"
            style={activeGlowStyle}
          />
        ) : null}
        {stateStyle.innerOverlayClassName ? (
          <div
            aria-hidden="true"
            className={stateStyle.innerOverlayClassName}
            style={stateStyle.innerOverlayStyle}
          />
        ) : null}
        {stateStyle.shineOverlayClassName ? (
          <div aria-hidden="true" className={stateStyle.shineOverlayClassName} />
        ) : null}

        <div className="relative flex h-full flex-col">
          <div className="mb-2 flex items-start gap-3">
            <div className="shrink-0">
              <div className={iconStyles.badgeClassName} style={iconStyles.badgeStyle}>
                <variant.Icon className={iconStyles.iconClassName} style={iconStyles.iconStyle} />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p
                className={`truncate text-[10px] tracking-normal ${surface.textMuted} ${state.mutedTextClassName}`}
                style={{ color: readableText.subtitleColor }}
              >
                Shared card state
              </p>
              <h4
                className={`truncate text-xs font-semibold ${state.primaryTextClassName}`}
                style={{ color: readableText.titleColor }}
              >
                {variant.label} surface
              </h4>
            </div>
          </div>

          <div className="mt-auto flex flex-1 flex-col justify-end gap-3">
            <div
              className={`rounded-2xl border px-3 py-2.5 ${surface.border} ${surface.panelMuted}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span
                  className={`text-xs font-medium ${state.secondaryTextClassName}`}
                  style={{ color: readableText.subtitleColor }}
                >
                  State label
                </span>
                <span
                  className={`text-sm font-semibold ${state.primaryTextClassName}`}
                  style={{ color: readableText.titleColor }}
                >
                  {variant.label}
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <div
                className={`h-9 flex-1 rounded-full border ${surface.border} ${surface.subtleBg}`}
              />
              <div
                className={`h-9 w-9 rounded-full border ${surface.border} ${surface.subtleBg}`}
              />
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function CardStateSurfaceTokensShowcase() {
  return (
    <div className="space-y-4">
      {THEMES.map((theme) => {
        const surface = getThemeSurfaceTokens(theme);

        return (
          <section
            key={theme}
            className={`rounded-3xl border p-4 ${surface.border} ${surface.panelMuted}`}
          >
            <p className={`text-xs font-semibold uppercase tracking-[0.2em] ${surface.textMuted}`}>
              {theme}
            </p>

            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              {STATE_VARIANTS.map((variant) => (
                <div key={`${theme}-${variant.key}`} className="space-y-2">
                  <p
                    className={`text-xs font-semibold uppercase tracking-[0.18em] ${surface.textMuted}`}
                  >
                    {variant.label}
                  </p>
                  <StateCardReference theme={theme} variant={variant} />
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

const meta = {
  title: 'Theme/Card State Surface',
  component: CardStateSurfaceTokensShowcase,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: [
          'Reference preview for shared card-state semantics across all themes using generic card composition instead of a single feature card.',
          '',
          'What this story proves:',
          '- Reusable `off`, `on`, `special`, and `danger` state surfaces in the same shell.',
          '- Interaction between state text tokens, shared active-surface styling, shell tokens, and readable text helpers.',
          '',
          'Use this story when:',
          '- Treat this page as the canonical visual check before adjusting repeated card-state logic.',
          '- Prefer updating shared state/surface helpers instead of patching per-feature card state styles.',
          '',
          'Review before merging:',
          '- Active cards should read energetic but still readable.',
          '- Special-state cards should feel distinct without becoming a separate shell system.',
          '- Inactive cards should feel clearly subdued while preserving essential legibility.',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof CardStateSurfaceTokensShowcase>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Docs: Story = {
  parameters: {
    docsOnly: true,
  },
};
