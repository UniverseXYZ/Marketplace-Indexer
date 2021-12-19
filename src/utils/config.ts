import { readFileSync } from 'fs';
import appRoot from 'app-root-path';

export function getAppSettings(name: string) {
  try {
    const data = readFileSync(`${appRoot}/appsettings/${name}.json`);
    console.log('read appsettings successfully');
    return JSON.parse(data.toString());
  } catch (e) {
    console.log('read appsettings failed');
    return {};
  }
}

export function getSecrets(name: string) {
  try {
    const data = readFileSync(`${appRoot}/secrets/${name}.json`);
    console.log('read secrets successfully');
    return JSON.parse(data.toString());
  } catch (e) {
    console.log('read secrets failed');
    return {};
  }
}
