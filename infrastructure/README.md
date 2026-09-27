# Infrastructure

Deploy config for Handy. Arjun planned the setup; the steps are in [docs/deploy.md](../docs/deploy.md).

- `api.Dockerfile`: the backend
- `web.Dockerfile`: the customer, worker, and admin apps. Pass `APP=customer|worker|admin` and `NEXT_PUBLIC_API_URL`

Both build from the repo root so the shared packages are included, and both listen on the `PORT` the host sets.
