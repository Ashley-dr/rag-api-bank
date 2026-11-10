# Allocated on its own (not tied to the instance yet) so its address is known
# before the instance's user_data is rendered below.
resource "aws_eip" "app_server" {
  domain = "vpc"

  tags = {
    Name = "${var.project_name}-eip"
  }
}

resource "aws_instance" "app_server" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = var.key_name
  subnet_id              = data.aws_subnets.default.ids[0]
  vpc_security_group_ids = [aws_security_group.app_server.id]

  root_block_device {
    volume_size           = var.root_volume_size
    volume_type           = "gp3"
    delete_on_termination = true
  }

  user_data = templatefile("${path.module}/user_data.sh", {
    sslip_hostname    = "${aws_eip.app_server.public_ip}.sslip.io"
    letsencrypt_email = var.letsencrypt_email
  })
  user_data_replace_on_change = true

  tags = {
    Name = "${var.project_name}-server"
  }
}

# Separate from aws_eip so the instance can depend on the EIP's address (for
# the sslip.io hostname) without creating a dependency cycle.
resource "aws_eip_association" "app_server" {
  instance_id   = aws_instance.app_server.id
  allocation_id = aws_eip.app_server.id
}
