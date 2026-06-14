# ============================================================
# LitPlay — Terraform Infrastructure (§25.1)
# Deploys all AWS resources for a single environment.
# ============================================================

terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "litplay-tfstate"
    key            = "terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "litplay-tflock"
  }
}

provider "aws" {
  region = var.aws_region
}

variable "aws_region" { type = string; default = "us-east-1" }
variable "environment" { type = string; default = "dev" }
variable "app_name" { type = string; default = "litplay" }

locals {
  prefix = "${var.app_name}-${var.environment}"
}

# --- Networking ---
module "vpc" {
  source = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name                 = "${local.prefix}-vpc"
  cidr                 = "10.0.0.0/16"
  azs                  = ["${var.aws_region}a", "${var.aws_region}b"]
  public_subnets       = ["10.0.1.0/24", "10.0.2.0/24"]
  private_subnets      = ["10.0.10.0/24", "10.0.11.0/24"]
  enable_nat_gateway   = true
  single_nat_gateway   = var.environment != "production"
  enable_dns_hostnames = true
}

# --- RDS PostgreSQL 16 (Multi-AZ in production) ---
resource "aws_db_subnet_group" "main" {
  name       = "${local.prefix}-db-subnet"
  subnet_ids = module.vpc.private_subnets
}

resource "random_password" "db_password" {
  length  = 32
  special = true
}

resource "aws_db_instance" "auth_db" {
  identifier           = "${local.prefix}-auth-db"
  engine               = "postgres"
  engine_version       = "16"
  instance_class       = var.environment == "production" ? "db.r6g.large" : "db.t4g.micro"
  allocated_storage    = 20
  db_name              = "auth_db"
  username             = "litplay"
  password             = random_password.db_password.result
  db_subnet_group_name = aws_db_subnet_group.main.name
  multi_az             = var.environment == "production"
  skip_final_snapshot  = var.environment != "production"
  storage_encrypted    = true
}

# (repeat for progress_db, content_db, classroom_db, notification_db)

# --- ECS Cluster ---
resource "aws_ecs_cluster" "main" {
  name = "${local.prefix}-cluster"
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]
}

# --- ElastiCache Redis (§10.3 — WPM trend cache) ---
resource "aws_elasticache_subnet_group" "main" {
  name       = "${local.prefix}-redis-subnet"
  subnet_ids = module.vpc.private_subnets
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = "${local.prefix}-redis"
  description          = "LitPlay Redis cache"
  engine               = "redis"
  engine_version       = "7.0"
  node_type            = "cache.t4g.micro"
  num_cache_clusters   = var.environment == "production" ? 2 : 1
  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [aws_security_group.redis.id]
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
}

# --- MSK Kafka (§15.1) ---
resource "aws_msk_cluster" "main" {
  cluster_name           = "${local.prefix}-kafka"
  kafka_version          = "3.6.0"
  number_of_broker_nodes = 3
  broker_node_group_info {
    instance_type   = "kafka.m5.large"
    client_subnets  = module.vpc.private_subnets
    security_groups = [aws_security_group.kafka.id]
    storage_info {
      ebs_storage_info {
        volume_size = 100
      }
    }
  }
}

# --- S3 + CloudFront for content bundles (§18.2) ---
resource "aws_s3_bucket" "content" {
  bucket = "${local.prefix}-content"
}

resource "aws_cloudfront_distribution" "content_cdn" {
  enabled             = true
  is_ipv6_enabled     = true
  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "s3-content"
    forwarded_values { query_string = true; cookies { forward = "none" } }
    viewer_protocol_policy = "https-only"
    trusted_key_groups     = [aws_cloudfront_key_group.main.id] # signed URLs (§18.2)
  }
  origin {
    domain_name = aws_s3_bucket.content.bucket_regional_domain_name
    origin_id   = "s3-content"
    s3_origin_config { origin_access_identity = "cloudfront" }
  }
  restrictions { geo_restriction { restriction_type = "none" } }
  viewer_certificate { cloudfront_default_certificate = true }
}

# --- API Gateway v2 (§5) ---
resource "aws_apigatewayv2_api" "main" {
  name          = "${local.prefix}-api"
  protocol_type = "HTTP"
  cors_configuration {
    allow_origins = ["https://app.litplay.app", "https://admin.litplay.app"]
    allow_methods = ["GET", "POST", "PATCH", "DELETE", "OPTIONS"]
    allow_headers = ["Authorization", "Content-Type"]
  }
}

# --- WAF (§27) ---
resource "aws_wafv2_web_acl" "main" {
  name        = "${local.prefix}-waf"
  scope       = "REGIONAL"
  description = "LitPlay WAF with managed rule groups"

  default_action { allow {} }

  rule {
    name     = "aws-managed-rules"
    priority = 1
    override_action { count {} }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "awsManagedRules"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name               = "${local.prefix}-waf"
    sampled_requests_enabled   = true
  }
}

# --- Secrets Manager (§27.1) ---
resource "aws_secretsmanager_secret" "jwt_access" {
  name = "${local.prefix}/jwt-access-secret"
}

resource "aws_secretsmanager_secret" "jwt_refresh" {
  name = "${local.prefix}/jwt-refresh-secret"
}

# --- Security Groups ---
resource "aws_security_group" "redis" {
  name   = "${local.prefix}-redis-sg"
  vpc_id = module.vpc.vpc_id
  ingress {
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = module.vpc.private_subnets_cidr_blocks
  }
}

resource "aws_security_group" "kafka" {
  name   = "${local.prefix}-kafka-sg"
  vpc_id = module.vpc.vpc_id
  ingress {
    from_port   = 9092
    to_port     = 9092
    protocol    = "tcp"
    cidr_blocks = module.vpc.private_subnets_cidr_blocks
  }
}

# --- Route 53 ---
resource "aws_route53_zone" "main" {
  name = "litplay.app"
}

resource "aws_route53_record" "api" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "api.litplay.app"
  type    = "A"
  alias {
    name                   = aws_apigatewayv2_api.main.api_endpoint
    zone_id                = aws_route53_zone.main.zone_id
    evaluate_target_health = false
  }
}

# --- Outputs ---
output "auth_db_endpoint" { value = aws_db_instance.auth_db.endpoint }
output "redis_endpoint" { value = aws_elasticache_replication_group.redis.primary_endpoint_address }
output "kafka_bootstrap" { value = aws_msk_cluster.main.bootstrap_brokers }
output "api_endpoint" { value = aws_apigatewayv2_api.main.api_endpoint }
