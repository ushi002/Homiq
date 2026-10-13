# Use official Python image
FROM python:3.12-slim

# Set working directory
WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Version from git (version-env.sh), empty = unknown; build time of this image (core/version.py)
ARG APP_DATE=
ARG APP_COMMIT=
ENV APP_DATE=${APP_DATE} APP_COMMIT=${APP_COMMIT}
RUN date -u +%Y-%m-%dT%H:%M:%SZ > build_time

# Expose port
EXPOSE 8000

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
