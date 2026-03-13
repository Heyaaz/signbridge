FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json

RUN npm ci --workspace backend

COPY backend backend

WORKDIR /app/backend

RUN npx prisma generate
RUN npm run build

EXPOSE 4000

CMD ["npm", "run", "start:docker"]
