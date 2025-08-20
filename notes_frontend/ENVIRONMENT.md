Environment configuration

The frontend reads these variables (via Vite import.meta.env):
- VITE_API_BASE_URL: Base URL for backend API. Example: https://api.example.com
  If not provided, the app will use relative '/api' endpoints.

Required backend REST endpoints (JSON):
- POST /auth/login            body: { email, password } -> { token, user: { id, email } }
- POST /auth/register         body: { email, password } -> { token, user: { id, email } }
- GET  /notes                 headers: Authorization: Bearer <token> -> Note[]
- POST /notes                 body: { title, content } -> Note
- PUT  /notes/:id             body: { title, content } -> Note
- DELETE /notes/:id           -> 204 No Content

Note object shape:
{ id: string, title: string, content: string, created_at: ISO, updated_at: ISO }
