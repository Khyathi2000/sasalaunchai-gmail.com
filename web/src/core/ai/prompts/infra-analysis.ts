export const INFRA_ANALYSIS_PROMPT = `Analyze this codebase for cloud deployment requirements. Based on the code patterns, dependencies, configuration files, and architecture, determine:

1. Runtime type (container, serverless, or VM)
2. Database requirements (type, engine)
3. Storage needs (object, block, file)
4. Messaging patterns (queue, pub/sub)
5. Caching requirements
6. Networking needs (load balancer, CDN, VPN)
7. Authentication approach
8. Scaling parameters
9. Required environment variables

Be specific and base your analysis on actual code evidence found in the repository.`;
