# Lingua frontend

React 19 on Vite, Tailwind CSS v4, shadcn/ui (Radix), react-router, axios, TanStack Query.

## Configuration

One build-time variable (see `.env.example`):

| Variable | Meaning |
|---|---|
| `REACT_APP_BACKEND_URL` | Public URL of the API, e.g. `https://lingua-api.onrender.com`. Empty = same origin as the page. |

The Google sign-in button appears only if the **backend** has `GOOGLE_CLIENT_ID` set (the frontend reads it from `/api/config`).

## Scripts

- `yarn dev` — dev server on port 3000
- `yarn build` — production bundle into `build/`
- `yarn preview` — serve the production bundle locally
