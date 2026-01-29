/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * File classification utilities for importance analysis
 */

/**
 * Check if file is a test file
 */
export function isTestFile(relPath: string, nameLower: string): boolean {
  const pathLower = relPath.toLowerCase();

  // Directory-based detection
  const testDirs = ['/test/', '/tests/', '/__tests__/', '/spec/', '/specs/'];
  if (
    testDirs.some(
      (dir) => pathLower.includes(dir) || pathLower.startsWith(dir.slice(1)),
    )
  ) {
    return true;
  }

  // Filename-based detection
  return (
    nameLower.startsWith('test_') ||
    nameLower.endsWith('_test') ||
    nameLower.endsWith('_tests') ||
    pathLower.includes('.test.') ||
    pathLower.includes('.spec.') ||
    nameLower.endsWith('test') ||
    nameLower.endsWith('tests')
  );
}

/**
 * Check if file is an example file
 */
export function isExampleFile(relPath: string, nameLower: string): boolean {
  const pathLower = relPath.toLowerCase();

  const exampleDirs = [
    '/example/',
    '/examples/',
    '/demo/',
    '/demos/',
    '/sample/',
    '/samples/',
  ];
  if (
    exampleDirs.some(
      (dir) => pathLower.includes(dir) || pathLower.startsWith(dir.slice(1)),
    )
  ) {
    return true;
  }

  const examplePatterns = [
    'example',
    'demo',
    'sample',
    'tutorial',
    'playground',
  ];
  return examplePatterns.some((pattern) => nameLower.includes(pattern));
}

/**
 * Check if file is generated or from vendor
 */
export function isGeneratedOrVendor(relPath: string): boolean {
  const pathLower = relPath.toLowerCase();

  const generatedDirs = [
    '/generated/',
    '/gen/',
    '/auto/',
    '/__generated__/',
    '/dist/',
    '/build/',
    '/out/',
  ];
  const vendorDirs = [
    '/vendor/',
    '/third_party/',
    '/node_modules/',
    '/bower_components/',
  ];

  const allDirs = [...generatedDirs, ...vendorDirs];

  if (
    allDirs.some(
      (d) => pathLower.includes(d) || pathLower.startsWith(d.slice(1)),
    )
  ) {
    return true;
  }

  const generatedPatterns = [
    '.generated.',
    '.auto.',
    '.g.',
    '_generated',
    '_gen',
  ];
  return generatedPatterns.some((pattern) => pathLower.includes(pattern));
}
