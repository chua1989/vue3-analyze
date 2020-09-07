import {objectToString, toTypeString} from "../../../vue-next/packages/shared/src";

const hasOwnProperty = Object.prototype.hasOwnProperty
export const hasOwn = (val, key) => hasOwnProperty.call(val, key)

export const isArray = Array.isArray
export const isFunction = (val) => typeof val === 'function'
export const isString = (val) => typeof val === 'string'
export const isSymbol = (val) => typeof val === 'symbol'
export const isObject = (val) => val !== null && typeof val === 'object'


export const isIntegerKey = (key) =>
    isString(key) && key[0] !== '-' && '' + parseInt(key, 10) === key

export const hasChanged = (value, oldValue) =>
    value !== oldValue && (value === value || oldValue === oldValue)

export const toTypeString = (value) =>
    objectToString.call(value)
export const toRawType = (value) => {
    return toTypeString(value).slice(8, -1)
}
