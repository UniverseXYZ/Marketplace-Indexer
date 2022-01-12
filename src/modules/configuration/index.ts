import { registerAs } from '@nestjs/config';

export const configValues = process.env;

export default registerAs('config', () => {
  return configValues;
});
