/**
 * Copyright 2024 Google LLC.
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type * as Bidi from './bidi-types';


/**
 * @internal
 */
class UnserializableError extends Error {}

/**
 * @internal
 */
export class BidiSerializer {
  static serialize(arg: unknown): Bidi.Script.LocalValue {
    switch (typeof arg) {
      case 'symbol':
      case 'function':
        throw new UnserializableError(`Unable to serializable ${typeof arg}`);
      case 'object':
        return BidiSerializer._serializeObject(arg);

      case 'undefined':
        return {
          type: 'undefined',
        };
      case 'number':
        return BidiSerializer._serializeNumber(arg);
      case 'bigint':
        return {
          type: 'bigint',
          value: arg.toString(),
        };
      case 'string':
        return {
          type: 'string',
          value: arg,
        };
      case 'boolean':
        return {
          type: 'boolean',
          value: arg,
        };
    }
  }

  static _serializeNumber(arg: number): Bidi.Script.LocalValue {
    let value: Bidi.Script.SpecialNumber | number;
    if (Object.is(arg, -0)) {
      value = '-0';
    } else if (Object.is(arg, Infinity)) {
      value = 'Infinity';
    } else if (Object.is(arg, -Infinity)) {
      value = '-Infinity';
    } else if (Object.is(arg, NaN)) {
      value = 'NaN';
    } else {
      value = arg;
    }
    return {
      type: 'number',
      value,
    };
  }

  static _serializeObject(arg: object | null): Bidi.Script.LocalValue {
    if (arg === null) {
      return {
        type: 'null',
      };
    } else if (Array.isArray(arg)) {
      const parsedArray = arg.map(subArg => {
        return BidiSerializer.serialize(subArg);
      });

      return {
        type: 'array',
        value: parsedArray,
      };
    } else if (isPlainObject(arg)) {
      try {
        JSON.stringify(arg);
      } catch (error) {
        if (
          error instanceof TypeError &&
          error.message.startsWith('Converting circular structure to JSON')
        ) {
          error.message += ' Recursive objects are not allowed.';
        }
        throw error;
      }

      const parsedObject: Bidi.Script.MappingLocalValue = [];
      for (const key in arg) {
        parsedObject.push([BidiSerializer.serialize(key), BidiSerializer.serialize(arg[key])]);
      }

      return {
        type: 'object',
        value: parsedObject,
      };
    } else if (isRegExp(arg)) {
      return {
        type: 'regexp',
        value: {
          pattern: arg.source,
          flags: arg.flags,
        },
      };
    } else if (isDate(arg)) {
      return {
        type: 'date',
        value: arg.toISOString(),
      };
    }

    throw new UnserializableError(
      'Custom object serialization not possible. Use plain objects instead.'
    );
  }
}

/**
 * @internal
 */
export const isPlainObject = (obj: unknown): obj is Record<any, unknown> => {
  return typeof obj === 'object' && obj?.constructor === Object;
};

/**
 * @internal
 */
export const isRegExp = (obj: unknown): obj is RegExp => {
  return typeof obj === 'object' && obj?.constructor === RegExp;
};

/**
 * @internal
 */
export const isDate = (obj: unknown): obj is Date => {
  return typeof obj === 'object' && obj?.constructor === Date;
};
