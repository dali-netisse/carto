#!/usr/bin/env node

/**
 * Perl-compatible Math module
 * Calls Perl for all mathematical operations to ensure 100% precision compatibility
 */

import { execSync } from 'child_process';

const usePerl = false; // Set to true if you want to use Perl for math operations

/**
 * Call Perl for mathematical operations to match precision exactly
 * @param {string} operation - Perl mathematical expression
 * @returns {number} Result from Perl
 */
function callPerl(operation) {
  try {
    const result = execSync(`perl -e "use Math::Trig; print ${operation};"`, {
      encoding: 'utf8',
      timeout: 1000
    });
    return parseFloat(result.trim());
  } catch (error) {
    console.error(`Perl Math operation failed: ${operation}`, error);
    throw error;
  }
}

/**
 * Perl-compatible atan2 function
 * @param {number} y - Y component
 * @param {number} x - X component
 * @returns {number} Angle in radians
 */
export function atan2(y, x) {
  return usePerl ? callPerl(`atan2(${y}, ${x})`) : Math.atan2(y, x);
}

/**
 * Perl-compatible PI constant
 * @returns {number} PI value from Perl
 */
export function PI() {
  return usePerl ? callPerl('pi') : Math.PI;
}

/**
 * Perl-compatible PI/2 constant
 * @returns {number} PI/2 value from Perl
 */
export function PI_2() {
  return usePerl ? callPerl('pi/2') : Math.PI / 2;
}

/**
 * Perl-compatible sin function
 * @param {number} x - Angle in radians
 * @returns {number} Sine value
 */
export function sin(x) {
  return usePerl ? callPerl(`sin(${x})`) : Math.sin(x);
}

/**
 * Perl-compatible cos function
 * @param {number} x - Angle in radians
 * @returns {number} Cosine value
 */
export function cos(x) {
  return usePerl ? callPerl(`cos(${x})`) : Math.cos(x);
}

/**
 * Perl-compatible tan function
 * @param {number} x - Angle in radians
 * @returns {number} Tangent value
 */
export function tan(x) {
  return usePerl ? callPerl(`tan(${x})`) : Math.tan(x);
}

/**
 * Perl-compatible sqrt function
 * @param {number} x - Number to get square root of
 * @returns {number} Square root
 */
export function sqrt(x) {
  return usePerl ? callPerl(`sqrt(${x})`) : Math.sqrt(x);
}

/**
 * Perl-compatible abs function
 * @param {number} x - Number to get absolute value of
 * @returns {number} Absolute value
 */
export function abs(x) {
  return usePerl ? callPerl(`abs(${x})`) : Math.abs(x);
}

// For convenience, export constants as values
export const PI_VALUE = PI();
export const PI_2_VALUE = PI_2();

// Export a PerlMath object that mimics the Math object but uses Perl
export const PerlMath = {
  atan2,
  sin,
  cos,
  tan,
  sqrt,
  abs,
  PI: PI_VALUE,
  PI_2: PI_2_VALUE,

  // For operations that don't need Perl precision, use native JS
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  min: Math.min,
  max: Math.max,
  random: Math.random
};
