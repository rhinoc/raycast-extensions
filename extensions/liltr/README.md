# liltr

Translate text directly inside Raycast with `liltr` providers, or switch back to the standalone `liltr` app workflow.

## What it does

- `Translate`: type directly in Raycast and see the translated result in place
- `Translate Selected Text`: read the current selection and translate it in place
- Use Raycast's built-in dropdown and action menus to switch languages and providers
- Switch `Runtime Mode` in preferences to reopen the original standalone `liltr` app workflow

## Setup

1. Open Raycast and run `Import Extension`
2. Select `/Users/rhinoc/dev/extensions/extensions/liltr`
3. Configure your provider credentials in the extension preferences
4. Assign hotkeys to any of these commands:
   - `Translate`
   - `Translate Selection`

## Requirements

- At least one translation provider must be configured in preferences
- Raycast must be able to read selected text from the frontmost app for `Translate Selection`
- If `Runtime Mode` is `Liltr App`, the `liltr` desktop app must be installed and registered for the configured URL scheme
