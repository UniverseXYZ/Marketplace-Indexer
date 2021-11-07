from run_cmd import cmd
from cli.commands import kccc, kcuc, kgns, kcns, kgsec, kcsec
from utils import ROOT_PATH
import pprint
import yaml
import base64
import os
import sys

TEMP_DIR = "/tmp"


class Kubectl:
    def __init__(self):
        self.current_context = ""
        self.namespace = ""

        pp = pprint.PrettyPrinter(indent=2, width=100)
        self.print_msg = pp.pprint
        self.rootPath = ROOT_PATH

    def get_current_context(self) -> str:
        rc, out = cmd.run(kccc())
        self.current_context = out
        print(f"The Kubernetes current context is: {out}")
        return self.current_context

    def use_context(self, ctx: str) -> bool:
        if self.get_current_context() != ctx:
            rc, out = cmd.run(kcuc(ctx))
            if rc != 0:
                self.print_msg(f"failed to use the context: {ctx} Error: {out}")
                return False
            else:
                self.current_context = ctx
                return True
        else:
            self.print_msg(
                f"The current context is: ${self.get_current_context()}. No need to change."
            )
            return True

    def create_namespace(self, namespace: str):
        rc, out = cmd.run(kgns(namespace))
        if rc != 0:
            if "Unauthorized" in out:
                print("Error: Unauthorized Operation! Your credentials are invalid.")
                sys.exit(-1)
            cmd.run(kcns(namespace))
        self.namespace = namespace

    def get_secret_files(self, namespace, secret_key_name):
        rc, out = cmd.run(
            "kubectl get secret {}  -n {} -o yaml".format(secret_key_name, namespace)
        )
        if rc == 0:
            obj = yaml.full_load(out)
            if obj["data"] is not None:
                for key, value in obj["data"].items():
                    print(key, base64.b64decode(value))
                    with open(TEMP_DIR + "/" + key, "w") as f:
                        f.write(base64.b64decode(value).decode())
                return len(obj["data"])
            else:
                self.print_msg("no key files in the secret")
        return 0

    def get_configmap_files(self, namespace, configmap_name):
        rc, out = cmd.run(
            "kubectl get configmap {} -n {} -o yaml".format(configmap_name, namespace)
        )
        if rc == 0:
            obj = yaml.full_load(out)
            if obj["data"] is not None:
                for key, value in obj["data"].items():
                    print(key, base64.b64decode(value))
                    with open(TEMP_DIR + "/" + key, "w") as f:
                        f.write(base64.b64decode(value).decode())
                return len(obj["data"])
            else:
                self.print_msg("no key files in the secret")
        return 0

    def parse_yaml_file(self, file_path: str):
        if file_path == "":
            self.print_msg("Warning: the yaml file path is null")
            return None
        with open(file_path) as file:
            yaml_obj = yaml.load(file, Loader=yaml.FullLoader)
            namespace = yaml_obj.get("namespace")
            # secret_key_name = yaml_obj.get("keySecrets").get("secretName")
            # app_name = yaml_obj.get("appName")
            # count = yaml_obj.get("replicaCount")
            # parent = yaml_obj.get("parentName")
            # secrets = yaml_obj.get("secrets")
            return namespace

    def update_image_tag(self, image_tag: str):
        file_path = "./helm_chart/values.yaml"
        with open(file_path) as file:
            yaml_obj = yaml.load(file, Loader=yaml.FullLoader)
            image = yaml_obj["image"]
            image["tag"] = image_tag
        with open(file_path, "w") as new_file:
            yaml.dump(yaml_obj, new_file)

    def deploy_with_helm3(
        self,
        yaml_file_path: str,
        namespace: str,
        app_name: str,
        dry_run: bool = False,
    ):

        template_path = f"./helm_chart"

        helm_install_cmd = f"helm upgrade --install --debug -n {namespace} {app_name}-release {template_path} -f {yaml_file_path}"

        if dry_run:
            helm_install_cmd += f" --dry-run"

        cmd.run(helm_install_cmd)

    def create_update_secret(self, namespace, app_name, count, secret_key_name):
        update_secret_cmd = (
            "kubectl delete secret --ignore-not-found {}  -n {} ".format(
                secret_key_name, namespace
            )
        )
        rc, out = cmd.run(update_secret_cmd)
        if rc == 0:
            self.print_msg("deleted the secret")

        update_secret_cmd = kcsec(secret_key_name, namespace)

        update_secret_cmd += "  --from-file={0}/{1}-secret".format(TEMP_DIR, app_name)

        cmd.run(update_secret_cmd)

    def create_update_configmap(self, namespace, configmap_name, appsetting_path):
        update_configmap_cmd = (
            "kubectl delete configmap --ignore-not-found {}  -n {} ".format(
                configmap_name, namespace
            )
        )

        rc, out = cmd.run(update_configmap_cmd)
        if rc == 0:
            self.print_msg("deleted the configmap")

        update_configmap_cmd = (
            "kubectl create configmap appsettings --from-file={}={} -n={}".format(
                f"{configmap_name}.json", appsetting_path, namespace
            )
        )

        rc, out = cmd.run(update_configmap_cmd)
        if rc == 0:
            self.print_msg("created the configmap")
