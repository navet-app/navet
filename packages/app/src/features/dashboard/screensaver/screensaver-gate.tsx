import Screensaver from './screensaver';
import { useScreensaver } from './use-screensaver';

export function ScreensaverGate({ editing = false }: { editing?: boolean }) {
  const active = useScreensaver({ editing });
  return active ? <Screensaver /> : null;
}
