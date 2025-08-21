# --- build ---
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build
RUN npm prune --omit=dev

# --- runtime ---
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
# ffmpeg + ffprobe (para transcode/ffprobe)
RUN apk add --no-cache ffmpeg tzdata ca-certificates libc6-compat
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
EXPOSE 3000
CMD ["node", "dist/main.js"]
