# Device dialog with secondary settings

Compose everyday device controls and secondary configuration with BaseCardDialog and its More actions navigation.

Level: `building-block`. Review: `draft`. Owner: Navet maintainers.

Use when: A device needs everyday controls and secondary settings in one focused dialog.

The manifest declares the exact exports and the generator resolves their Storybook links.
Primary reference: `packages/app/src/features/lighting/components/entity-card-switch.stories.tsx#Dialog`.

## Required context

- Navet theme and i18n context
- Caller supplies translated labels, content and a launch-button returnFocusRef
- Feature owns capability checks, provider-neutral commands, saving and errors

## Supported states

closed, controls, settings.

## Review criteria

- Controls appear first
- More actions and Back to controls work
- Closing and reopening returns to controls
- Keyboard dismissal, focus containment and return
- Long titles, phone/tablet/desktop and all four themes

Rendered maintainer acceptance is separate from structural validation.
