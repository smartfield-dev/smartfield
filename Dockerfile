FROM node:18-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY api/package.json api/package-lock.json* ./api/
RUN cd api && npm install --production

# Copy project files
COPY component/ ./component/
COPY landing/ ./landing/
COPY demo/ ./demo/
COPY sdk/ ./sdk/
COPY api/ ./api/
COPY sitemap.xml ./sitemap.xml

# SmartField runs on port 3333 inside container
EXPOSE 3333

WORKDIR /app/api
CMD ["node", "server-sdk.js"]
