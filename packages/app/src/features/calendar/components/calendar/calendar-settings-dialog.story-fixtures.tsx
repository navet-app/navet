import { Button } from '@navet/app/components/primitives/button';
import { useTheme } from '@navet/app/hooks';
import { SettingsDialogStoryFrame } from '@navet/app/storybook/story-frames';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { CalendarSettingsDialog } from './calendar-settings-dialog';

function CalendarSettingsDialogStory() {
  const { theme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [tintColor, setTintColor] = useState<string | undefined>('#6366f1');
  const [selectedCalendarIds, setSelectedCalendarIds] = useState([
    'calendar.family',
    'calendar.work',
  ]);

  return (
    <SettingsDialogStoryFrame parentCardClassName="bg-[linear-gradient(180deg,rgba(99,102,241,0.22),rgba(15,23,42,0.28))]">
      <div className="relative flex items-start justify-center p-6">
        <Button variant="secondary" onClick={() => setIsOpen(true)}>
          Open calendar dialog
        </Button>
      </div>
      <CalendarSettingsDialog
        entityId="calendar.family"
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        theme={theme}
        title="Family Calendar"
        calendars={[
          { id: 'calendar.family', name: 'Family', room: 'Home', color: 'bg-indigo-400' },
          { id: 'calendar.work', name: 'Work', room: 'Office', color: 'bg-cyan-400' },
          { id: 'calendar.school', name: 'School', room: 'Kids', color: 'bg-emerald-400' },
        ]}
        selectedCalendarIds={selectedCalendarIds}
        onSelectedCalendarIdsChange={setSelectedCalendarIds}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        tintColor={tintColor}
        onTintColorChange={setTintColor}
      />
    </SettingsDialogStoryFrame>
  );
}

const meta = {
  component: CalendarSettingsDialogStory,
  render: () => <CalendarSettingsDialogStory />,
  tags: ['!autodocs'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof CalendarSettingsDialogStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
