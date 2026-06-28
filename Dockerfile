FROM node:20-bookworm-slim

WORKDIR /usr/src/app

# Install build dependencies for native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 \
  make \
  g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json tsconfig.json ./
RUN npm ci

COPY . ./
RUN npm run build

EXPOSE 3000
CMD ["node", "dist/src/index.js"]
