FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package.json

RUN npm ci --workspace frontend

COPY frontend frontend

WORKDIR /app/frontend

RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
