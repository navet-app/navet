import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { getCardShellSurfaceTokens } from '@navet/app/components/system/tokens';
import type { ThemeType } from '@navet/app/hooks/use-theme';
import type { Meta, StoryObj } from '@storybook/react-vite';

const THEMES: ThemeType[] = ['glass', 'dark', 'light', 'black'];

function CardShellSurfaceTokensShowcase() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {THEMES.map((theme) => {
        const shell = getCardShellSurfaceTokens(theme);
        const surface = getThemeSurfaceTokens(theme);
        const frameClassName =
          theme === 'light'
            ? 'bg-slate-200'
            : theme === 'black'
              ? 'bg-neutral-950'
              : theme === 'glass'
                ? 'bg-[radial-gradient(circle_at_top_left,#1e293b,transparent_45%),linear-gradient(180deg,#020617,#0f172a)]'
                : 'bg-slate-950';
        const previewShellClassName =
          theme === 'light'
            ? `${surface.panel} ${surface.border}`
            : theme === 'black'
              ? `${surface.panel} ${surface.border} shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]`
              : theme === 'glass'
                ? `${surface.panel} ${surface.border} ${surface.cardShadow}`
                : 'border-zinc-700 bg-[linear-gradient(180deg,rgba(39,39,42,0.96),rgba(9,9,11,0.98))] shadow-[0_24px_60px_-36px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.05)]';

        return (
          <article
            key={theme}
            className={`relative overflow-hidden rounded-3xl border p-4 ${surface.border} ${frameClassName}`}
          >
            <div
              className={`relative overflow-hidden rounded-3xl border p-4 ${previewShellClassName} ${shell.backdropClassName}`}
            >
              {shell.sheenOverlayClassName ? (
                <div aria-hidden="true" className={shell.sheenOverlayClassName} />
              ) : null}
              {surface.lightOverlay ? (
                <div aria-hidden="true" className={`absolute inset-0 ${surface.lightOverlay}`} />
              ) : null}
              <p
                className={`text-xs font-semibold uppercase tracking-[0.2em] ${surface.textMuted}`}
              >
                {theme}
              </p>
              <div className="relative z-10 mt-3 space-y-3">
                <div
                  className={`rounded-xl border px-3 py-2 ${surface.border} ${surface.panelMuted}`}
                >
                  <p className={`text-sm font-semibold ${surface.textPrimary}`}>
                    Card shell preview
                  </p>
                  <p className={`mt-1 text-xs ${surface.textSecondary}`}>
                    Backdrop, sheen, and outer shell treatment on a realistic surface.
                  </p>
                </div>
                <div className="flex gap-2">
                  <div
                    className={`h-8 flex-1 rounded-full border ${surface.border} ${surface.subtleBg}`}
                  />
                  <div
                    className={`h-8 w-8 rounded-full border ${surface.border} ${surface.subtleBg}`}
                  />
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

const meta = {
  title: 'Theme/Card Shell Surface',
  component: CardShellSurfaceTokensShowcase,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: [
          'Reference page for `getCardShellSurfaceTokens(theme)` across all theme modes.',
          '',
          'What this story proves:',
          '- Backdrop and sheen-overlay behavior used by shared card shells.',
          '- Interaction between shell tokens and the underlying surface tokens for realistic frame preview.',
          '',
          'Use this story when:',
          '- Apply shell tokens where card chrome is authored; keep feature content styling separate.',
          '- Avoid introducing feature-specific shell effects when shared token output already matches intent.',
          '',
          'Review before merging:',
          '- Shell depth should remain visible without obscuring text/content.',
          '- Theme differences should feel intentional, not like random gradient swaps.',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof CardShellSurfaceTokensShowcase>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Docs: Story = {
  parameters: {
    docsOnly: true,
  },
};
