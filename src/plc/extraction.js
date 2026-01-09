/**
 * PLC Extraction Module - Re-exports for backward compatibility
 */

export { PrimitiveExtractor, EXTRACTION_CONFIG, PLC_TYPES } from './PrimitiveExtractor.js';
export { PathOptimizer } from './PathOptimizer.js';
export { PLCOutputGenerator } from './PLCOutputGenerator.js';

// Default export for backward compatibility
import PrimitiveExtractor from './PrimitiveExtractor.js';
export default PrimitiveExtractor;
