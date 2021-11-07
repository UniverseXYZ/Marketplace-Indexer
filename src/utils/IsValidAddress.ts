/* eslint-disable @typescript-eslint/ban-types */
import web3 from 'web3';

import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

@ValidatorConstraint()
export class IsValidAddressConstraint implements ValidatorConstraintInterface {
  validate(address: any, args: ValidationArguments) {
    const isValid = web3.utils.isAddress(address);
    return isValid;
  }
}

export function IsValidWalletAddress(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsValidAddressConstraint,
    });
  };
}
