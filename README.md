# KubeSpark Console

Kubernetes visual management console focusing on resource CRUD and collaborative YAML editing.

## Features

- Manage common resources: Namespaces, Pods, Services, Jobs, CronJobs, etc.
- Create/Edit resources with visual form or YAML
- View YAML and `kubectl describe` style details
- Real-time container logs
- Container terminal access

## Screenshots

![Pods List](docs/img/img.png)
![Container Terminal](docs/img/img_6.png)
![Service Edit](docs/img/img_1.png)
![YAML View](docs/img/img_2.png)
![CronJob Multi-step Edit](docs/img/img_3.png)
![Container Input Dialog](docs/img/img_4.png)
![Real-time Logs](docs/img/img_5.png)

## Quick Start

### Prerequisites

- Kubernetes cluster
- kubectl configured

### Installation

```bash
cd deployment
./install.sh
```

### Install Drone CI/CD (Optional)

```bash
cd deployment
./install-drone-cicd.sh
```

### Uninstall

```bash
cd deployment
./uninstall.sh
```

### Access Console

After installation, access at:
```
http://<node-ip>:30000
```

Default credentials:
- Username: `admin`
- Password: (set during installation)

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Updating Images

Since images use the `:dev` tag, running pods won't automatically update to the latest version. GitHub Actions continuously pushes new images. To get the latest:

```bash
kubectl rollout restart deployment/kubespark -n kubespark
kubectl rollout restart deployment/kubespark-console -n kubespark
```

## Shell Recommendation

For Windows:
1. PowerShell 7 (Recommended)
2. Git Bash

## License

-
