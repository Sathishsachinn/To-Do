 To-Do — Simple Client-side App

What this is
- A small To-Do web application built with HTML/CSS/JavaScript.
- Tasks are saved persistently in localStorage per user (so they remain until manually deleted).
- Supports Google (Gmail) sign-in via Google Identity Services and a guest fallback.
- Light / Dark theme toggle saved per user.
- Responsive, colorful, and modern styling.

Files
- `login.html` — Sign-in page. Renders the Google Sign-In button.
- `index.html` — Main To-Do UI (requires sign-in or guest continue).
- `css/style.css` — Styling and theme support.
- `js/auth.js` — Lightweight client-side handling of Google credential (parses JWT) and manages `current_user` in localStorage.
- `js/app.js` — Main application logic: task CRUD, persistence, rendering.

Google Sign-In setup (required to sign in with Gmail)
1. Go to https://console.cloud.google.com/apis/credentials
2. Create or select a project.
3. Create an OAuth 2.0 Client ID -> Web application.
4. Add an Authorized JavaScript origin, e.g., `http://localhost:8000` (or your local dev URL).
5. Copy the Client ID.
6. In `login.html`, replace `YOUR_GOOGLE_CLIENT_ID` (data-client_id) with that Client ID.

Running locally
- Google Identity requires a secure origin (https) or localhost. Easiest is to serve files from localhost.

If you have Python installed, from the project folder run:

```powershell
# start a simple HTTP server on port 8000
python -m http.server 8000
# then open http://localhost:8000/login.html in your browser
```

Or use any static file server or VS Code Live Server extension.

Notes & Security
- This demo parses the ID token (JWT) client-side to get basic profile info. It does NOT verify the token signature.
- For production apps, always validate tokens server-side and use proper backend session management.

How storage works
- After sign-in we store `current_user` in localStorage.
- Per-user app data is stored under the key: `todo_user_<userId>`.
- Example: `todo_user_118234567890123456789` => { tasks: [...], settings: { theme: 'light' } }
- Tasks persist until the user deletes them ("Clear" buttons or individual deletes).

Customizing
- Tweak palette and variables in `css/style.css`.
- Add more metadata to tasks (due dates, reminders) by editing `js/app.js`.

If you want, I can:
- Add unit tests or a tiny end-to-end smoke test.
- Add inline editing (richer UI) or task due dates.
- Show how to verify Google tokens on a small Node/Express backend.
