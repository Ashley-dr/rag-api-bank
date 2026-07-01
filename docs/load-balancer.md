# Load balancer & reverse proxy example

This file shows a minimal Nginx reverse proxy + rate limiting configuration and notes for running multiple app replicas behind a load balancer.

Example `nginx.conf` snippet:

```
http {
  upstream rag_api {
    server 127.0.0.1:3000;
    # add more backend servers when scaling horizontally
    # server 127.0.0.1:3001;
  }

  limit_req_zone $binary_remote_addr zone=one:10m rate=60r/m;

  server {
    listen 80;

    location / {
      proxy_pass http://rag_api;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;

      # Apply rate limiting in nginx
      limit_req zone=one burst=20 nodelay;
    }
  }
}
```

Notes:
- Deploy multiple app instances (different ports or containers) and list them in `upstream`.
- Use a cloud load balancer (ALB, Cloud Run, Cloudflare) for DDoS protection and autoscaling.
- Keep application-level rate limiting (this repo) + edge rate limiting (nginx/CDN) for best protection.
- Consider using a WAF or CDN in front (Cloudflare, AWS WAF) for larger-scale DDoS mitigation.
