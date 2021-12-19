import { registerAs } from '@nestjs/config';
import R from 'ramda';
import { getAppSettings, getSecrets } from '../../utils/config';

const appsettings = getAppSettings('appsettings');
const secrets = getSecrets('secrets');

export const configValues = R.mergeDeepRight(appsettings, secrets);

export default registerAs('config', () => {
  return configValues;
});
