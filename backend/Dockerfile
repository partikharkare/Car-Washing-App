FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --production=false
COPY tsconfig.json ./
COPY src ./src
RUN npm run build
ENV NODE_ENV=production PORT=4000
EXPOSE 4000
CMD ["node", "dist/app.js"]
