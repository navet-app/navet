import { useDashboardEntitiesStore } from '@navet/app/features/dashboard/stores/dashboard-entities-store';

export const DEMO_HIDDEN_ENTITY_IDS = [
  'home_assistant:weather.home',
  'home_assistant:input_boolean.guest_mode',
  'home_assistant:sensor.living_room_temp',
];

/** Give recovery controls a repeatable fixture without retaining changes outside the demo. */
export function installDemoEntityVisibility() {
  const { hiddenEntityIds, shownSensorEntityIds, explicitlyShownEntityIds } =
    useDashboardEntitiesStore.getState();
  useDashboardEntitiesStore.setState({
    hiddenEntityIds: [...DEMO_HIDDEN_ENTITY_IDS],
    shownSensorEntityIds: [],
    explicitlyShownEntityIds: [],
  });

  return () => {
    useDashboardEntitiesStore.setState({
      hiddenEntityIds,
      shownSensorEntityIds,
      explicitlyShownEntityIds,
    });
  };
}
