# Security regression checks

Use Node.js 18 or newer. From the repository root:

```sh
npm ci
npm test
```

The suite executes production row templates with HTML, quote/attribute, entity,
Khmer, numeric and null fixtures. parse5 parses the resulting HTML to detect
injected elements/event attributes and verify decoded action identifiers.
It covers editable/read-only data entry, report issue/action text, user action
attributes, stored year selectors, and the unknown-route renderer.

Cloud Functions run in a VM with Firebase mocks: authorization and reset-password
behavior remain covered without creating real users. Tests verify all 24 random
bytes are retained in the base64url temporary password, forbid Math.random(),
and exercise Node's real crypto implementation. Passwords are not returned by
the callable.

These are focused render/callable regressions, not browser end-to-end or deployed
Firebase/emulator tests. No Firebase credentials or production data are required.
