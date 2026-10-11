# Weather card configuration

Compose the existing Weather dialog with forecast selection, bounded metric choices and appearance controls.

Level: `product`. Review: `pending`. Owner: Navet maintainers.

Use when: Configure a Navet Weather card. Features keep ownership of available metrics and persistence.

The manifest declares the exact exports and the generator resolves their Storybook links.
Primary reference: `packages/app/src/features/weather/components/weather-card/entity-card-weather.stories.tsx#DialogSelectableControls`.

## Required context

- Navet theme and i18n context
- Caller supplies entity identity, translated household title, available metrics and controlled callbacks
- Connect returnFocusRef to the launcher; feature owns persisted forecast and metric preferences

## Supported states

closed, hourly, weekly, one metric, five metrics, appearance.

## Review criteria

- Match Cards/Entity/Weather using identical state and theme
- Forecast remains mutually exclusive
- Metric selection permits one to five available metrics
- Keyboard dismissal and focus return; closing and reopening preserves caller state
- Phone/tablet/desktop, long title and all four themes

Rendered maintainer acceptance is separate from structural validation.
