output "public_ip" {
  description = "Public (Elastic) IP address of the Ubuntu server"
  value       = aws_eip.app_server.public_ip
}

output "https_url" {
  description = "HTTPS URL for the app, using a free sslip.io hostname + Let's Encrypt cert (no domain required)"
  value       = "https://${aws_eip.app_server.public_ip}.sslip.io"
}

output "public_dns" {
  description = "Public DNS name of the server"
  value       = aws_instance.app_server.public_dns
}

output "instance_id" {
  description = "EC2 instance ID"
  value       = aws_instance.app_server.id
}

output "security_group_id" {
  description = "ID of the security group attached to the server"
  value       = aws_security_group.app_server.id
}

output "ssh_command" {
  description = "Command to SSH into the server (replace the key path)"
  value       = "ssh -i /path/to/${var.key_name}.pem ubuntu@${aws_eip.app_server.public_ip}"
}
