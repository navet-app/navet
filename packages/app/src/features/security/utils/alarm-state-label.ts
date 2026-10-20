import type { TranslateFn } from '@navet/app/i18n';
import type { NavetAlarmEntity } from '@navet/core/alarm-types';

export function getAlarmStateLabel(state: NavetAlarmEntity['state'], t: TranslateFn) {
  switch (state) {
    case 'disarmed':
      return t('security.alarm.state.disarmed');
    case 'armed_home':
      return t('security.alarm.state.armedHome');
    case 'armed_away':
      return t('security.alarm.state.armedAway');
    case 'armed_night':
      return t('security.alarm.state.armedNight');
    case 'armed_vacation':
      return t('security.alarm.state.armedVacation');
    case 'armed_custom_bypass':
      return t('security.alarm.state.customBypass');
    case 'arming':
      return t('security.alarm.state.arming');
    case 'pending':
      return t('security.alarm.state.pending');
    case 'disarming':
      return t('security.alarm.state.disarming');
    case 'triggered':
      return t('security.alarm.state.triggered');
    case 'unavailable':
      return t('common.unavailable');
    default:
      return t('security.alarm.state.unknown');
  }
}
