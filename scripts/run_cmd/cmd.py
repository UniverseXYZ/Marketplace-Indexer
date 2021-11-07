import subprocess

def run(cmd: str):
  if cmd in (None, ''):
    return_code = -1
    result = 'the command line is none or empty'
    return return_code, result

  print(f'Running command: {cmd}')
  process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, shell=True)
  result = process.communicate()[0]
  print(f'Command output: \n {result.decode()}')
  return process.returncode, result.decode()