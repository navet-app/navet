import { getCardReadableTextTokens } from '@navet/app/components/shared/theme/card-readable-text-tokens';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { getAccentCardShellTokens } from '@navet/app/components/system/tokens';
import type { ThemeType } from '@navet/app/hooks/use-theme';
import type { Meta, StoryObj } from '@storybook/react-vite';

const THEMES: ThemeType[] = ['glass', 'dark', 'light', 'black'];
const ACCENTS = ['yellow', 'green', 'teal', 'blue', 'purple', 'amber', 'emerald'] as const;
const THEME_LABELS: Record<ThemeType, string> = {
  glass: 'glass',
  dark: 'dark',
  light: 'light',
  black: 'black',
};

function AccentCardShellTokensShowcase() {
  return (
    <div className="space-y-6">
      {THEMES.map((theme) => (
        <section key={theme} className="space-y-3">
          <h3
            className={`text-xs font-semibold uppercase tracking-[0.22em] ${getThemeSurfaceTokens(theme).textMuted}`}
          >
            {THEME_LABELS[theme]}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {ACCENTS.map((accent) => {
              const shell = getAccentCardShellTokens(theme, accent);
              const surface = getThemeSurfaceTokens(theme);
              const readableText =
                theme === 'light'
                  ? null
                  : getCardReadableTextTokens({
                      theme,
                      tone: accent,
                    });

              return (
                <article
                  key={`${theme}-${accent}`}
                  className={`relative overflow-hidden rounded-3xl border p-3 ${shell.containerClassName}`}
                >
                  <div
                    aria-hidden="true"
                    className={`pointer-events-none absolute inset-0 ${shell.glowClassName}`}
                  />
                  {shell.overlayClassName ? (
                    <div
                      aria-hidden="true"
                      className={`pointer-events-none absolute inset-0 ${shell.overlayClassName}`}
                    />
                  ) : null}
                  <div className="relative z-10">
                    <p
                      className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${surface.textSecondary}`}
                      style={readableText ? { color: readableText.titleColor } : undefined}
                    >
                      {accent}
                    </p>
                    <p
                      className={`mt-1 text-xs ${surface.textMuted}`}
                      style={readableText ? { color: readableText.subtitleColor } : undefined}
                    >
                      container, glow, overlay token tuple
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

const meta = {
  title: 'Theme/Accent Card Shell',
  component: AccentCardShellTokensShowcase,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: [
          'Preview matrix for `getAccentCardShellTokens(theme, accent)`, showing the shared accent-shell container, glow, and optional overlay layers across all accent families.',
          '',
          'What the token returns:',
          '- `containerClassName` for the shell background and border treatment',
          '- `glowClassName` for the accent glow layer',
          '- `overlayClassName` for optional highlight or sheen treatment',
          '',
          'Theme expectations:',
          '- `glass` keeps the frosted translucent treatment and soft accent bloom',
          '- `dark` uses tinted dark gradients with accent-led readable text',
          '- `light` keeps stronger visible accent separation so cards do not wash back to white',
          '- `black` is intentionally not the same as dark; it uses a dedicated black-theme branch with subtler accent light over a true black base',
          '',
          'Text behavior:',
          '- Light rows use the theme surface text tokens directly',
          '- Glass, dark, and black rows use `getCardReadableTextTokens(...)` so text contrast follows the same readable-text system used by production tinted cards',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof AccentCardShellTokensShowcase>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Docs: Story = {
  parameters: {
    docsOnly: true,
  },
};
