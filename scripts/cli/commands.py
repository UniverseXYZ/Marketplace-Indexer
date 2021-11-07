kccc = lambda: "kubectl config current-context"
kcuc = lambda context: f"kubectl config use-context {context}"
kgns = lambda namespace: f"kubectl get ns {namespace}"
kcns = lambda namespace: f"kubectl create ns {namespace}"
kgsec = (
    lambda secret_name, namespace: f"kubectl get secret {secret_name} -n {namespace}"
)
kcsec = (
    lambda secret_name, namespace: f"kubectl create secret generic {secret_name} -n {namespace}"
)
