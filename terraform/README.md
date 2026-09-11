# Terraform: Ubuntu Server on AWS EC2

Provisions a single Ubuntu 24.04 LTS server on AWS EC2 to host this app (ASPAC eLearning),
with Docker pre-installed and a firewall configured. Designed to sit alongside the
existing AWS RDS Postgres database this project already uses.

## What gets created

| Resource | Purpose |
|---|---|
| `aws_instance.app_server` | Ubuntu 24.04 LTS EC2 instance (Docker pre-installed via `user_data.sh`) |
| `aws_eip.app_server` | Static public IP attached to the instance, so the IP never changes on reboot |
| `aws_security_group.app_server` | Firewall: allows SSH (22), HTTP (80), HTTPS (443), app port (3000) |
| `aws_security_group_rule.allow_app_to_rds` | *(optional)* opens port 5432 on your existing RDS security group to this server |

Nothing else in your AWS account is touched. All resources are tagged with `project_name`
so they're easy to find and to tear down.

## Prerequisites

1. **An AWS account** with permission to create EC2 instances, security groups, and Elastic IPs.
2. **AWS CLI configured locally** with credentials (`aws configure`). Verify with:
   ```powershell
   aws sts get-caller-identity
   ```
3. **Terraform** >= 1.5 installed. Verify with:
   ```powershell
   terraform -version
   ```
   If not installed: `winget install HashiCorp.Terraform` (or see https://developer.hashicorp.com/terraform/install).
4. **An existing EC2 key pair** in the `ap-southeast-1` region (Singapore), so you can SSH in.
   List your key pairs:
   ```powershell
   aws ec2 describe-key-pairs --region ap-southeast-1
   ```
   If you don't have one yet, create it and save the `.pem` file somewhere safe:
   ```powershell
   aws ec2 create-key-pair --region ap-southeast-1 --key-name aspac-elearning-key --query "KeyMaterial" --output text | Out-File -Encoding ascii aspac-elearning-key.pem
   ```

All commands below assume you're running them from this `terraform/` folder.

---

## Step 1 — Find your public IP

You'll restrict SSH access to just your own IP address instead of the whole internet.

```powershell
curl ifconfig.me
```

Note the result, e.g. `203.0.113.10` — you'll use it as `203.0.113.10/32` in the next step.

## Step 2 — Configure your variables

Copy the example file and edit it:

```powershell
Copy-Item terraform.tfvars.example terraform.tfvars
```

Open `terraform.tfvars` and fill in:
- `key_name` — the EC2 key pair name from the prerequisites step.
- `allowed_ssh_cidr` — your IP from Step 1, in `x.x.x.x/32` format.
- `rds_security_group_id` *(optional)* — the security group ID attached to your RDS
  instance, if you want Terraform to automatically allow this server to reach it. Find it in
  the AWS Console under RDS → your database → Connectivity & security → VPC security groups,
  or via:
  ```powershell
  aws rds describe-db-instances --region ap-southeast-1 --query "DBInstances[].VpcSecurityGroups"
  ```

`terraform.tfvars` is git-ignored, so your values stay local.

## Step 3 — Initialize Terraform

Downloads the AWS provider plugin.

```powershell
terraform init
```

## Step 4 — Review the plan

Shows exactly what will be created before anything happens.

```powershell
terraform plan
```

Confirm it shows 1 instance, 1 Elastic IP, 1 security group (and optionally 1 security group rule) being **added**, nothing being destroyed.

## Step 5 — Apply

Creates the real resources in AWS. Type `yes` when prompted.

```powershell
terraform apply
```

This takes 1-2 minutes. When it finishes, Terraform prints outputs including `public_ip` and
`ssh_command`. You can see them again anytime with:

```powershell
terraform output
```

## Step 6 — Connect to the server

Use the `ssh_command` output, pointing `-i` at your actual `.pem` file path:

```powershell
ssh -i C:\path\to\aspac-elearning-key.pem ubuntu@<public_ip>
```

If this is your first connection, accept the host key fingerprint prompt.

> The server takes ~1-2 minutes after creation to finish running its startup script
> (installing Docker). If SSH connects but `docker --version` isn't found yet, wait a minute
> and try again, or check progress with `cloud-init status --wait`.

## Step 7 — Verify Docker is ready

Run on the server (via SSH):

```bash
docker --version
docker compose version
```

Both should print version numbers. The startup script also enabled a firewall (`ufw`) allowing
only ports 22, 80, 443, and 3000.

## Step 8 — Get the app code onto the server

On the server:

```bash
cd /opt/aspac_elearning
git clone https://github.com/rcmartinez890/aspac_elearning.git .
```

This is a private repo, so `git clone` will prompt for credentials — use a GitHub Personal
Access Token as the password, or set up a deploy key beforehand.

## Step 9 — Configure environment variables

Copy your real `.env` values to the server. From your **local machine** (not the server):

```powershell
scp -i C:\path\to\aspac-elearning-key.pem .env ubuntu@<public_ip>:/opt/aspac_elearning/.env
scp -i C:\path\to\aspac-elearning-key.pem global-bundle.pem ubuntu@<public_ip>:/opt/aspac_elearning/global-bundle.pem
```

Make sure `.env` on the server has `DATABASE_URL` pointing at your RDS endpoint (not
`localhost`), matching the `RDS_*` values you already use for `scripts/db-check.ts`.

## Step 10 — Run the app

`compose.yaml` in this repo is set up for **local development** — it also starts its own
Postgres container and overrides `DATABASE_URL` to point at it. To run against your existing
RDS database instead of a local Postgres container, build and run just the app container
directly, using your `.env`:

```bash
cd /opt/aspac_elearning
docker build -t aspac-elearning .
docker run -d --name aspac-elearning \
  --env-file .env \
  -p 80:3000 \
  --restart unless-stopped \
  aspac-elearning \
  sh -c "npx prisma generate && npx prisma migrate deploy && npm run dev -- --hostname 0.0.0.0"
```

(If you'd rather use the local Postgres container from `compose.yaml` for a quick trial
instead of RDS, `docker compose up -d --build` works as-is — same as local development.)

## Step 11 — Confirm it's working

From your browser, visit:

```
http://<public_ip>
```

You should see the ASPAC eLearning app. Check logs anytime with:

```bash
docker logs -f aspac-elearning
```

## Updating the app later

```bash
cd /opt/aspac_elearning
git pull
docker build -t aspac-elearning .
docker stop aspac-elearning && docker rm aspac-elearning
docker run -d --name aspac-elearning --env-file .env -p 80:3000 --restart unless-stopped \
  aspac-elearning sh -c "npx prisma generate && npx prisma migrate deploy && npm run dev -- --hostname 0.0.0.0"
```

## Optional next steps (not covered by this Terraform)

- **HTTPS / custom domain**: put a reverse proxy (Caddy or nginx + certbot) in front of the
  app container, and point your domain's DNS `A` record at the `public_ip` output.
- **Production build**: the shared `Dockerfile` runs `next dev`. For a real production
  deployment, build with `npm run build` and start with `npm run start` instead.
- **Remote Terraform state**: state is stored locally (`terraform.tfstate`) by default, fine
  for solo use. For a team, move to an S3 backend with state locking.

## Tearing it down

Destroys the EC2 instance, Elastic IP, and security group. **This does not touch your RDS
database** — only resources this Terraform created.

```powershell
terraform destroy
```

Type `yes` to confirm. Your data on the RDS database is untouched; only the compute server
and its networking are removed.

## Cost note

A `t3.medium` in `ap-southeast-1` runs continuously and is billed hourly (check current
pricing at https://aws.amazon.com/ec2/pricing/on-demand/). Run `terraform destroy` when you
don't need the server, or downsize `instance_type` in `terraform.tfvars` (e.g. `t3.small`) for
lighter workloads.

## Troubleshooting

| Problem | Fix |
|---|---|
| `terraform apply` fails with a credentials error | Re-run `aws sts get-caller-identity`; re-run `aws configure` if it fails |
| `Error: InvalidKeyPair.NotFound` | `key_name` doesn't exist in `ap-southeast-1` — check with `aws ec2 describe-key-pairs --region ap-southeast-1` |
| SSH connection times out | Check `allowed_ssh_cidr` matches your current public IP (it may have changed) |
| SSH works but `docker` command not found | Startup script still running — wait ~1 min, or run `cloud-init status --wait` on the server |
| Can't reach the app in browser | Confirm the container is running (`docker ps`), and that `allowed_http_cidr` includes your IP |
| App can't connect to the database | Confirm `DATABASE_URL`/`RDS_*` in `.env` are correct, and that `rds_security_group_id` was set (or manually add an inbound rule on the RDS security group for port 5432 from this server's security group) |

## File reference

| File | Purpose |
|---|---|
| `versions.tf` | Terraform + AWS provider version constraints |
| `provider.tf` | AWS provider region configuration |
| `variables.tf` | All configurable inputs |
| `data.tf` | Looks up the default VPC/subnets and latest Ubuntu 24.04 AMI |
| `network.tf` | Security group (firewall rules) |
| `main.tf` | The EC2 instance and its Elastic IP |
| `outputs.tf` | Values printed after `apply` (IP, SSH command, etc.) |
| `user_data.sh` | Startup script: installs Docker, Compose plugin, UFW firewall |
| `terraform.tfvars.example` | Template for your local `terraform.tfvars` |
