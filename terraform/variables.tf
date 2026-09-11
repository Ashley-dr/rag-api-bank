variable "aws_region" {
  description = "AWS region to deploy the server into"
  type        = string
  default     = "ap-southeast-1"
}

variable "project_name" {
  description = "Name prefix used to tag and name all created resources"
  type        = string
  default     = "aspac-elearning"
}

variable "instance_type" {
  description = "EC2 instance type for the Ubuntu server"
  type        = string
  default     = "t3.micro"
}

variable "root_volume_size" {
  description = "Size (GiB) of the root EBS volume"
  type        = number
  default     = 30
}

variable "key_name" {
  description = "Name of an EXISTING EC2 key pair in the target region, used for SSH access"
  type        = string
}

variable "allowed_ssh_cidr" {
  description = "CIDR allowed to SSH into the server, e.g. \"203.0.113.10/32\". Find your IP with: curl ifconfig.me"
  type        = string
}

variable "allowed_http_cidr" {
  description = "CIDR allowed to reach the app over HTTP/HTTPS/3000"
  type        = string
  default     = "0.0.0.0/0"
}

variable "rds_security_group_id" {
  description = "Optional: security group ID of the existing RDS instance. When set, an ingress rule is added on port 5432 so this server can reach the database."
  type        = string
  default     = ""
}
