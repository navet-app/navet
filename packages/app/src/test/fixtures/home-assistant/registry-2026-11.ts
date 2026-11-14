export const homeAssistant202611Registry = {
  areas: [
    { area_id: 'kitchen', name: 'Kitchen' },
    { area_id: 'office', name: 'Office' },
  ],
  deviceRegistry: [
    { id: 'strip', area_id: 'kitchen', name_by_user: 'Power strip', next_name_part: 'area' },
    {
      id: 'outlet',
      parent_device_id: 'strip',
      area_id: null,
      name: 'Outlet 1',
      next_name_part: 'parent_device',
    },
  ],
  entityRegistry: [
    {
      entity_id: 'switch.outlet',
      device_id: 'outlet',
      area_id: null,
      name: null,
      original_name: null,
      next_name_part: 'device',
    },
    {
      entity_id: 'sensor.outlet_power',
      device_id: 'outlet',
      area_id: 'office',
      name: null,
      original_name: 'Power',
      next_name_part: 'area',
    },
  ],
};
