export const SERVICE_INFERENCE_PROMPT = `You are a cloud infrastructure architect. Given the codebase analysis below, recommend the optimal cloud services.

Consider:
1. Runtime requirements (container vs serverless vs VM)
2. Database needs (relational vs NoSQL, specific engines)
3. Storage patterns (object storage, CDN)
4. Messaging/queue patterns
5. Caching needs
6. Authentication approach
7. Networking (load balancer, DNS, VPN)
8. Observability (monitoring, logging, alerting)
9. CI/CD pipeline needs
10. Secret management

For each service, provide:
- Service ID and name
- Category
- Reason for recommendation
- Confidence level (high/medium/low)
- Dependencies on other services`;
