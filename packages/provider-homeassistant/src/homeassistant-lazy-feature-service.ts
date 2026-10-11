import {
  getHomeAssistantConnection,
  getHomeAssistantPanelHass,
} from './homeassistant-service-bridge';

let panelSource: { transport: unknown; userId: string | undefined } | undefined;
function sourceIdentity() {
  const panel = getHomeAssistantPanelHass() as {
    connection?: unknown;
    callWS?: unknown;
    user?: { id?: string } | null;
  } | null;
  if (!panel) return getHomeAssistantConnection();
  const transport = panel.connection ?? panel.callWS;
  if (!transport) return null;
  // Match the panel adapter's session boundary without resetting on ordinary state wrappers.
  if (panelSource?.transport !== transport || panelSource.userId !== panel.user?.id)
    panelSource = { transport, userId: panel.user?.id };
  return panelSource;
}

/** Keep a delayed module load from routing an existing action into a replacement household. */
export function createSessionBoundFeatureLoader<Service>(load: () => Promise<Service>) {
  return async <Result>(
    action: (service: Service) => Result | Promise<Result>,
    getSource: () => unknown = sourceIdentity
  ): Promise<Result> => {
    const source = getSource();
    const service = await load();
    if (source !== getSource()) throw new Error('Home Assistant session changed');
    return action(service);
  };
}
