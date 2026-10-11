export const shoppingListEntity = {
  entity_id: 'todo.shopping_list',
  state: '2',
  attributes: { friendly_name: 'Shopping list', supported_features: 7 },
  last_changed: '2026-10-10T08:00:00+00:00',
  last_updated: '2026-10-10T08:00:00+00:00',
  context: { id: '01JSHOPPINGLISTUPDATE', parent_id: null, user_id: null },
};

export const shoppingListItems = {
  items: [
    { uid: '9c8d8cce-81dc-4b3a-9d15-b13987df1b00', summary: 'Milk', status: 'needs_action' },
    { uid: 'd965c6d3-dd1c-42cf-ae55-fc192e8b84b6', summary: 'Bread', status: 'needs_action' },
    { uid: '17f8da7d-4cb4-4a4c-8c83-d8d34149248d', summary: 'Coffee', status: 'completed' },
  ],
};

export const sameCountShoppingListUpdate = {
  items: shoppingListItems.items.map((item, index) =>
    index === 0 ? { ...item, summary: 'Oat milk' } : item
  ),
};

export const detailedTodoItems = {
  items: [
    {
      uid: 'task-date',
      summary: 'Collect parcel',
      status: 'needs_action',
      due: '2026-10-12',
      description: 'Bring ID',
    },
    {
      uid: 'task-datetime',
      summary: 'Call plumber',
      status: 'completed',
      due: '2026-10-12T15:30:00+02:00',
    },
  ],
};

export const uidlessShoppingListItems = {
  items: [
    { summary: 'Milk', status: 'needs_action' },
    { uid: null, summary: 'Bread', status: 'completed' },
  ],
};

export const duplicateUidlessShoppingListItems = {
  items: [
    { summary: 'Milk', status: 'needs_action' },
    { summary: 'Milk', status: 'completed' },
  ],
};
