/**
 * Utility Classes for Maple Bear Addon
 * Weight, NumberRange, and Placeholder classes for common operations
 */

/**
 * Weight class for weighted random selection
 * Based on Weight class from Bedrock Add-Ons Discord
 */
export class Weight {
    constructor(weight, content) {
        this.weight = weight;
        this.content = content;
    }

    static sortWeights(weights) {
        return weights.sort((a, b) => b.weight - a.weight);
    }

    static getHeaviest(weights) {
        let heaviest = null;
        for (const weight of weights) {
            if (heaviest === null || weight.weight > heaviest.weight) {
                heaviest = weight;
            }
        }
        return heaviest;
    }

    static randomWeight(weights) {
        if (!Array.isArray(weights) || weights.length === 0) {
            throw new TypeError('randomWeight requires a non-empty weights array');
        }
        const totalWeight = weights.reduce((total, weight) => total + weight.weight, 0);
        const randomWeight = Math.random() * totalWeight;
        let currentWeight = 0;

        for (const weight of weights) {
            currentWeight += weight.weight;
            if (randomWeight < currentWeight) {
                return weight;
            }
        }
        return weights[weights.length - 1]; // Fallback to last item
    }
}

/**
 * NumberRange class for working with number ranges
 * Based on NumberRange class from Bedrock Add-Ons Discord
 */
export class NumberRange {
    constructor(min, max) {
        this.min = min;
        this.max = max;
    }

    toArray() {
        return [this.min, this.max];
    }

    toString(separator = ", ") {
        return `${this.min}${separator}${this.max}`;
    }

    copy() {
        return new NumberRange(this.min, this.max);
    }

    isInRange(value) {
        return value >= this.min && value <= this.max;
    }

    offset(value) {
        return value < this.min ? this.min - value : value > this.max ? value - this.max : 0;
    }

    cut(value) {
        return value < this.min ? this.min : value > this.max ? this.max : value;
    }
}

/**
 * Placeholder class for dynamic message templates
 * Based on Placeholder class from Bedrock Add-Ons Discord
 */
export class Placeholder {
    constructor(placeholderText, defaultValue = "N/A") {
        this.placeholderText = placeholderText;
        this.defaultValue = defaultValue;
    }

    parse(content) {
        return Placeholder.parse(this.placeholderText, content, this.defaultValue);
    }

    static parse(placeholderText, content, defaultValue = "N/A") {
        return placeholderText.replace(/\{(\w+)\}/g, (_, key) => {
            const value = content[key];
            if (value == null) {
                return defaultValue;
            }
            return typeof value === "function" ? value(key, defaultValue) : value;
        });
    }
}
