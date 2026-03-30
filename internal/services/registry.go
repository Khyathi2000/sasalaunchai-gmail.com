package services

// Registry returns all known services, filterable by provider.
var Registry = []Service{
	{
		ID:          "ec2",
		Name:        "EC2 (Compute)",
		Description: "Virtual machines — run any workload",
		Category:    "compute",
		Provider:    "aws",
	},
	{
		ID:          "rds",
		Name:        "RDS (Managed Database)",
		Description: "Managed Postgres, MySQL, or MariaDB",
		Category:    "database",
		Provider:    "aws",
	},
	{
		ID:          "s3",
		Name:        "S3 (Object Storage)",
		Description: "Store files, assets, backups",
		Category:    "storage",
		Provider:    "aws",
	},
	{
		ID:          "lambda",
		Name:        "Lambda (Serverless Functions)",
		Description: "Run code without managing servers",
		Category:    "compute",
		Provider:    "aws",
	},
	{
		ID:          "ecs",
		Name:        "ECS (Container Orchestration)",
		Description: "Run Docker containers with Fargate",
		Category:    "compute",
		Provider:    "aws",
	},
	{
		ID:          "cloudfront",
		Name:        "CloudFront (CDN)",
		Description: "Global content delivery network",
		Category:    "networking",
		Provider:    "aws",
	},
	{
		ID:          "elasticache",
		Name:        "ElastiCache (In-Memory Cache)",
		Description: "Managed Redis or Memcached",
		Category:    "database",
		Provider:    "aws",
	},
	{
		ID:          "sqs",
		Name:        "SQS (Message Queue)",
		Description: "Fully managed message queuing",
		Category:    "messaging",
		Provider:    "aws",
	},
}

// ForProvider returns all services matching the given provider.
func ForProvider(provider string) []Service {
	var result []Service
	for _, s := range Registry {
		if s.Provider == provider {
			result = append(result, s)
		}
	}
	return result
}
