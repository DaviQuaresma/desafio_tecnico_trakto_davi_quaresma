FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build

# Instala ffmpeg para transcode
RUN apk add --no-cache ffmpeg

EXPOSE 3000

CMD ["npm", "run", "start:prod"]