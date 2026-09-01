# Deploying LifeOS to a VPS

Measured against the running stack, so you can size a box honestly:

| | Measured | Fits a 1-core / 2 GB / 40 GB VPS? |
|---|---|---|
| Runtime memory | 550 MiB (app 79 + opencode 472) | Yes, ~1.4 GB spare |
| Images on disk | 3.04 GB | Yes |
| Idle CPU | ~2% | Yes — the work is waiting on the model, not computing |

**Running it is comfortable. Building it is the tight part.** `next build` peaks near
1.5 GB, and cheap VPSes usually ship without swap, so the build gets OOM-killed and
reports a bare `exit code 137` rather than anything mentioning memory. Step 1 exists
entirely to prevent that.

---

## 1. Prepare the server

```bash
# Swap first - this is the step people skip and then lose an hour to exit code 137.
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
free -h            # confirm swap is listed

# Docker
curl -fsSL https://get.docker.com | sh
```

Point an **A record** for your domain at the VPS IP before continuing. Caddy cannot
issue a certificate for a bare IP address, and Google will not accept an HTTP
redirect URI, so a working domain is a hard requirement rather than a nicety.

## 2. Configure

```bash
git clone https://github.com/Spore301/LifeOS.git && cd LifeOS
cp .env.example .env
```

Fill in `.env`. Beyond the usual keys:

```env
DOMAIN=lifeos.example.com
PUBLIC_URL=https://lifeos.example.com
LIFEOS_ADMIN_SECRET=<32+ random chars; the placeholder is rejected>
OPENCODE_SERVER_PASSWORD=<long random string>
NEXTAUTH_SECRET=<long random string>
LIFEOS_CRON_SECRET=<long random string; cron routes are disabled without it>
```

Generate secrets with `openssl rand -base64 32`.

## 3. Launch

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

The production overlay differs from local in two ways: the app is **not** published on
a host port (Caddy reaches it over the compose network, so only 80/443 are exposed),
and Caddy obtains a Let's Encrypt certificate automatically on first request.

Expect the build to take several minutes on one core. Watch it with:

```bash
docker compose logs -f
```

## 4. Google Cloud Console

Both of these, or sign-in fails in ways that look like app bugs:

1. **Credentials → OAuth client → Authorized redirect URIs**
   `https://<your-domain>/api/auth/callback/google`
2. **OAuth consent screen → Test users** — every person who will sign in, by Gmail
   address. While the app is unverified, anyone not listed is refused regardless of
   anything you change on the server.

## 5. Verify

```bash
curl -sI https://<your-domain> | head -3          # 200 + a valid cert
docker stats --no-stream                          # memory within budget
docker compose logs --tail 20 lifeos
```

Then sign in and send a message. If the reply arrives all at once at the end instead
of streaming, the proxy is buffering — check that `flush_interval -1` is still in the
Caddyfile.

---

## Operating notes

**Backups.** Everything lives in three Docker volumes. `lifeos-data` (tasks, personas,
transcripts) and `lifeos-secrets` (Google tokens) are the ones you cannot regenerate:

```bash
docker run --rm -v lifeos_lifeos-data:/d -v $PWD:/b alpine tar czf /b/data.tgz -C /d .
docker run --rm -v lifeos_lifeos-secrets:/d -v $PWD:/b alpine tar czf /b/secrets.tgz -C /d .
```

`secrets.tgz` contains live Google refresh tokens — treat it like a password file.

**Updating.**

```bash
git pull && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

**Building elsewhere.** If builds on the box get tiresome, build locally, push to a
registry, and have the VPS only `docker compose pull`. Faster, and it keeps build
memory off the server entirely.

---

## Know before you expose this publicly

Neither of these blocks a small trial, but both are real.

**The agent has shell access and network egress.** It runs in its own container and
since PR #2 cannot read other users' data or your Google token. It *can* still make
outbound requests, and its instructions come partly from user input — so a prompt
injection has a network from which to act. An egress firewall on the `opencode`
container is the mitigation if this stops being a small trial.

**Concurrent writes can be lost.** Every store does read-modify-write against JSON
files with no locking (issue #5 in [HANDOFF.md](HANDOFF.md)). Two people acting at the
same moment can drop one another's changes, and a crash mid-write can truncate a
ledger. Fine for a handful of testers; not a foundation for real use. Back up before
you invite anyone.
