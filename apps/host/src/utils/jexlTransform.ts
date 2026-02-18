// =============================================================================
// JEXL Transformation Utility
// =============================================================================
// Client-side JEXL expression evaluator for transforming sensor telemetry
// values according to DeviceProfile mappings.

import { MappingEntry } from '@/services/deviceProfilesApi';

/**
 * Safe evaluation of simple JEXL-like expressions
 * Supports: val, val * N, val / N, val + N, val - N, (val - N) * M / P
 * 
 * @param expression - The transformation expression (e.g., "val * 0.1")
 * @param value - The input value to transform
 * @returns The transformed value
 */
export function evaluateExpression(expression: string, value: number): number {
    if (!expression || expression.trim() === '' || expression.trim() === 'val') {
        return value;
    }

    // Sanitize: remove dangerous patterns
    const dangerous = ['import', 'require', 'eval', 'exec', 'function', 'process', 'window', 'document'];
    const lowerExpr = expression.toLowerCase();
    for (const d of dangerous) {
        if (lowerExpr.includes(d)) {
            console.warn(`[JEXL] Blocked dangerous expression: ${expression}`);
            return value;
        }
    }

    try {
        // Replace 'val' with actual value
        const expr = expression.replace(/\bval\b/g, String(value));

        // Only allow safe characters: digits, operators, parentheses, spaces, decimal points
        if (!/^[\d\s+\-*/().]+$/.test(expr)) {
            console.warn(`[JEXL] Expression contains invalid characters: ${expression}`);
            return value;
        }

        // Evaluate using Function (safer than eval for simple math)
         
        const result = new Function(`return ${expr}`)();

        if (typeof result !== 'number' || !isFinite(result)) {
            console.warn(`[JEXL] Expression returned invalid result: ${expression} → ${result}`);
            return value;
        }

        return result;
    } catch (err) {
        console.warn(`[JEXL] Error evaluating expression: ${expression}`, err);
        return value;
    }
}

/**
 * Transform raw telemetry payload using DeviceProfile mappings
 * 
 * @param rawPayload - The raw sensor payload (e.g., { temp_out: 234, hum: 65 })
 * @param mappings - Array of mapping entries from DeviceProfile
 * @returns Transformed payload with SDM attribute names and transformed values
 */
export function transformPayload(
    rawPayload: Record<string, any>,
    mappings: MappingEntry[]
): Record<string, any> {
    if (!rawPayload || !mappings || mappings.length === 0) {
        return rawPayload;
    }

    const transformed: Record<string, any> = {};

    for (const mapping of mappings) {
        const { incoming_key, target_attribute, transformation, type, unitCode } = mapping;

        // Check if raw payload has this key
        const rawValue = rawPayload[incoming_key];
        if (rawValue === undefined) continue;

        let value: any;

        // Apply transformation for numeric types
        if (type === 'Number' && typeof rawValue === 'number') {
            value = evaluateExpression(transformation || 'val', rawValue);
        } else if (type === 'Boolean') {
            value = Boolean(rawValue);
        } else {
            value = rawValue;
        }

        // Store in SDM format
        if (unitCode) {
            transformed[target_attribute] = {
                value,
                unitCode,
                observedAt: new Date().toISOString()
            };
        } else {
            transformed[target_attribute] = value;
        }
    }

    // Include any unmapped keys as-is
    for (const key of Object.keys(rawPayload)) {
        const isMapped = mappings.some(m => m.incoming_key === key);
        if (!isMapped && !transformed[key]) {
            transformed[key] = rawPayload[key];
        }
    }

    return transformed;
}

/**
 * Get display info for a transformed attribute
 */
export interface TransformedAttributeInfo {
    sdmName: string;
    originalName: string;
    value: any;
    displayValue: string;
    unit: string;
    type: string;
}

export function getTransformedAttributeInfo(
    rawPayload: Record<string, any>,
    mappings: MappingEntry[]
): TransformedAttributeInfo[] {
    const result: TransformedAttributeInfo[] = [];

    for (const mapping of mappings) {
        const { incoming_key, target_attribute, transformation, type, unitCode } = mapping;
        const rawValue = rawPayload[incoming_key];

        if (rawValue === undefined) continue;

        let value: any = rawValue;
        if (type === 'Number' && typeof rawValue === 'number') {
            value = evaluateExpression(transformation || 'val', rawValue);
        }

        // Format display value
        let displayValue = String(value);
        if (type === 'Number' && typeof value === 'number') {
            displayValue = value.toFixed(2);
        }

        result.push({
            sdmName: target_attribute,
            originalName: incoming_key,
            value,
            displayValue,
            unit: unitCode || '',
            type: type || 'Text'
        });
    }

    return result;
}
