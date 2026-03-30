package services

// Service describes a service in the catalog.
// Contains metadata only — no user config.
type Service struct {
	ID          string // "ec2", "rds", etc.
	Name        string // "EC2 (Compute)", "RDS (Managed Database)"
	Description string // one-liner for TUI display
	Category    string // "compute", "database", "storage", "networking", "messaging"
	Provider    string // "aws" — filters catalog by selected provider
}
