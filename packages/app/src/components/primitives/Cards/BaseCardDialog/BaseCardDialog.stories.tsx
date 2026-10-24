import { getThemeSurfaceTokens } from '@navet/app/components/shared/theme/theme-surface-tokens';
import { useTheme } from '@navet/app/hooks';
import { getStoryDocsDescription } from '@navet/app/storybook/story-docs';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Palette, Sliders } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../button';
import { BaseCardDialog, type BaseCardDialogTab } from './index';

const meta = {
  title: 'Components/Primitives/Cards/BaseCardDialog',
  component: BaseCardDialog,
  parameters: { docs: { description: {} } },
} satisfies Meta<typeof BaseCardDialog>;

const richComponentDocsDescription = getStoryDocsDescription(meta.title);

meta.parameters = {
  ...meta.parameters,
  docs: {
    ...meta.parameters?.docs,
    description: {
      ...meta.parameters?.docs?.description,
      component: richComponentDocsDescription,
    },
  },
};

export default meta;

type Story = StoryObj<typeof BaseCardDialog>;

function BaseCardDialogStory() {
  const [isOpen, setIsOpen] = useState(false);
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);

  const tabs: BaseCardDialogTab[] = [
    {
      key: 'controls',
      label: 'Controls',
      icon: Sliders,
      content: (
        <div className="space-y-3">
          <div className={`rounded-xl border p-3 ${surface.border} ${surface.subtleBg}`}>
            <p className={`text-sm font-medium ${surface.textPrimary}`}>Brightness: 75%</p>
          </div>
          <div className={`rounded-xl border p-3 ${surface.border} ${surface.subtleBg}`}>
            <p className={`text-sm font-medium ${surface.textPrimary}`}>Color temperature: 4000K</p>
          </div>
        </div>
      ),
    },
    {
      key: 'customize',
      label: 'Customize',
      icon: Palette,
      content: (
        <div className={`rounded-xl border p-3 ${surface.border} ${surface.subtleBg}`}>
          <p className={`text-sm font-medium ${surface.textPrimary}`}>
            Tint and presentation controls
          </p>
        </div>
      ),
    },
  ];

  return (
    <div>
      <Button
        variant="secondary"
        onClick={() => setIsOpen(true)}
        className={`rounded-xl border px-4 py-2 text-sm font-medium ${surface.border} ${surface.textPrimary} ${surface.hoverBg}`}
      >
        Open settings
      </Button>

      <BaseCardDialog
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        title="Light Settings"
        entityId="light.living_room"
        entityType="Light"
        tabs={tabs}
        theme={theme}
      />
    </div>
  );
}

function BaseModalDialogStory() {
  const [isOpen, setIsOpen] = useState(false);
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);

  return (
    <div>
      <Button variant="secondary" onClick={() => setIsOpen(true)}>
        Open modal dialog
      </Button>
      <BaseCardDialog
        variant="modal"
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        title="Room details"
        description="Quick room management"
        theme={theme}
      >
        <div className="space-y-4">
          <div className={`rounded-xl border p-4 ${surface.border} ${surface.subtleBg}`}>
            <p className={`text-sm font-medium ${surface.textPrimary}`}>Kitchen</p>
            <p className={`mt-1 text-sm ${surface.textSecondary}`}>12 visible devices</p>
          </div>
          <div className="flex justify-end">
            <Button variant="soft" size="small" onClick={() => setIsOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      </BaseCardDialog>
    </div>
  );
}

function BaseSheetDialogStory() {
  const [isOpen, setIsOpen] = useState(false);
  const { theme } = useTheme();
  const surface = getThemeSurfaceTokens(theme);

  return (
    <div>
      <Button variant="secondary" onClick={() => setIsOpen(true)}>
        Open sheet dialog
      </Button>
      <BaseCardDialog
        variant="sheet"
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        title="Quick controls"
        description="Bottom-sheet variant"
        theme={theme}
      >
        <div className="space-y-4 px-4 pb-2">
          <div className={`rounded-xl border p-4 ${surface.border} ${surface.subtleBg}`}>
            <p className={`text-sm font-medium ${surface.textPrimary}`}>Scene shortcuts</p>
          </div>
        </div>
      </BaseCardDialog>
    </div>
  );
}

function BaseFullscreenDialogStory({ edgeToEdge = false }: { edgeToEdge?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div>
      <Button variant="secondary" onClick={() => setIsOpen(true)}>
        Open fullscreen dialog
      </Button>
      <BaseCardDialog
        variant="fullscreen"
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        title="Camera viewer"
        edgeToEdge={edgeToEdge}
        description="Fullscreen viewer variant"
        theme="dark"
      >
        <div className="relative flex h-full min-h-[24rem] items-center justify-center bg-black text-white">
          <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/80 to-transparent p-4 text-lg font-semibold">
            Front Door Camera
          </div>
          <div className="text-sm text-white/72">Viewer content</div>
        </div>
      </BaseCardDialog>
    </div>
  );
}

export const Default: Story = {
  render: () => <BaseCardDialogStory />,
  parameters: {
    docs: {
      description: {
        story: 'Base card dialog primitive with tabbed controls and customize content.',
      },
    },
  },
};

export const Modal: Story = {
  render: () => <BaseModalDialogStory />,
};

export const Sheet: Story = {
  render: () => <BaseSheetDialogStory />,
};

export const Fullscreen: Story = {
  render: () => <BaseFullscreenDialogStory />,
};

export const EdgeToEdgeFullscreen: Story = {
  render: () => <BaseFullscreenDialogStory edgeToEdge />,
};
