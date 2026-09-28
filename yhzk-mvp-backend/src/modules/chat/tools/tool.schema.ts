/**
 * JSON Schema 校验器（Task 5）
 *
 * 不引入新依赖，实现所需子集：
 * object/string/integer/number/boolean/array + required/enum/长度/范围/items/format(date-time)
 * 返回字段级错误列表；校验不通过时调用方必须拒绝执行工具（不得让模型伪造结果）。
 */
import { JsonSchema } from './tool.types';

export interface ValidationOutcome {
  ok: boolean;
  errors: string[];
}

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function typeName(value: unknown): string {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function validateNode(schema: JsonSchema, value: unknown, path: string, errors: string[]): void {
  const label = path || 'arguments';

  switch (schema.type) {
    case 'object': {
      if (typeName(value) !== 'object') {
        errors.push(`${label}: 必须是对象`);
        return;
      }
      const obj = value as Record<string, unknown>;
      for (const req of schema.required ?? []) {
        if (obj[req] === undefined || obj[req] === null || obj[req] === '') {
          errors.push(`${label}.${req}: 缺失必填参数`);
        }
      }
      for (const [key, child] of Object.entries(schema.properties ?? {})) {
        if (obj[key] !== undefined && obj[key] !== null) {
          validateNode(child, obj[key], path ? `${path}.${key}` : key, errors);
        }
      }
      return;
    }
    case 'array': {
      if (typeName(value) !== 'array') {
        errors.push(`${label}: 必须是数组`);
        return;
      }
      const arr = value as unknown[];
      if (schema.maxItems !== undefined && arr.length > schema.maxItems) {
        errors.push(`${label}: 最多 ${schema.maxItems} 项`);
      }
      if (schema.items) {
        arr.forEach((item, i) => validateNode(schema.items as JsonSchema, item, `${label}[${i}]`, errors));
      }
      return;
    }
    case 'string': {
      if (typeName(value) !== 'string') {
        errors.push(`${label}: 必须是字符串`);
        return;
      }
      const s = String(value);
      if (schema.minLength !== undefined && s.length < schema.minLength) {
        errors.push(`${label}: 长度不能少于 ${schema.minLength}`);
      }
      if (schema.maxLength !== undefined && s.length > schema.maxLength) {
        errors.push(`${label}: 长度不能超过 ${schema.maxLength}`);
      }
      if (schema.format === 'date-time' && !ISO_DATETIME.test(s) && !DATE_ONLY.test(s)) {
        errors.push(`${label}: 时间格式必须为 ISO 8601（如 2026-09-30T08:00:00+08:00）`);
      }
      break;
    }
    case 'integer': {
      if (typeName(value) !== 'number' || !Number.isInteger(value as number)) {
        errors.push(`${label}: 必须是整数`);
        return;
      }
      break;
    }
    case 'number': {
      if (typeName(value) !== 'number') {
        errors.push(`${label}: 必须是数字`);
        return;
      }
      break;
    }
    case 'boolean': {
      if (typeName(value) !== 'boolean') {
        errors.push(`${label}: 必须是布尔值`);
        return;
      }
      break;
    }
    default:
      break;
  }

  if (schema.enum && !schema.enum.includes(value as string | number)) {
    errors.push(`${label}: 取值必须是 ${schema.enum.join(' / ')} 之一`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${label}: 不能小于 ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(`${label}: 不能大于 ${schema.maximum}`);
    }
  }
}

/** 校验（一次收集全部错误） */
export function validateAgainstSchema(
  schema: JsonSchema,
  value: unknown,
): ValidationOutcome {
  const errors: string[] = [];
  validateNode(schema, value, '', errors);
  return { ok: errors.length === 0, errors };
}
