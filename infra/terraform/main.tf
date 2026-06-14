# ============================================================
# LitPlay — AWS Infrastructure (§25.1)
# ============================================================
# Baseline deployable topology:
# - VPC across 3 AZs
# - RDS PostgreSQL database per owning service
# - ECS Fargate services for Node.js services + analytics
# - ECS EC2 GPU capacity provider for ASR (g4dn.xlarge / NVIDIA T4)
# - Redis, MSK Kafka, ClickHouse-on-ECS+EFS
# - S3 + CloudFront signed URL infrastructure
# - ALB + HTTP API placeholder + blocking WAF managed rules
# ============================================================

terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
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

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "environment" {
  type    = string
  default = "dev"
}

variable "app_name" {
  type    = string
  default = "litplay"
}

variable "domain_name" {
  type    = string
  default = "litplay.app"
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN for api domain HTTPS listener. If empty, only HTTP listener is created."
  type        = string
  default     = ""
}

variable "cloudfront_public_key_pem" {
  description = "CloudFront public key PEM used by key group for signed content URLs."
  type        = string
  default     = ""
}

variable "container_images" {
  description = "Container image URIs keyed by service name. Override in tfvars/CI."
  type        = map(string)
  default = {
    auth-service         = "public.ecr.aws/docker/library/node:20-alpine"
    progress-service     = "public.ecr.aws/docker/library/node:20-alpine"
    content-service      = "public.ecr.aws/docker/library/node:20-alpine"
    classroom-service    = "public.ecr.aws/docker/library/node:20-alpine"
    notification-service = "public.ecr.aws/docker/library/node:20-alpine"
    asr-service          = "public.ecr.aws/docker/library/python:3.11-slim"
    analytics-service    = "public.ecr.aws/docker/library/python:3.11-slim"
    clickhouse           = "clickhouse/clickhouse-server:24.3-alpine"
  }
}

locals {
  prefix  = "${var.app_name}-${var.environment}"
  is_prod = var.environment == "production"

  dbs = {
    auth         = "auth_db"
    progress     = "progress_db"
    content      = "content_db"
    classroom    = "classroom_db"
    notification = "notification_db"
  }

  node_services = {
    auth-service = {
      port = 3000
      db   = "auth"
      path = "/api/v1/auth/*"
    }
    progress-service = {
      port = 3000
      db   = "progress"
      path = "/api/v1/progress/*"
    }
    content-service = {
      port = 3000
      db   = "content"
      path = "/api/v1/content/*"
    }
    classroom-service = {
      port = 3000
      db   = "classroom"
      path = "/api/v1/classrooms/*"
    }
    notification-service = {
      port = 3000
      db   = "notification"
      path = "/api/v1/notifications/*"
    }
  }
}

# --- Networking ---
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name                 = "${local.prefix}-vpc"
  cidr                 = "10.0.0.0/16"
  azs                  = ["${var.aws_region}a", "${var.aws_region}b", "${var.aws_region}c"]
  public_subnets       = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  private_subnets      = ["10.0.10.0/24", "10.0.11.0/24", "10.0.12.0/24"]
  enable_nat_gateway   = true
  single_nat_gateway   = !local.is_prod
  enable_dns_hostnames = true
}

resource "aws_security_group" "alb" {
  name   = "${local.prefix}-alb-sg"
  vpc_id = module.vpc.vpc_id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "ecs" {
  name   = "${local.prefix}-ecs-sg"
  vpc_id = module.vpc.vpc_id

  ingress {
    from_port       = 0
    to_port         = 65535
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  ingress {
    from_port = 0
    to_port   = 65535
    protocol  = "tcp"
    self      = true
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "db" {
  name   = "${local.prefix}-db-sg"
  vpc_id = module.vpc.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "redis" {
  name   = "${local.prefix}-redis-sg"
  vpc_id = module.vpc.vpc_id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "kafka" {
  name   = "${local.prefix}-kafka-sg"
  vpc_id = module.vpc.vpc_id

  ingress {
    from_port       = 9092
    to_port         = 9092
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "efs" {
  name   = "${local.prefix}-efs-sg"
  vpc_id = module.vpc.vpc_id

  ingress {
    from_port       = 2049
    to_port         = 2049
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# --- RDS: all service-owned databases ---
resource "aws_db_subnet_group" "main" {
  name       = "${local.prefix}-db-subnet"
  subnet_ids = module.vpc.private_subnets
}

resource "random_password" "db" {
  for_each = local.dbs
  length   = 32
  special  = true
}

resource "aws_secretsmanager_secret" "db_url" {
  for_each = local.dbs
  name     = "${local.prefix}/${each.key}/database-url"
}

resource "aws_db_instance" "db" {
  for_each               = local.dbs
  identifier             = "${local.prefix}-${each.key}-db"
  engine                 = "postgres"
  engine_version         = "16"
  instance_class         = local.is_prod ? "db.r6g.large" : "db.t4g.micro"
  allocated_storage      = local.is_prod ? 100 : 20
  max_allocated_storage  = local.is_prod ? 500 : 100
  db_name                = each.value
  username               = "litplay"
  password               = random_password.db[each.key].result
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]
  multi_az               = local.is_prod
  skip_final_snapshot    = !local.is_prod
  deletion_protection    = local.is_prod
  storage_encrypted      = true
}

resource "aws_secretsmanager_secret_version" "db_url" {
  for_each  = local.dbs
  secret_id = aws_secretsmanager_secret.db_url[each.key].id
  secret_string = format(
    "postgres://litplay:%s@%s:5432/%s",
    urlencode(random_password.db[each.key].result),
    aws_db_instance.db[each.key].address,
    each.value,
  )
}

# --- Shared infra: ECS, roles, logs ---
resource "aws_ecs_cluster" "main" {
  name = "${local.prefix}-cluster"
}

resource "aws_iam_role" "ecs_task_execution" {
  name = "${local.prefix}-ecs-task-execution"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "secrets" {
  name = "${local.prefix}-read-secrets"
  role = aws_iam_role.ecs_task_execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["secretsmanager:GetSecretValue"]
      Resource = "*"
    }]
  })
}

resource "aws_cloudwatch_log_group" "service" {
  for_each = merge(
    local.node_services,
    {
      asr-service       = { port = 8080 }
      analytics-service = { port = 8081 }
      clickhouse        = { port = 8123 }
    },
  )

  name              = "/ecs/${local.prefix}/${each.key}"
  retention_in_days = local.is_prod ? 30 : 7
}

# --- ALB routing to ECS services ---
resource "aws_lb" "api" {
  name               = "${local.prefix}-api-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = module.vpc.public_subnets
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.api.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "application/json"
      message_body = "{\"error\":\"not_found\"}"
      status_code  = "404"
    }
  }
}

resource "aws_lb_listener" "https" {
  count             = var.acm_certificate_arn == "" ? 0 : 1
  load_balancer_arn = aws_lb.api.arn
  port              = 443
  protocol          = "HTTPS"
  certificate_arn   = var.acm_certificate_arn

  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "application/json"
      message_body = "{\"error\":\"not_found\"}"
      status_code  = "404"
    }
  }
}

resource "aws_lb_target_group" "node" {
  for_each    = local.node_services
  name        = substr("${local.prefix}-${each.key}", 0, 32)
  port        = each.value.port
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = module.vpc.vpc_id

  health_check {
    path    = "/health"
    matcher = "200"
  }
}

resource "aws_lb_listener_rule" "node" {
  for_each     = local.node_services
  listener_arn = aws_lb_listener.http.arn
  priority     = 100 + index(keys(local.node_services), each.key)

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.node[each.key].arn
  }

  condition {
    path_pattern { values = [each.value.path] }
  }
}

resource "aws_lb_listener_rule" "node_https" {
  for_each     = var.acm_certificate_arn == "" ? {} : local.node_services
  listener_arn = aws_lb_listener.https[0].arn
  priority     = 200 + index(keys(local.node_services), each.key)

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.node[each.key].arn
  }

  condition {
    path_pattern { values = [each.value.path] }
  }
}

# --- Redis + MSK ---
resource "aws_elasticache_subnet_group" "main" {
  name       = "${local.prefix}-redis-subnet"
  subnet_ids = module.vpc.private_subnets
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = "${local.prefix}-redis"
  description                = "LitPlay Redis cache"
  engine                     = "redis"
  engine_version             = "7.0"
  node_type                  = local.is_prod ? "cache.r7g.large" : "cache.t4g.micro"
  num_cache_clusters         = local.is_prod ? 2 : 1
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [aws_security_group.redis.id]
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
}

resource "aws_msk_cluster" "main" {
  cluster_name           = "${local.prefix}-kafka"
  kafka_version          = "3.6.0"
  number_of_broker_nodes = 3

  broker_node_group_info {
    instance_type   = local.is_prod ? "kafka.m5.large" : "kafka.t3.small"
    client_subnets  = module.vpc.private_subnets
    security_groups = [aws_security_group.kafka.id]
    storage_info {
      ebs_storage_info { volume_size = local.is_prod ? 500 : 100 }
    }
  }
}

# --- Node ECS services (Fargate) ---
resource "aws_ecs_task_definition" "node" {
  for_each                 = local.node_services
  family                   = "${local.prefix}-${each.key}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn

  container_definitions = jsonencode([{
    name      = each.key
    image     = var.container_images[each.key]
    essential = true
    portMappings = [{ containerPort = each.value.port }]
    environment = [
      { name = "NODE_ENV", value = local.is_prod ? "production" : "development" },
      { name = "PORT", value = tostring(each.value.port) },
      { name = "KAFKA_BROKERS", value = aws_msk_cluster.main.bootstrap_brokers },
      { name = "REDIS_URL", value = "rediss://${aws_elasticache_replication_group.redis.primary_endpoint_address}:6379" },
      { name = "CLOUDFRONT_KEY_PAIR_ID", value = var.cloudfront_public_key_pem == "" ? "" : aws_cloudfront_public_key.content[0].id },
    ]
    secrets = [
      { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.db_url[each.value.db].arn },
      { name = "JWT_ACCESS_SECRET", valueFrom = aws_secretsmanager_secret.jwt_access.arn },
      { name = "JWT_REFRESH_SECRET", valueFrom = aws_secretsmanager_secret.jwt_refresh.arn },
      { name = "GOOGLE_OAUTH_CLIENT_ID", valueFrom = aws_secretsmanager_secret.google_oauth_client_id.arn },
      { name = "CLOUDFRONT_PRIVATE_KEY", valueFrom = aws_secretsmanager_secret.cloudfront_private_key.arn },
      { name = "FCM_PRIVATE_KEY", valueFrom = aws_secretsmanager_secret.fcm_private_key.arn },
      { name = "SENDGRID_API_KEY", valueFrom = aws_secretsmanager_secret.sendgrid_api_key.arn },
      { name = "APNS_PRIVATE_KEY", valueFrom = aws_secretsmanager_secret.apns_private_key.arn }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.service[each.key].name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "ecs"
      }
    }
  }])
}

resource "aws_ecs_service" "node" {
  for_each        = local.node_services
  name            = each.key
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.node[each.key].arn
  desired_count   = local.is_prod ? 2 : 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = module.vpc.private_subnets
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.node[each.key].arn
    container_name   = each.key
    container_port   = each.value.port
  }
}

# --- ASR GPU path (ECS EC2 capacity provider with g4dn.xlarge) ---
data "aws_ssm_parameter" "ecs_gpu_ami" {
  name = "/aws/service/ecs/optimized-ami/amazon-linux-2/gpu/recommended/image_id"
}

resource "aws_iam_role" "ecs_instance" {
  name = "${local.prefix}-ecs-instance"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_instance" {
  role       = aws_iam_role.ecs_instance.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role"
}

resource "aws_iam_instance_profile" "ecs_gpu" {
  name = "${local.prefix}-ecs-gpu"
  role = aws_iam_role.ecs_instance.name
}

resource "aws_launch_template" "gpu" {
  name_prefix   = "${local.prefix}-gpu-"
  image_id      = data.aws_ssm_parameter.ecs_gpu_ami.value
  instance_type = "g4dn.xlarge"
  vpc_security_group_ids = [aws_security_group.ecs.id]

  iam_instance_profile { name = aws_iam_instance_profile.ecs_gpu.name }
  user_data = base64encode("#!/bin/bash\necho ECS_CLUSTER=${aws_ecs_cluster.main.name} >> /etc/ecs/ecs.config\n")
}

resource "aws_autoscaling_group" "gpu" {
  name                = "${local.prefix}-gpu-asg"
  min_size            = local.is_prod ? 1 : 0
  max_size            = local.is_prod ? 4 : 1
  desired_capacity    = local.is_prod ? 1 : 0
  vpc_zone_identifier = module.vpc.private_subnets

  launch_template {
    id      = aws_launch_template.gpu.id
    version = "$Latest"
  }
}

resource "aws_ecs_capacity_provider" "gpu" {
  name = "${local.prefix}-gpu"
  auto_scaling_group_provider {
    auto_scaling_group_arn = aws_autoscaling_group.gpu.arn
    managed_scaling {
      status          = "ENABLED"
      target_capacity = 80
    }
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT", aws_ecs_capacity_provider.gpu.name]
}

resource "aws_lb_target_group" "asr" {
  name        = substr("${local.prefix}-asr", 0, 32)
  port        = 8080
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = module.vpc.vpc_id
  health_check {
    path    = "/health"
    matcher = "200"
  }
}

resource "aws_lb_listener_rule" "asr" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 50
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.asr.arn
  }

  condition {
    path_pattern { values = ["/api/v1/asr/*"] }
  }
}

resource "aws_ecs_task_definition" "asr" {
  family                   = "${local.prefix}-asr-service"
  network_mode             = "awsvpc"
  requires_compatibilities = ["EC2"]
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn

  container_definitions = jsonencode([{
    name      = "asr-service"
    image     = var.container_images["asr-service"]
    essential = true
    resourceRequirements = [{ type = "GPU", value = "1" }]
    portMappings = [{ containerPort = 8080 }]
    environment = [
      { name = "PORT", value = "8080" },
      { name = "WHISPER_GPU_ENABLED", value = "true" },
      { name = "ASR_AUTH_REQUIRED", value = "true" },
      { name = "AZURE_SPEECH_REGION", value = var.aws_region },
    ]
    secrets = [
      { name = "JWT_ACCESS_SECRET", valueFrom = aws_secretsmanager_secret.jwt_access.arn },
      { name = "AZURE_SPEECH_KEY", valueFrom = aws_secretsmanager_secret.azure_speech_key.arn }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.service["asr-service"].name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "ecs"
      }
    }
  }])
}

resource "aws_ecs_service" "asr" {
  name            = "asr-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.asr.arn
  desired_count   = local.is_prod ? 1 : 0

  capacity_provider_strategy {
    capacity_provider = aws_ecs_capacity_provider.gpu.name
    weight            = 1
  }

  network_configuration {
    subnets          = module.vpc.private_subnets
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.asr.arn
    container_name   = "asr-service"
    container_port   = 8080
  }
}

# --- ClickHouse analytics database (ECS + EFS) ---
resource "aws_efs_file_system" "clickhouse" {
  creation_token = "${local.prefix}-clickhouse"
  encrypted      = true
}

resource "aws_efs_mount_target" "clickhouse" {
  for_each        = toset(module.vpc.private_subnets)
  file_system_id  = aws_efs_file_system.clickhouse.id
  subnet_id        = each.value
  security_groups  = [aws_security_group.efs.id]
}

resource "aws_service_discovery_private_dns_namespace" "main" {
  name        = "${local.prefix}.local"
  description = "LitPlay private service discovery"
  vpc         = module.vpc.vpc_id
}

resource "aws_service_discovery_service" "clickhouse" {
  name = "clickhouse"
  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.main.id
    dns_records { type = "A", ttl = 10 }
  }
}

resource "aws_ecs_task_definition" "clickhouse" {
  family                   = "${local.prefix}-clickhouse"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 1024
  memory                   = 4096
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn

  volume {
    name = "clickhouse-data"
    efs_volume_configuration { file_system_id = aws_efs_file_system.clickhouse.id }
  }

  container_definitions = jsonencode([{
    name      = "clickhouse"
    image     = var.container_images["clickhouse"]
    essential = true
    portMappings = [{ containerPort = 8123 }, { containerPort = 9000 }]
    mountPoints = [{ sourceVolume = "clickhouse-data", containerPath = "/var/lib/clickhouse" }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.service["clickhouse"].name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "ecs"
      }
    }
  }])
}

resource "aws_ecs_service" "clickhouse" {
  name            = "clickhouse"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.clickhouse.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  service_registries {
    registry_arn = aws_service_discovery_service.clickhouse.arn
  }

  network_configuration {
    subnets          = module.vpc.private_subnets
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }
}

resource "aws_ecs_task_definition" "analytics" {
  family                   = "${local.prefix}-analytics-service"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn

  container_definitions = jsonencode([{
    name      = "analytics-service"
    image     = var.container_images["analytics-service"]
    essential = true
    portMappings = [{ containerPort = 8081 }]
    environment = [
      { name = "KAFKA_BROKERS", value = aws_msk_cluster.main.bootstrap_brokers },
      { name = "CLICKHOUSE_HOST", value = "clickhouse.${aws_service_discovery_private_dns_namespace.main.name}" },
      { name = "CLICKHOUSE_PORT", value = "8123" },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.service["analytics-service"].name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "ecs"
      }
    }
  }])
}

resource "aws_ecs_service" "analytics" {
  name            = "analytics-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.analytics.arn
  desired_count   = local.is_prod ? 2 : 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = module.vpc.private_subnets
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }
}

# --- S3 + CloudFront content delivery ---
resource "aws_s3_bucket" "content" {
  bucket = "${local.prefix}-content"
}

resource "aws_cloudfront_public_key" "content" {
  count       = var.cloudfront_public_key_pem == "" ? 0 : 1
  name        = "${local.prefix}-content-key"
  encoded_key = var.cloudfront_public_key_pem
}

resource "aws_cloudfront_key_group" "content" {
  count = var.cloudfront_public_key_pem == "" ? 0 : 1
  name  = "${local.prefix}-content-keys"
  items = [aws_cloudfront_public_key.content[0].id]
}

resource "aws_cloudfront_origin_access_control" "content" {
  name                              = "${local.prefix}-content-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "content_cdn" {
  enabled         = true
  is_ipv6_enabled = true

  origin {
    domain_name              = aws_s3_bucket.content.bucket_regional_domain_name
    origin_id                = "s3-content"
    origin_access_control_id = aws_cloudfront_origin_access_control.content.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-content"
    viewer_protocol_policy = "https-only"
    trusted_key_groups     = var.cloudfront_public_key_pem == "" ? [] : [aws_cloudfront_key_group.content[0].id]

    forwarded_values {
      query_string = true
      cookies { forward = "none" }
    }
  }

  restrictions { geo_restriction { restriction_type = "none" } }
  viewer_certificate { cloudfront_default_certificate = true }
}

resource "aws_s3_bucket_policy" "content_cloudfront" {
  bucket = aws_s3_bucket.content.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontServicePrincipalReadOnly"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.content.arn}/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.content_cdn.arn
        }
      }
    }]
  })
}

# --- API Gateway placeholder + blocking WAF ---
resource "aws_apigatewayv2_api" "main" {
  name          = "${local.prefix}-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["https://app.${var.domain_name}", "https://admin.${var.domain_name}"]
    allow_methods = ["GET", "POST", "PATCH", "DELETE", "OPTIONS"]
    allow_headers = ["Authorization", "Content-Type"]
  }
}

resource "aws_apigatewayv2_vpc_link" "alb" {
  name               = "${local.prefix}-alb-vpc-link"
  security_group_ids = [aws_security_group.alb.id]
  subnet_ids         = module.vpc.private_subnets
}

resource "aws_apigatewayv2_integration" "alb" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "HTTP_PROXY"
  integration_method     = "ANY"
  integration_uri        = var.acm_certificate_arn == "" ? aws_lb_listener.http.arn : aws_lb_listener.https[0].arn
  connection_type        = "VPC_LINK"
  connection_id          = aws_apigatewayv2_vpc_link.alb.id
  payload_format_version = "1.0"
}

resource "aws_apigatewayv2_route" "proxy" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "ANY /{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.alb.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_wafv2_web_acl" "main" {
  name        = "${local.prefix}-waf"
  scope       = "REGIONAL"
  description = "LitPlay WAF with managed rule groups in blocking mode"

  default_action { allow {} }

  rule {
    name     = "aws-managed-common-rules"
    priority = 1
    override_action { none {} }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "awsManagedCommonRules"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "aws-known-bad-inputs"
    priority = 2
    override_action { none {} }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "awsKnownBadInputs"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.prefix}-waf"
    sampled_requests_enabled   = true
  }
}

resource "aws_wafv2_web_acl_association" "alb" {
  resource_arn = aws_lb.api.arn
  web_acl_arn  = aws_wafv2_web_acl.main.arn
}

resource "aws_secretsmanager_secret" "jwt_access" { name = "${local.prefix}/jwt-access-secret" }
resource "aws_secretsmanager_secret" "jwt_refresh" { name = "${local.prefix}/jwt-refresh-secret" }
resource "aws_secretsmanager_secret" "google_oauth_client_id" { name = "${local.prefix}/google-oauth-client-id" }
resource "aws_secretsmanager_secret" "cloudfront_private_key" { name = "${local.prefix}/cloudfront-private-key" }
resource "aws_secretsmanager_secret" "azure_speech_key" { name = "${local.prefix}/azure-speech-key" }
resource "aws_secretsmanager_secret" "fcm_private_key" { name = "${local.prefix}/fcm-private-key" }
resource "aws_secretsmanager_secret" "sendgrid_api_key" { name = "${local.prefix}/sendgrid-api-key" }
resource "aws_secretsmanager_secret" "apns_private_key" { name = "${local.prefix}/apns-private-key" }

# --- DNS ---
resource "aws_route53_zone" "main" {
  name = var.domain_name
}

resource "aws_route53_record" "api_alb" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "api.${var.domain_name}"
  type    = "CNAME"
  ttl     = 300
  records = [aws_lb.api.dns_name]
}

# --- Outputs ---
output "db_endpoints" { value = { for k, v in aws_db_instance.db : k => v.endpoint } }
output "redis_endpoint" { value = aws_elasticache_replication_group.redis.primary_endpoint_address }
output "kafka_bootstrap" { value = aws_msk_cluster.main.bootstrap_brokers }
output "api_alb_dns" { value = aws_lb.api.dns_name }
output "api_gateway_endpoint" { value = aws_apigatewayv2_api.main.api_endpoint }
output "content_cdn_domain" { value = aws_cloudfront_distribution.content_cdn.domain_name }
