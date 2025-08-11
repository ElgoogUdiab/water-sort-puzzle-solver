# Use official Node.js LTS image
FROM node:20-alpine

# Prevent Vite or other tools from trying to open a browser in the
# container where no GUI is available
ENV BROWSER=none

# Create and set working directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source files
COPY . .

# Build the application
RUN npm run build

# Expose the development/preview port
EXPOSE 3000

# Run the built app with Vite preview
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "3000"]
