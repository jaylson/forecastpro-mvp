# syntax=docker/dockerfile:1
FROM node:20-alpine
WORKDIR /usr/src/app
COPY package.json vite.config.ts tsconfig.json ./
RUN corepack enable || true
RUN npm i -g pnpm@10.15.0 || true
RUN pnpm install --ignore-scripts
COPY . .
EXPOSE 5173
CMD ["pnpm","dev","--","--host","0.0.0.0"]
