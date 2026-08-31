# Standalone OpenCode agent server for LifeOS.
# Runs the same `opencode serve` the app expects, exposing port 4096.
FROM node:20-alpine
RUN apk add --no-cache git openssh bash curl ca-certificates
# Match the opencode version the SDK (`@opencode-ai/sdk`) expects.
RUN npm install -g opencode-ai@1.18.25
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 4096
ENTRYPOINT ["/entrypoint.sh"]
