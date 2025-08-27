# syntax=docker/dockerfile:1
FROM node:20-alpine
WORKDIR /usr/src/app
COPY package.json tsconfig.json ./
RUN corepack enable || true
RUN npm i -g pnpm@10.15.0 || true
RUN pnpm install --ignore-scripts
COPY prisma ./prisma
COPY src ./src
EXPOSE 3000
CMD ["pnpm","dev"]
