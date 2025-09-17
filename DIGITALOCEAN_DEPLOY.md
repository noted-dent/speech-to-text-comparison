# DigitalOcean App Platform Deployment Guide

This guide explains how to deploy the Speech-to-Text Comparison application to DigitalOcean App Platform.

## Prerequisites

1. A DigitalOcean account
2. API keys for the services you want to use:
   - AssemblyAI API Key
   - Deepgram API Key
   - OpenAI API Key

## Deployment Steps

### 1. Prepare Your Repository

Ensure your repository contains:
- ✅ `Dockerfile` (already configured)
- ✅ `.dockerignore` (already configured)
- ✅ `package.json` with all dependencies
- ✅ Health check endpoint at `/health`

### 2. Create a New App in DigitalOcean

1. Log in to your DigitalOcean account
2. Navigate to "Apps" → "Create App"
3. Choose "GitHub" or "GitLab" as your source
4. Select your repository and branch
5. DigitalOcean will automatically detect the Dockerfile

### 3. Configure Environment Variables

In the DigitalOcean App Platform settings, add these environment variables:

```bash
# Required API Keys (add the ones you need)
ASSEMBLYAI_API_KEY=your_assemblyai_api_key
DEEPGRAM_API_KEY=your_deepgram_api_key
OPENAI_API_KEY=your_openai_api_key

# Port (DigitalOcean will set this automatically, but good to be explicit)
PORT=8080
```

**Note:** DigitalOcean typically uses port 8080, but the app is configured to respect the PORT environment variable.

### 4. Configure the App

#### App Spec Configuration:

```yaml
name: speech-to-text-comparison
region: nyc
services:
- name: web
  dockerfile_path: Dockerfile
  source_dir: /
  http_port: 8080
  instance_count: 1
  instance_size_slug: basic-xxs
  health_check:
    http_path: /health
    initial_delay_seconds: 40
    period_seconds: 30
    timeout_seconds: 3
    success_threshold: 1
    failure_threshold: 3
  envs:
  - key: NODE_ENV
    value: production
  - key: ASSEMBLYAI_API_KEY
    type: SECRET
    value: your_api_key_here
  - key: DEEPGRAM_API_KEY
    type: SECRET
    value: your_api_key_here
  - key: OPENAI_API_KEY
    type: SECRET
    value: your_api_key_here
```

### 5. Resource Configuration

For this application, recommended settings:
- **Instance Size**: Basic XXS ($5/month) for testing, Basic XS ($10/month) for production
- **Instance Count**: 1 (can scale up if needed)
- **Region**: Choose closest to your users

### 6. Deploy

1. Click "Next" through the configuration steps
2. Review your settings
3. Click "Create Resources"
4. DigitalOcean will build and deploy your application

### 7. Access Your App

Once deployed, DigitalOcean will provide you with a URL like:
```
https://your-app-name.ondigitalocean.app
```

## Important Considerations

### File Uploads

The application stores uploaded files in the `/app/uploads` directory. Note that:
- Files are stored in the container's ephemeral storage
- Files will be lost when the container restarts
- For persistent storage, consider using DigitalOcean Spaces

### Environment Variables

- Never commit API keys to your repository
- Always use DigitalOcean's encrypted environment variables for sensitive data
- The app validates API keys on startup and logs which services are available

### Health Checks

The Dockerfile includes a HEALTHCHECK that:
- Runs every 30 seconds
- Has a 3-second timeout
- Waits 40 seconds before starting checks
- Retries 3 times before marking as unhealthy

### Scaling

To handle more traffic:
1. Increase instance size for vertical scaling
2. Increase instance count for horizontal scaling
3. Consider using a load balancer for multiple instances

## Troubleshooting

### Common Issues

1. **Port Binding Issues**
   - Ensure the app uses `process.env.PORT`
   - DigitalOcean usually sets PORT=8080

2. **Build Failures**
   - Check if native modules compile correctly in Alpine Linux
   - The Dockerfile includes build dependencies (python3, make, g++)

3. **API Key Issues**
   - Verify environment variables are set correctly
   - Check the `/health` endpoint for service status

### Viewing Logs

1. Go to your app in DigitalOcean dashboard
2. Click on "Runtime Logs" or "Build Logs"
3. Check for any error messages

### Local Testing

Test the Docker build locally:

```bash
# Build the image
docker build -t speech-to-text-app .

# Run with environment variables
docker run -p 3000:3000 \
  -e ASSEMBLYAI_API_KEY=your_key \
  -e DEEPGRAM_API_KEY=your_key \
  -e OPENAI_API_KEY=your_key \
  speech-to-text-app

# Test the health endpoint
curl http://localhost:3000/health
```

## Security Best Practices

1. **Use Encrypted Environment Variables**: Mark all API keys as SECRET in DigitalOcean
2. **Run as Non-Root User**: The Dockerfile already configures this
3. **Keep Dependencies Updated**: Regularly update npm packages
4. **Monitor Health Checks**: Set up alerts for health check failures
5. **Enable CORS Properly**: Configure CORS for your specific domain in production

## Cost Optimization

1. Start with the smallest instance size and scale up as needed
2. Monitor resource usage in the DigitalOcean dashboard
3. Consider using autoscaling based on CPU/memory usage
4. Use DigitalOcean's bandwidth pooling if running multiple apps