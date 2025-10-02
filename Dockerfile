# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV HOST=0.0.0.0 \
    PORT=8000

EXPOSE 8000
CMD ["npm", "start"]
