import argparse
from cli.kubectl import Kubectl


def main(
    app_name: str,
    yaml_file_path: str,
    ctx: str,
    appsettings_file_path: str,
    image_tag: str,
    dryRun: bool,
):
    kubectl = Kubectl()
    # Step 1. parse the yaml file into object
    namespace = kubectl.parse_yaml_file(yaml_file_path)
    kubectl.update_image_tag(image_tag)

    # Step 2. shift to the context to need
    kubectl.use_context(ctx)

    # Step 3. Create the namespace if it does not exist
    kubectl.create_namespace(namespace)

    # Step 4. Configmap
    # num = kubectl.get_configmap_files(namespace, 'appsettings')
    kubectl.create_update_configmap(namespace, "appsettings", appsettings_file_path)

    # Step 5. helm install
    kubectl.deploy_with_helm3(yaml_file_path, namespace, app_name, dryRun)


# Press the green button in the gutter to run the script.
if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Create namespace and secret key defined in a given values.yaml file"
    )
    parser.add_argument(
        "-f",
        "--file",
        help="helm chart yaml file which used to deploy the application to kubernetes",
    )
    parser.add_argument(
        "-c", "--context", help="the kubernetes context you are going to use"
    )
    parser.add_argument(
        "-d",
        "--dryrun",
        action="store_true",
        help="print the yaml file without executing them",
    )
    parser.add_argument(
        "-a", "--appsettings", help="appsettings file path used by the app"
    )
    parser.add_argument("-n", "--appname", help="app release name")
    parser.add_argument("-t", "--imagetag", help="app image tag")

    args = parser.parse_args()
    file_path = getattr(args, "file")
    context = args.context
    dryRun = args.dryrun
    appsettings_path = args.appsettings
    app_name = args.appname
    image_tag = args.imagetag

    main(app_name, file_path, context, appsettings_path, image_tag, dryRun)
