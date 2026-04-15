# Deployment

## Vercel

1. Push the repository to GitHub
2. Import the repository into Vercel
3. Add these environment variables in the Vercel project settings:

```text
GEMINI_API_KEY=your_new_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
```

4. Redeploy the project

The site will then serve:

- `index.html` as the main page
- `/api/chat` as the online Gemini backend

## Important

GitHub Pages alone cannot run the chatbot backend.
If you open the site on `github.io`, the frontend loads, but `/api/chat` returns HTML instead of JSON.
To make the chat work online, open the Vercel deployment URL, not the GitHub Pages URL.

## Local mode

The project still supports local testing with:

```bash
node server.js
```
