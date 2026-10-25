# Облачный сервер «Конструктора ИД»: Node 22, исходники пакетов shared, server, cloud; консоль собирается при сборке образа.
FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/cloud/package.json packages/cloud/
COPY packages/addin/package.json packages/addin/
RUN npm ci --no-audit --no-fund
COPY packages/shared packages/shared
COPY packages/server packages/server
COPY packages/cloud packages/cloud
RUN node packages/cloud/build.mjs
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["npx", "tsx", "packages/cloud/src/main.ts"]
