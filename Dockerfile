FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci 

COPY . .

# Директории для загружаемых файлов
RUN mkdir -p uploads/avatars uploads/reviews

EXPOSE 5000

CMD ["node", "index.js"]

