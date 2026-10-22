import { DndContext } from '@dnd-kit/core';
import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { useTheme } from '@navet/app/hooks';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { ColumnCanvas } from './home-dashboard-overview-column-canvas';

function EditColumnsStory() {
  const { theme, accentColor } = useTheme();
  const surface = getThemeSurfaceTokens(theme);

  return (
    <div className={`min-h-[25rem] p-4 sm:p-6 ${surface.appBg} ${surface.textPrimary}`}>
      <DndContext>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { id: 'daily-controls', column: 'Column 1', section: 'Daily controls' },
            { id: 'at-a-glance', column: 'Column 2', section: 'At a glance' },
          ].map(({ id, column, section }) => (
            <ColumnCanvas
              key={id}
              columnId={id}
              columnTitle={column}
              isPreviewHidden={false}
              accentColor={accentColor}
              surface={surface}
            >
              <div className="space-y-3">
                <p className="text-sm font-semibold">{section}</p>
                <div className={`h-36 rounded-[24px] border ${surface.border} ${surface.panel}`} />
              </div>
            </ColumnCanvas>
          ))}
        </div>
      </DndContext>
    </div>
  );
}

const meta = {
  title: 'Pages/Dashboard/Edit Columns',
  component: EditColumnsStory,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof EditColumnsStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const FolderTabs: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const headers = canvasElement.querySelectorAll('[data-dashboard-column-header]');
    const tabs = canvasElement.querySelectorAll('[data-folder-tab]');
    const startRules = canvasElement.querySelectorAll('[data-folder-tab-rule="start"]');
    const endRules = canvasElement.querySelectorAll('[data-folder-tab-rule="end"]');

    await expect(headers).toHaveLength(2);
    await expect(tabs).toHaveLength(2);
    await expect(startRules).toHaveLength(2);
    await expect(endRules).toHaveLength(2);
    await expect(getComputedStyle(headers[0]).borderBottomWidth).toBe('0px');
    await expect(getComputedStyle(startRules[0]).borderBottomWidth).toBe('1px');
    await expect(getComputedStyle(endRules[0]).borderBottomWidth).toBe('1px');
    await expect(getComputedStyle(tabs[0]).borderBottomWidth).toBe('0px');
    await expect(getComputedStyle(tabs[0]).backgroundColor).toMatch(/[/,] 0\.08\)$/);
    await expect(tabs[0].getBoundingClientRect().left).toBeGreaterThan(
      headers[0].getBoundingClientRect().left
    );
    await expect(canvas.getByText('Column 1')).toBeVisible();
    await expect(canvas.getByText('Column 2')).toBeVisible();
    const firstHandle = canvas.getByRole('button', { name: 'Move Column 1 section' });
    await expect(firstHandle).toBeVisible();
    await expect(getComputedStyle(firstHandle).borderTopWidth).toBe('0px');
    await expect(canvas.getByRole('button', { name: 'Move Column 2 section' })).toBeVisible();
  },
};

export const Phone: Story = {
  globals: {
    viewport: { value: 'mobile1', isRotated: false },
  },
  play: async ({ canvasElement }) => {
    const headers = canvasElement.querySelectorAll('[data-dashboard-column-header]');
    const tabs = canvasElement.querySelectorAll('[data-folder-tab]');

    await expect(headers).toHaveLength(2);
    await expect(tabs).toHaveLength(2);
    await expect(tabs[0].getBoundingClientRect().right).toBeLessThanOrEqual(
      headers[0].getBoundingClientRect().right
    );
    await expect(tabs[1].getBoundingClientRect().right).toBeLessThanOrEqual(
      headers[1].getBoundingClientRect().right
    );
  },
};
