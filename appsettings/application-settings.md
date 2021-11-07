# Application Settings

The application settings file is used to store the non-sensitive configuration.

Uploading the file as config map into kubernetes.

```bash
kubectl create configmap appsettings --from-file="appsettings.json"=./appsettings/appsettings.development.json --namespace universal-marketplace-backend
```
