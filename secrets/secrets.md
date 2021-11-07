# Secret File Usage

This secret file needs to be uploaded to the kubernetes secret.

```bash
kubectl create secret generic universal-marketplace-secrets --from-file=./secret.json --namespace=universal-marketplace-backend
```
