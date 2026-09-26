customer-app contains the required routes: /login, /signup, /chat (the real "home screen"), /request/[requestId], /job/[jobId], /history, /profile, /settings
The chat flow does the AI conversation -> structured confirmation card -> submit -> live-tracked job with a worker card, status tracker, in-app messaging, and a rating step at completion, plus a hard-branch emergency warning if the AI ever flags POTENTIAL_EMERGENCY
Voice input via the Web Speech API
Design is built specifically for older adults: Atkinson Hyperlegible typeface (designed for low-vision readers), 48px+ tap targets, high-contrast palette, visible focus rings, reduced-motion support, and a 4-item bottom nav as the entire IA — no category pickers, no menus
lib/api.ts is the single boundary to the backend