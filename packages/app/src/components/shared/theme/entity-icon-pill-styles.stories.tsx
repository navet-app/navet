import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { getEntityIconPillStyles } from '@navet/app/components/system/tokens';
import type { ThemeType } from '@navet/app/hooks/use-theme';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Lightbulb } from 'lucide-react';

const THEMES: ThemeType[] = ['glass', 'dark', 'light', 'black'];

function EntityIconPillStylesShowcase() {
  return (
    <div className="space-y-4">
      {THEMES.map((theme) => (
        <section
          key={theme}
          className={`rounded-3xl border p-4 ${getThemeSurfaceTokens(theme).border} ${getThemeSurfaceTokens(theme).panelMuted}`}
        >
          <p
            className={`text-xs font-semibold uppercase tracking-[0.2em] ${getThemeSurfaceTokens(theme).textMuted}`}
          >
            {theme}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            {[
              { isActive: true, size: 'small' as const },
              { isActive: false, size: 'small' as const },
              { isActive: true, size: 'large' as const },
              { isActive: false, size: 'large' as const },
            ].map((item) => {
              const icon = getEntityIconPillStyles({
                isActive: item.isActive,
                isInteractive: false,
                primaryColor: 'orange',
                size: item.size,
                theme,
                tone: item.isActive ? 'primary' : 'neutral',
              });

              return (
                <div
                  key={`${theme}-${item.size}-${item.isActive ? 'active' : 'idle'}`}
                  className="inline-flex flex-col items-center gap-1"
                >
                  <span className={icon.badgeClassName} style={icon.badgeStyle}>
                    <Lightbulb className={icon.iconClassName} style={icon.iconStyle} />
                  </span>
                  <span className={`text-[10px] ${getThemeSurfaceTokens(theme).textSecondary}`}>
                    {item.size} {item.isActive ? 'active' : 'idle'}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

const meta = {
  title: 'Theme/Entity Icon Pill Styles',
  component: EntityIconPillStylesShowcase,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: [
          'Computed-style preview for `getEntityIconPillStyles` used by entity card header icon pills.',
          '',
          'What this story proves:',
          '- Active vs idle icon-pill appearance across all themes.',
          '- Size scaling behavior for small and large icon-pill variants.',
          '',
          'Use this story when:',
          '- Use this calculator output directly in card header icon primitives.',
          '- Keep icon-pill semantics stable: active state should be obvious without overpowering neighboring text.',
          '',
          'Review before merging:',
          '- Badge/icon contrast should remain legible in all themes.',
          '- Active and idle variants should be clearly distinguishable at compact sizes.',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof EntityIconPillStylesShowcase>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Docs: Story = {
  parameters: {
    docsOnly: true,
  },
};
